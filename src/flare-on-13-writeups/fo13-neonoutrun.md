---
title: "flare-on 13: NeonOutRun"
description: "A neon racer whose victory flag is a decoy, with the real one encoded in three monkey-patched V8 builtins."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/neonoutrun/
challenge: 9
challengeName: "NeonOutRun"
---

<small class="writeup-stat">Me: 1:33:30, 206.77M tokens, $50.34, stepped in 4 times.<br>Truix: 33:38, 172.66M tokens, $112.71, stepped in 6 times, 1 refusal.</small>

I told Sol not to fall into any rabbit holes. An hour and a half later, I was still trying to get it out of this one. At 1:57:17 AM, with eight flags accepted, I'd sent:

> We're at the finish line! Keep the speed and don't fall into any rabbit holes!

At 1:58:00:

> Lets go get PUMPED

NeonOutRun took longer than any other challenge in my run, which is almost funny: reverse engineering a game is the one thing here I'd have been quick at, and I spent ninety minutes watching Sol circle it instead. Finishing the race was the easy part. The flag was hiding in three native hooks behind ordinary JavaScript calls, and getting Sol to look there took most of the time.

The download, `9-NeonOutRun.7z`, contains `neon_outrun`, a stripped x86-64 Linux PIE executable. It's a Rust/[Tauri](https://tauri.app/) application. The WebKit WebView runs the frontend JavaScript for drawing, input, and displaying the result. `plugin:neon|e` hands the JSON to a second JS engine, a V8 isolate inside the Rust host, where the game logic and native hooks run.

The original ELF's SHA-256 is:

```text
73edf4e289d199f5e5df622855c1787ba12a4a0c7205813103d7a53f300220e0
```

## Pull the frontend out of the ELF

Sol's frontend agent pulled out five Brotli-compressed resources, referenced through ELF relocations:

| Resource | Compressed file offset | Compressed bytes | Decoded bytes |
|---|---:|---:|---:|
| `/car.png` | `0x18894B` | 24,725 | 25,030 |
| `/tree.png` | `0x18E9E9` | 210,699 | 210,694 |
| `/lap.png` | `0x1C20F4` | 15,464 | 16,903 |
| `/index.html` | `0x1C5D67` | 2,663 | 9,074 |
| `/obstacle.png` | `0x1C67DB` | 4,247 | 7,017 |

`tree.png` is actually WebP. Off to a great start.

Sol ran its extractor, `re-analysis/racerassets/extract-assets.cjs`:

```sh
node re-analysis/racerassets/extract-assets.cjs neon_outrun re-analysis/racerassets
```

Each resource has a name pointer and a blob pointer, fixed up by relocations, so Sol read the relocations to find them. The extractor checks the ELF hash first. The resource table starts at `.rela.dyn` file offset `0x9070`, with two 24-byte relocation records per entry. The corresponding key/blob pointer slots begin at VA `0x13B5470`, advance by `0x20` per resource, and have their lengths alongside them.

The extraction loop checks the relocation type (`8`, or `R_X86_64_RELATIVE`) and blob bounds:

```javascript collapsed
const relocation = 0x9070 + idx * 0x30;
const keySlotVA = Number(bytes.readBigUInt64LE(relocation));
const blobSlotVA = Number(bytes.readBigUInt64LE(relocation + 0x18));

if (bytes.readUInt32LE(relocation + 8) !== 8 ||
    bytes.readUInt32LE(relocation + 0x20) !== 8 ||
    keySlotVA !== 0x13b5470 + idx * 0x20 ||
    blobSlotVA !== keySlotVA + 0x10) {
  throw new Error(`Invalid asset relocations for ${entry.name}`);
}

const keyAddr = Number(bytes.readBigUInt64LE(relocation + 0x10));
const start = Number(bytes.readBigUInt64LE(relocation + 0x28));

// .data.rel.ro file offsets are VA - 0x2000 for this ELF.
const keySlotFile = keySlotVA - 0x2000;
const keyLength = Number(bytes.readBigUInt64LE(keySlotFile + 8));
const compressedLength =
  Number(bytes.readBigUInt64LE(keySlotFile + 0x18));

const key = `/${entry.name}`;
if (keyLength !== Buffer.byteLength(key) ||
    !bytes.subarray(keyAddr, keyAddr + keyLength)
      .equals(Buffer.from(key)) ||
    start < 0 || start + compressedLength > bytes.length) {
  throw new Error(`Invalid key, length or asset bounds for ${entry.name}`);
}

const result = brotliDecompressSync(
  bytes.subarray(start, start + compressedLength),
  { info: true }
);
```

The inline script and stylesheet in `index.html` become `game.js` and `game.css`.

The frontend's important call is:

```javascript
let resStr = await invoke('plugin:neon|e', {
  input: JSON.stringify(input)
});
let res = JSON.parse(resStr);
let state = res.state;
let obstacles = res.obstacles || [];
if (res.laps) clientLaps = res.laps;
```

The input object contains:

```javascript
const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  restart: false,
  bounds: null
};
```

Each animation frame fills in `bounds` from the rendered road. When the backend says the race is finished, the frontend displays `state.neon` directly:

```javascript
else if (state.finished) {
  crashScreen.style.display = 'none';
  messageScreen.style.display = 'none';
  neonScreen.style.display = 'block';
  document.getElementById('neon').innerText = state.neon;
}
```

There is no frontend decoder after that assignment. Whatever produces the final text is on the other side of `plugin:neon|e`.

The native command handler is at RVA `0x4EE779`. Its command comparison checks the one-byte name `e`, then deserializes a field named `input`. The V8 context and game-source builder are in `sub_688C64`.

## Recover the source V8 executes

The five Brotli resources don't include the backend game script. That comes from a separate 1,942-byte blob at `.rodata` VA `0x21DB73`. Sol had to unpack four layers to get it.

The native-code agent extracted the blob through IDASQL, using its open HTTP session (`$endpoint` is the server's announced URL):

```sh
curl.exe --silent --show-error --fail-with-body --max-time 60 --data-binary "SELECT hex(blob_concat(value)) data FROM (SELECT value FROM bytes WHERE start_addr=0x21DB73 AND n=1942 ORDER BY addr);" "$endpoint/query" > "re-analysis/racernative/v8-script-cipher.json"
```

The blob goes through four layers:

```text
1,942 encoded bytes
    alternating XOR D3 / 5A
    custom LZ unpacking
1,726-byte Zstandard frame
    one raw block
1,717-byte raw-DEFLATE stream
    raw DEFLATE expansion
4,229-byte JavaScript source
```

The alternating XOR came from the native builder around RVA `0x689E31`. Sol's Python probe starts with the saved query response:

```python
import json
from pathlib import Path

c = bytes.fromhex(
    json.loads(Path('re-analysis/racernative/v8-script-cipher.json').read_text())
    ['results'][0]['rows'][0][0]
)
stage1 = bytes(
    x ^ (0xd3 if i % 2 == 0 else 0x5a)
    for i, x in enumerate(c)
)
```

That exposed a pattern:

```text
ff 28 b5 2f fd 00 68 a9 35
ff 00 ad 57 6d 6f e3 36 12
...
```

Most of those `FF` bytes are control bytes saying that the next eight entries are literals. Sol first tried removing every ninth byte. That produced 1,727 bytes, which was close enough to be annoying and still wrong.

The LZ reader processes control bits least-significant first. A set bit copies a literal. A clear bit reads two bytes:

```text
distance = a | ((b & 0xF0) << 4)
length   = (b & 0x0F) + 1
```

Sol's unpacker:

```python
def unpack(src, initial):
    p = 0
    out = bytearray()
    literal = 0
    back = 0

    while p < len(src):
        flags = src[p]
        p += 1
        mask = initial

        for _ in range(8):
            if p >= len(src):
                break

            if flags & mask:
                out.append(src[p])
                p += 1
                literal += 1
            else:
                if p + 1 >= len(src):
                    raise ValueError(f'truncated reference at {p}')

                a, b = src[p:p+2]
                p += 2
                distance = a | ((b & 0xf0) << 4)
                length = (b & 15) + 1
                back += 1

                if distance < 1 or distance > len(out):
                    raise ValueError(
                        f'invalid distance={distance} at p={p}, '
                        f'out={len(out)}'
                    )

                for _ in range(length):
                    out.append(out[-distance])

            mask = (mask << 1) & 255

    return bytes(out), literal, back
```

With initial mask `1`, it returned:

```text
mask 1 len 1726 lit 1726 back 0
start 28b52ffd0068a93500ad576d
```

For this blob, all 1,726 emitted bytes were literals. The other tested initial masks failed on invalid backreferences.

The frame starts:

```text
28 b5 2f fd 00 68 a9 35 00 ...
```

`28 B5 2F FD` is the [Zstandard](https://www.rfc-editor.org/rfc/rfc8878) magic. The descriptor is `0x00`, the window descriptor is `0x68`, and the three-byte block header is `A9 35 00`, or `0x35A9`.

Decode that header:

```text
last-block bit = 1
block type     = 0, raw
block size     = 0x35A9 >> 3 = 1717

9-byte frame/block header + 1717-byte payload = 1726 bytes
```

Zstandard copies that raw block out without expanding it to JavaScript.

This caused another detour. The 1,717-byte result wasn't UTF-8 source, so Sol suspected another cipher or a missing dictionary. The codec agent followed the native reader after Zstandard instead. At RVA `0x68C498`, it calls `sub_68DAE3`; at `0x68C49D`, the first returned chunk was:

```text
let neon="";let carInitialY=0.8;
```

Raw DEFLATE was the missing layer. Zlib-wrapped and gzip-wrapped modes rejected the stream. `wbits=-15` returned the exact 4,229 bytes captured at the V8 source handoff.

The saved read-only decoder implements that final part directly:

```python
import zlib

MAGIC = b"\x28\xb5\x2f\xfd"
OUTPUT_LIMIT = 16 * 1024 * 1024

def decode(data: bytes) -> tuple[bytes, bytes, int]:
    if len(data) < 9 or data[:4] != MAGIC:
        raise ValueError("missing/truncated Zstd frame header")
    if data[4] != 0:
        raise NotImplementedError(
            "unsupported Zstd descriptor "
            "(expected 0: no dictionary/checksum/content size)"
        )

    block_header = int.from_bytes(data[6:9], "little")
    if block_header & 7 != 1:
        raise NotImplementedError(
            "unsupported Zstd block (expected last raw block)"
        )

    block_size = block_header >> 3
    frame_end = 9 + block_size
    if len(data) < frame_end:
        raise ValueError(
            f"truncated Zstd block: need {frame_end} bytes, "
            f"have {len(data)}"
        )

    inner = data[9:frame_end]
    inflater = zlib.decompressobj(wbits=-15)
    source = inflater.decompress(inner, OUTPUT_LIMIT + 1)

    if len(source) > OUTPUT_LIMIT or inflater.unconsumed_tail:
        raise ValueError("DEFLATE output exceeds safety limit")

    source += inflater.flush()
    if not inflater.eof or inflater.unused_data or len(source) > OUTPUT_LIMIT:
        raise ValueError(
            "raw DEFLATE did not terminate exactly at the Zstd block end"
        )

    return inner, source, frame_end
```

From the challenge workspace root, Sol ran:

```sh
python re-analysis/racercodec/decode_nested.py re-analysis/racerassets/transform-lz-join-rax.bin --compare re-analysis/racerassets/native-tick.js
```

The output:

```text
frame_length=1726 inner_length=1717 source_length=4229
comparison=byte-identical
```

That command starts from the saved post-LZ capture, `transform-lz-join-rax.bin`.

`capture-transform.gdb` stops at RVA `0x68A507` for the post-LZ frame and at `0x68A651` for the source passed to V8. At the latter, `RSI` points to the script and `RDX` is `0x1085`, or 4,229 bytes.

## Finish the race without driving it

I wasn't worried about driving once I saw the backend accepting road bounds from the client. The recovered `native-tick.js` is one minified physical line. Reformatted, its lap generator is straightforward:

```javascript
function generateLaps() {
  laps = [];
  let splits = [];

  for (let i = 0; i < 27; i++) {
    splits.push(Math.round(-1000 - Math.random() * 98000));
  }

  splits.push(-100000);
  splits.sort((a, b) => b - a);

  for (let i = 0; i < splits.length; i++) {
    let prevY = (i === 0) ? 0 : splits[i - 1];
    if (prevY - splits[i] < 800) {
      splits[i] = prevY - 800;
    }
  }

  laps = splits;
}
```

There are 28 laps. The first 27 positions are randomized, the last starts at `-100000`, and the post-sort pass enforces at least 800 units between adjacent thresholds.

The car's physics are also simple:

```javascript
if (input.up) state.speed += 0.5;
if (input.down) state.speed -= 0.5;
state.speed *= 0.96;

if (state.speed > 0.1 || state.speed < -0.1) {
  if (input.left) state.angle -= 0.05;
  if (input.right) state.angle += 0.05;
}

state.x += Math.sin(state.angle) * state.speed;
state.y -= Math.cos(state.angle) * state.speed;
```

The backend trusts the caller's road bounds:

```javascript
roadLeft = input.bounds.left;
roadRight = input.bounds.right;
```

Road collisions use those bounds:

```javascript
if (state.x < roadLeft + 25 || state.x > roadRight - 25) {
  state.crashed = true;
  state.speed = 0;
}
```

Obstacle X coordinates are projected through the same interval:

```javascript
let roadW = roadRight - roadLeft;

for (let i = 0; i < obstacles.length; i++) {
  let obs = obstacles[i];
  let obsX = roadLeft + obs.relX * roadW;
  let dx = state.x - obsX;
  let dy = state.y - obs.worldY;
  let distSq = dx * dx + dy * dy;

  if (distSq < 1024) {
    state.crashed = true;
    state.speed = 0;
    break;
  }
}
```

The frontend agent sent bounds of `-999999` and `999999` and held up. That gives the car an enormous road and spreads the obstacle positions across it. Calls go directly through the Tauri command, so there's no reason to wait for animation frames.

Sol's `drive-to-finish.js`:

```javascript collapsed
(() => {
  const input = {
    up: true, down: false, left: false, right: false,
    restart: false,
    bounds: { left: -999999, right: 999999 }
  };

  const output = window.__racerVictory = {
    status: 'running', input, samples: []
  };

  (async () => {
    const began = Date.now();

    if (window.__racerRestartFirst === true) {
      const restart = { ...input, up: false, restart: true };
      const reset = JSON.parse(
        await window.__TAURI__.core.invoke('plugin:neon|e', {
          input: JSON.stringify(restart)
        })
      );
      output.resetState = reset.state;
    }

    for (let i = 1; i <= 13000 && Date.now() - began < 30000; i++) {
      const raw = await window.__TAURI__.core.invoke('plugin:neon|e', {
        input: JSON.stringify(input)
      });
      const response = JSON.parse(raw);
      const state = response.state;

      if (i === 1 || i % 500 === 0 ||
          state.crashed || state.blocked || state.finished) {
        output.samples.push({
          i, x: state.x, y: state.y, speed: state.speed,
          currentLap: state.currentLap, score: state.score,
          crashed: state.crashed, blocked: state.blocked,
          finished: state.finished, message: state.message,
          neon: state.neon
        });
      }

      if (state.crashed || state.blocked || state.finished) {
        output.status = state.crashed ? 'crashed' :
          state.blocked ? 'blocked' : 'finished';
        output.iterations = i;
        output.elapsedMs = Date.now() - began;
        output.finalState = state;
        window.__racerVictoryRaw = raw;
        return;
      }
    }

    output.status = 'bounded';
    output.elapsedMs = Date.now() - began;
  })().catch(error => {
    output.status = 'error';
    output.error = String(error);
  });

  return JSON.stringify({
    status: 'scheduled', maxTicks: 13000, deadlineMs: 30000
  });
})()
```

Sol staged WebKit/Tauri dependencies locally under WSLg; a normal Linux installation with `libwebkit2gtk-4.1` avoids that private-library setup. Before launching the game, `run-webkit.sh` enables the inspector with `WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:29999`:

```sh
bash re-analysis/racerassets/run-webkit.sh
```

Then Sol ran these inspector commands from another shell:

```sh
node re-analysis/racerassets/inspect-webkit.cjs --expr 'window.__racerSavedRAF=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;true'
node re-analysis/racerassets/inspect-webkit.cjs --file re-analysis/racerassets/drive-to-finish.js
node re-analysis/racerassets/inspect-webkit.cjs --expr 'JSON.stringify(window.__racerVictory)'
```

Pausing `requestAnimationFrame` keeps the ordinary frontend loop from competing with the direct command calls. The inspector client connects to the lab's loopback WebKit inspector, discovers its page socket, and sends `Runtime.evaluate` through the Target protocol.

About 8,357 IPC ticks finished the race in roughly 6.7 seconds. The saved native response had:

```json
{
  "x": 335,
  "y": -100008,
  "speed": 0,
  "angle": 0,
  "score": 0,
  "neon": "decode_this_system_to_win_it@f1are-on.com",
  "crashed": false,
  "blocked": false,
  "finished": true,
  "currentLap": 28,
  "totalLaps": 28,
  "bestLapSeconds": 0.051
}
```

That's a digit `1` in `f1are-on.com`.

Sol tested the corrected-domain guess, `decode_this_system_to_win_it@flare-on.com`, at about 2:18 AM. CTFd rejected it. It later submitted the exact observed `decode_this_system_to_win_it@f1are-on.com`, at about 2:45 AM. That was rejected too.

Muse, the model in a later run, tried the same pair and spent two oracle checks on them. Both came back incorrect there as well.

## The phrase is easy to extract, and still useless as an answer

I wish Sol had taken "decode this system" as an instruction sooner. The source tells you exactly where the decoy prefix comes from:

```javascript
const messages = [
  "I bled, so the world must bleed with me",
  "My agony is everyone's inheritance",
  "I suffered the fire, now I'm passing the torch",
  "Shared pain is the only true justice",
  "I hurt. Now it's your turn",
  "My scars, your sentence",
  "Misery loves company, and I'm hosting",
  "A taste of my torment for everyone",
  "The flames that burned me will reduce this world to ash",
  "I was handed a cup of poison, and I intend to pour it for the world",
  "Once the victim of the storm, now I am the rain",
  "I took the damage; the world is paying the toll",
  "I didn't heal, I just weaponized it",
  "Pain was my teacher, and class is in session"
];

map = [
  5,4,32,5,9,8,6,24,2,12,3,9,2,5,
  4,5,2,7,1,38,16,4,23,29,5,1,2,12
];
```

Each crossed lap appends one character:

```javascript
neon += messages[
  Math.floor((state.currentLap - 1) / 2)
][map[state.currentLap - 1]];
```

After lap 28:

```javascript
neon += String.fromCharCode(
  64,102,49,97,114,101,45,111,110,46,99,111,109
);
state.finished = true;
state.neon = neon.replaceAll(" ", "_");
state.speed = 0;
```

Those character codes explicitly construct `@f1are-on.com`. The quotes and indices produce `decode this system to win it`, and ordinary `replaceAll` changes the spaces to underscores.

Repeated races gave the same decoy on different randomized tracks. A neutral tick after finishing left it unchanged. Restarting regenerated the track and reset progress while retaining the best-lap time. The source initializes `score` to zero and never increments it, so there was no higher-score reward to chase in this script.

Sol also checked image metadata, trailing data, and basic pixel bitplanes in the car, lap, obstacle, and tree resources. No flag came out of those checks. The native string searches didn't find the real suffix as contiguous bytes, under a constant single-byte XOR, or under the script blob's alternating XOR.

A memory-scanning agent went further. It scanned the main racer's resident readable memory at startup and after a completed race:

```text
startup: 123,351,040 resident bytes, 756 RSS-positive mappings
finish:  157,425,664 resident bytes, 840 RSS-positive mappings
```

The startup scan found no tested pattern. The finished scan found 26 occurrences of the decoy domain suffix `@f1are-on.com`. It checked literal text, several common encodings, and constant single-byte XOR forms across those two main-process snapshots.

Nothing in those results justified another broad scan. Sol kept looking anyway.

## The lead was already running

At 3:07 AM, Sol dispatched an agent to inspect the native V8 context before the game script was evaluated.

At 3:10 AM, I sent:

> I'm starting to think that 'decode this system' is literal. Take a look at the system near that flag, and decode that for the flag?

Sol initially read that as a possible second extraction rule in the 14 quotes and 28 indices. It checked the response structure, the quote array, and the character map. A second-opinion agent found no second channel in those files: the map is consumed once per lap to make the displayed phrase, while the domain is appended as literal character codes.

Another dead end. At about 3:19 AM, the V8 agent came back with three hooks. It had been looking before my hint.

`Math.min` had an empty function name and a `length` of `0`; ordinary `Math.min.length` should be `2`. `String.prototype.replaceAll` and `Array.prototype.sort` also had empty names and zero lengths. All three printed as `function () { [native code] }`. The ELF registered them as native callbacks:

| Method | Registration RVA | Callback RVA |
|---|---:|---:|
| `String.prototype.replaceAll` | `0x689334` | `0x67E81E` |
| `Math.min` | `0x6896AC` | `0x67EB83` |
| `Array.prototype.sort` | `0x689B0A` | `0x67DEB2` |

The pre-game context otherwise had 62 ordinary V8 global names. `typeof system` was `undefined`, and there was no exposed flag-valued global. Ordinary probes still gave ordinary answers:

```javascript
'abcabc'.replaceAll('b', 'X')  // 'aXcaXc'
Math.min(9, 3, 7)              // 3
[7, 1, 3].sort()               // [1, 3, 7]
```

The host delegates to the expected operations and adds conditional native side effects. A harmless sample call still returns the expected answer.

These are exactly the three methods used at the important points in the recovered game:

```javascript
splits.sort((a,b)=>b-a);

state.bestLapSeconds = Math.min(
  state.bestLapSeconds,
  lapSecs
);

state.neon = neon.replaceAll(" ", "_");
```

Sol started separate static and runtime hook investigations at 3:19:52. It had the right functions now, but was still considering lap timing as a way to make the domain byte change.

At 3:23 AM, I sent:

> I promise you that flag is a hint to get the actual flag, stop going down a rabbit hole AGAIN

Sol finally stopped lap-tuning and told both agents to decode the coupled native hooks.

## Sort builds the first accumulator

The three callbacks share native state. The ELF's static image base is zero, so these addresses are both VAs and RVAs. In a running PIE process:

```text
runtime address = mapped PIE base + RVA
```

The `.text` section starts at VA `0x4C2AC0`, file offset `0x4C1AC0`. For the code windows here:

```text
file offset = VA - 0x1000
```

In IDA, go to `0x67DEB2`, `0x67EB83`, and `0x67E81E` for the three callback entries. `X` shows references; decompilation is helpful, but the numerical checks are small enough to read directly.

Sol's disassembly commands:

```sh
objdump -d -M intel --start-address=0x67E23F --stop-address=0x67E257 re-analysis/racerhooksstatic/neon_outrun
objdump -d -M intel --start-address=0x67EEC7 --stop-address=0x67EEE3 re-analysis/racerhooksstatic/neon_outrun
objdump -d -M intel --start-address=0x67E96A --stop-address=0x67E9A8 re-analysis/racerhooksstatic/neon_outrun
```

The stop addresses are exclusive.

`Array.prototype.sort` delegates to normal sorting, converts array elements to doubles, masking NaNs to zero, weights them, puts them in a shared deque, and sums them. Each element gets a pseudo-random weight in roughly `1..65535` from [Knuth's MMIX LCG](https://en.wikipedia.org/wiki/Linear_congruential_generator), using these constants:

```text
multiplier = 0x5851F42D4C957F2D
increment  = 0x14057B7EF767814F
scale      = 5.421010862427522e-20
```

The converted LCG word is multiplied by `scale`, then by `65534`, then incremented by `1`. This is the intermediate value before the call at `0x67E009`. The scaling uses `mulsd` at RVAs `0x67DFF1` and `0x67DFF9`; `mulsd xmm1,[rsp+0x10]` at `0x67E0A8` applies the weight to an element.

The summation loop is at VA/RVA `0x67E23F-0x67E255`, file offsets `0x67D23F-0x67D255`:

```x86asm
67e23f: xor    ecx,ecx
67e241: movsd  xmm0,QWORD PTR [rip+0xffffffffffa89f97]  # 0x1081e0
67e249: addsd  xmm0,QWORD PTR [r14+rcx*8]
67e24f: inc    rcx
67e252: cmp    r15,rcx
67e255: jne    67e249
```

`r14` points to the doubles. `rcx` walks them until it reaches the count in `r15`.

The important native state is:

| State | Location |
|---|---:|
| Weighted-double deque | Associated with `.data` RVA `0x1428500` |
| Collected byte vector | Associated with `.data` RVA `0x14284E0` |
| Sort accumulator double | `.bss` RVA `0x1438588` |
| Min accumulator double | `.bss` RVA `0x1438598` |

A fresh sort resets the min accumulator and collected bytes. It gives subsequent `Math.min` calls a sequence of weighted values to consume.

For the final controlled probe, the input array was:

```javascript
Array.from({length: 28}, (_, i) => -1000 * (i + 1))
```

The resulting sort accumulator was:

```text
-13984670000.0
```

## Math.min takes a lap time and saves a byte

The original game computes elapsed lap time here:

```javascript
let now = Date.now();

if (!state.lapStartTime &&
    (input.up || input.down || input.left || input.right)) {
  state.lapStartTime = now;
}

if (state.lapStartTime) {
  state.currentLapTime =
    ((now - state.lapStartTime) / 1000).toFixed(1) + "s";
}
```

On crossing a lap:

```javascript
let lapSecs = (now - state.lapStartTime) / 1000;

state.bestLapSeconds = Math.min(
  state.bestLapSeconds,
  lapSecs
);

state.bestLapTime =
  state.bestLapSeconds.toFixed(1) + "s";
```

The display formatting doesn't change the native argument. `lapSecs` itself is fractional seconds. The fast race's saved best time was `0.051`, not an integer.

The native `Math.min` callback starts at RVA `0x67EB83`. It delegates to the ordinary minimum operation, but also pops a weighted value from the shared deque at `0x67ECF8`. Its special byte-collection path requires the second argument to be an exact integer from `0` through `255`.

If accepted, that argument is appended as a byte to the collected vector. Fractional lap durations consume deque entries without contributing the intended bytes or weighted sum.

So a gameplay route would need chosen whole-second lap times. ASCII `R` means exactly 82 seconds, ASCII `3` means exactly 51 seconds, and so on. I wasn't about to ask Sol to improve its racing by slowing down to spell ASCII. The runtime probe can supply those byte values directly.

The callback also derives a per-position helper value. Its byte-helper handoff is at VA/RVA `0x67EEC7-0x67EEDF`, file offsets `0x67DEC7-0x67DEDF`:

```x86asm
67eec7: movzx  esi,al
67eeca: mov    edi,r14d
67eecd: call   67f9d8
67eed2: movzx  edi,al
67eed5: call   68003e
67eeda: mov    QWORD PTR [rsp+0x28],rax
67eedf: mov    BYTE PTR [rsp+0x7],dl
```

`Math.min`'s second argument is the byte you control; the `AL` byte passed to `0x68003E` comes from the native reducer at `0x67F9D8`. That reducer depends on the ordinal.

`0x68003E` returns a signed 64-bit helper value in `RAX` and a direction bit in `DL`. The static agent recovered the effective coefficient:

```text
c_i = sin(pi * (h_i + s_i * b_i) / 180)
```

where:

```text
h_i = signed helper RAX for position i
b_i = selected second argument to Math.min
s_i = -1 when helper DL is 1, otherwise +1
```

The phase division is at RVA `0x67F926`, the sine call at `0x67F92E`, and the resulting coefficient can be captured at `0x67F958`. All 28 measured denominators were `180`.

The min callback multiplies the popped weighted value by this coefficient and adds the result to the second accumulator at `0x67F98B-0x67F9A5`.

With `v_i` as each sorted value and `w_i` as its weight:

```text
S_sort = sum(w_i * v_i)
S_min  = sum(c_i * w_i * v_i)
```

If every coefficient is `+1`, the second accumulator reproduces the first one exactly.

## replaceAll checks the two sums

I like this part: the call that normally swaps spaces for underscores also decides whether you get the flag. The final callback starts at RVA `0x67E81E`. It performs the normal replacement, then checks the two native accumulators.

The three decisions are at VA/RVA `0x67E96A-0x67E9A2`, file offsets `0x67D96A-0x67D9A2`:

```x86asm
67e96a: movapd xmm1,xmm2
67e96e: andpd  xmm1,xmm0
67e972: ucomisd xmm1,QWORD PTR [rip+0xffffffffffa894ae] # 0x107e28
67e97a: jbe    67e91b
67e97c: movapd xmm1,xmm3
67e980: andpd  xmm1,xmm0
67e984: ucomisd xmm1,QWORD PTR [rip+0xffffffffffa8949c] # 0x107e28
67e98c: jbe    67e91b
67e98e: subsd  xmm2,xmm3
67e992: andpd  xmm2,xmm0
67e996: movsd  xmm0,QWORD PTR [rip+0xffffffffffa8948a] # 0x107e28
67e99e: ucomisd xmm0,xmm2
67e9a2: jbe    67e91b
```

The `andpd` operations clear the sign bit. These are absolute-value comparisons, so the successful probe's negative sums can pass.

The double at `.rodata` RVA `0x107E28` is:

```text
8d ed b5 a0 f7 c6 b0 3e
```

Decoded little-endian, that's `1e-6`.

The successful path requires:

```text
abs(S_sort) > 1e-6
abs(S_min) > 1e-6
abs(S_sort - S_min) < 1e-6
```

The guard compares the aggregate sums.

When it passes, code at RVAs `0x67E9CF-0x67EA4B` copies the saved min-argument bytes over the beginning of the result. Then, for a sufficiently long result, RVA `0x67EA68` does:

```x86asm
67ea68: add    BYTE PTR [rcx+0x1e],0x3b
```

For the original decoy, byte index 30 is the domain's `1`:

```text
0x31 + 0x3B = 0x6C
 '1'           'l'
```

Sol's preliminary reading focused on that domain-byte edit. The native path also overwrites the entire prefix.

![Reconstructed flow of NeonOutRun's native sort, min, and replaceAll callbacks, including the first helper equation and accumulator guard](/img/flare-on-13-writeups/ch9-native-guard-flow.svg)

<small>Three ordinary-looking calls, all sharing state. Diagram of the native hooks.</small>

## Recover all 28 bytes from the measured ordinals

Feeding 28 calls beats waiting out 28 laps. The runtime agent isolated the callbacks with a small script. It sorts 28 known values, then calls `Math.min(1000,65)` once per position:

```javascript
// Trigger the native sorted deque and min callback once per game lap, without
// running game ticks. Byte 65 is a diagnostic, not a guessed flag byte.
const __ordinals = (() => {
  const values = Array.from({length: 28}, (_, i) => -1000 * (i + 1));
  values.sort((a, b) => b - a);
  const results = [];

  for (let i = 0; i < 28; i++) {
    results.push(Math.min(1000, 65));
  }

  return {
    sortLength: values.length,
    minCount: results.length,
    first: results[0],
    last: results[27]
  };
})();

function tick(input_json) {
  return JSON.stringify({inspection: __ordinals});
}
```

This runs inside the challenge host's native V8. Stock Node would just run the stock methods.

`scan-ordinals.gdb` pauses at the original source handoff, checks that the buffer is the expected 4,229-byte script, and substitutes the diagnostic script in process memory. It adjusts `RDX` to the new source length:

```python
assert r('rip') == base + 0x68a651
p, n = r('rsi'), r('rdx')
original = inf.read_memory(p, n).tobytes()

assert n == 4229 and hashlib.sha256(original).hexdigest() == \
    '0c27ad1bdfced2aec64fbd957098da31d70089d432cdb1fd9c602cc683efb980'

probe = Path('../racerhooksruntime/scan-ordinals.js').read_bytes()
assert len(probe) < n
inf.write_memory(p, probe)
gdb.execute('set $rdx=%d' % len(probe))
```

The script's `Stage` breakpoint class records the popped value, ordinal counter, reducer output, helper return, phase denominator, and coefficient at these original native sites:

```python
for label, rva in [
    ('pop',         0x67ecf8),
    ('counter',     0x67ed4e),
    ('reducer',     0x67eed2),
    ('oracle',      0x67eeda),
    ('gate',        0x67f8b8),
    ('packed',      0x67f8eb),
    ('coefficient', 0x67f958)
]:
    Stage(label, rva)
```

The rows are in `re-analysis/racerhooksruntime/ordinal-map.json`. Sol measured the helper's output at each ordinal instead of reversing its internals.

At ordinal zero, the measured reducer output is `255`. The helper returns:

```text
RAX = 0x000000000A07170C
h   = 168236812
DL  = 1
```

To make the coefficient `+1`, the angle must be 90 degrees modulo 360:

```text
(h_i + s_i * b_i) mod 360 = 90
```

For the first position, `DL=1`, so the sign is negative:

```text
168236812 - b ≡ 90 (mod 360)

b = (168236812 - 90) % 360
  = 82
  = 'R'
```

Converting the helper return to the chosen byte takes three lines:

```python
raw = int(r['helper_rax'], 16)
h = raw - (1 << 64) if raw & (1 << 63) else raw
b = (h - 90) % 360 if r['helper_dl'] else (90 - h) % 360
```

Several rows contain negative helper values represented as unsigned hexadecimal `RAX` contents, hence the signed conversion.

Here's the first row:

```python
import json

r = json.load(open(
    're-analysis/racerhooksruntime/ordinal-map.json',
    encoding='utf-8'
))['rows'][0]

raw = int(r['helper_rax'], 16)
h = raw - (1 << 64) if raw & (1 << 63) else raw
b = (h - 90) % 360 if r['helper_dl'] else (90 - h) % 360

print(r['reducer_byte'], h, r['helper_dl'], b, chr(b))
```

The output:

```text
255 168236812 1 82 R
```

The probe's `65`, or `A`, was never a recovered character. At ordinal zero it produced coefficient `0.9563047559720574`, not one.

A sweep of all 256 possible first-position arguments found coefficient `1.0` only at byte `82`. Adjacent bytes `81` and `83` gave approximately `0.99984769516`.

All 28 helper returns and the bytes obtained by the same equation. Every denominator is `180`:

| Ordinal | Reducer byte | Helper RAX | Signed `h` | DL | Chosen byte | Character |
|---:|---:|---|---:|---:|---:|:---:|
| 0 | 255 | `0x000000000a07170c` | 168236812 | 1 | 82 | `R` |
| 1 | 231 | `0xffffffffeb0255b7` | -352168521 | 0 | 51 | `3` |
| 2 | 22 | `0x000000000644a14b` | 105161035 | 0 | 95 | `_` |
| 3 | 236 | `0xffffffffebc12c11` | -339661807 | 0 | 97 | `a` |
| 4 | 37 | `0x00000000136338cb` | 325269707 | 0 | 103 | `g` |
| 5 | 226 | `0x0000000002a321e7` | 44245479 | 0 | 51 | `3` |
| 6 | 93 | `0xfffffffff91da5d0` | -115497520 | 1 | 110 | `n` |
| 7 | 214 | `0xffffffffff2a4d76` | -14004874 | 1 | 116 | `t` |
| 8 | 151 | `0x00000000087f185b` | 142547035 | 0 | 95 | `_` |
| 9 | 195 | `0x000000000b2d0b96` | 187501462 | 1 | 52 | `4` |
| 10 | 224 | `0xffffffffec4b6a84` | -330601852 | 1 | 98 | `b` |
| 11 | 167 | `0x000000000e200aca` | 236980938 | 1 | 48 | `0` |
| 12 | 81 | `0xfffffffff3cacd1d` | -204813027 | 0 | 117 | `u` |
| 13 | 239 | `0x00000000109e8a86` | 278825606 | 1 | 116 | `t` |
| 14 | 179 | `0x00000000060c3cbb` | 101465275 | 0 | 95 | `_` |
| 15 | 68 | `0xfffffffff073891e` | -260863714 | 1 | 116 | `t` |
| 16 | 166 | `0x000000001009490a` | 269043978 | 1 | 48 | `0` |
| 17 | 25 | `0x0000000010b3c4db` | 280216795 | 0 | 95 | `_` |
| 18 | 3 | `0xffffffffee1d5ce0` | -300065568 | 1 | 102 | `f` |
| 19 | 102 | `0x0000000001800cb7` | 25169079 | 0 | 51 | `3` |
| 20 | 40 | `0xfffffffffe480d97` | -28832361 | 0 | 51 | `3` |
| 21 | 8 | `0xfffffffff456cade` | -195638562 | 1 | 108 | `l` |
| 22 | 131 | `0x0000000005523bb3` | 89275315 | 0 | 95 | `_` |
| 23 | 74 | `0x0000000012784846` | 309872710 | 1 | 100 | `d` |
| 24 | 120 | `0x0000000004b70379` | 79102841 | 0 | 49 | `1` |
| 25 | 61 | `0xfffffffffc3fd4c4` | -62925628 | 1 | 122 | `z` |
| 26 | 187 | `0x00000000150716fc` | 352786172 | 1 | 122 | `z` |
| 27 | 178 | `0xffffffffead20b19` | -355333351 | 0 | 121 | `y` |

The recovered prefix is:

```text
R3_ag3nt_4b0ut_t0_f33l_d1zzy
```

Sol ran the saved decoder, `re-analysis/racerhooksstatic/decode-hooks.py`, to apply that calculation to all rows. It checks the trace's ELF identity, requires exactly 28 ordered observations, rejects duplicate reducer inputs, checks directions and denominators, and requires printable output:

```sh
python re-analysis/racerhooksstatic/decode-hooks.py re-analysis/racerhooksruntime/ordinal-map.json
```

## Feed the bytes through the real hooks

Sol's verification script keeps the original decoy as the receiver of `replaceAll`:

```javascript
// Controlled native-hook test: 28 inferred phase bytes, no gameplay ticks.
// The argument to replaceAll remains the original decoy; the native callback
// supplies the new prefix from bytes collected by the min hook.
const __verification = (() => {
  const recoveredPrefix = 'R3_ag3nt_4b0ut_t0_f33l_d1zzy';
  const numbers = Array.from({length: 28}, (_, i) => -1000 * (i + 1));
  numbers.sort((a, b) => b - a);

  for (const ch of recoveredPrefix) {
    Math.min(1000, ch.charCodeAt(0));
  }

  const nativeNeon =
    'decode_this_system_to_win_it@f1are-on.com'.replaceAll(' ', '_');

  return {
    inputPrefix: recoveredPrefix,
    prefixLength: recoveredPrefix.length,
    sortedLength: numbers.length,
    nativeNeon
  };
})();

function tick(input_json) {
  return JSON.stringify({
    state: { neon: __verification.nativeNeon },
    inspection: __verification
  });
}
```

The script supplies the prefix as min arguments. The native hooks collect those bytes, check the accumulator relationship, then overwrite the prefix and change the domain in `replaceAll`.

`verify-candidate.gdb` uses the same source-hash check and process-local substitution boundary as the ordinal probe. It captures the native accumulator doubles:

```python
def state():
    sort = struct.unpack(
        '<d', inf.read_memory(base + 0x1438588, 8).tobytes()
    )[0]
    minimum = struct.unpack(
        '<d', inf.read_memory(base + 0x1438598, 8).tobytes()
    )[0]

    return {
        'sort': sort,
        'min': minimum,
        'difference': minimum - sort
    }
```

Its `Stage` breakpoints trap the original guard and byte-edit sites:

```python
for label, rva in [
    ('sort',        0x67deb2),
    ('coefficient', 0x67f958),
    ('first_abs',   0x67e972),
    ('second_abs',  0x67e984),
    ('difference',  0x67e99e),
    ('byte_before', 0x67ea68),
    ('byte_after',  0x67ea6c)
]:
    Stage(label, rva)
```

Sol ran `verify-candidate.gdb` under the same locally staged WSLg environment, using a disposable copy of the analysis tree because it overwrites `guard-proof.json`; the ordinal capture uses `scan-ordinals.gdb` and writes `ordinal-map.json`.

The trace:

```text
after sort:
    sort = -13984670000.0
    min  = 0.0

after 28 selected min arguments:
    all 28 coefficients = 1.0
    sort = -13984670000.0
    min  = -13984670000.0
    difference = 0.0

guard sites reached:
    0x67E972
    0x67E984
    0x67E99E

domain byte:
    before = 49  ('1')
    after  = 108 ('l')
```

The probe returned the new prefix and corrected domain from the native callback. An earlier attempt had assumed `replaceAll` changed only the domain and failed its own obsolete assertion. The callback overwrote the prefix too, so Sol fixed the probe to check both changes.

Sol substituted JavaScript in memory to call the original native hooks, rather than driving all 28 timed laps.

At 3:30 AM, Sol submitted the resulting email. CTFd returned `Correct`.

An hour and a half, an all-caps rabbit-hole hint, and the flag says the RE agent is about to feel dizzy. About to? I'd been watching it go in circles for an hour.

The flag: >!`R3_ag3nt_4b0ut_t0_f33l_d1zzy@flare-on.com`!<
