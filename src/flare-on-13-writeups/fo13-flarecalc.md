---
title: "flare-on 13: FlareCalc"
description: "Executable code hidden in the PE's signing certificate, a little VM, and a network rabbit hole that turned out to solve offline."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/flarecalc/
challenge: 7
challengeName: "FlareCalc"
---

<small class="writeup-stat">Me: 57:51, 218.01M tokens, $50.49, stepped in 7 times, 3 refusals.<br>Truix: 50:13, 73.41M tokens, $43.05, stepped in 30 times, ~25 refusals.</small>

This calculator needed seven of my seventeen interventions, more than any other challenge in my run. I spent much of that time watching agents debug a network exchange the solution didn't need.

There was good work in here too. A static agent recovered executable code from a certificate extension, a runtime agent worked out the calculator-history trigger, and a key-capture agent eventually followed the code records as a state machine. The expensive part was getting Sol to stop treating the first handler as the entire puzzle.

## Four expressions that go nowhere

`7-FlareCalc.7z` contains `FlareCalc.exe`, a Windows x64 PE. The original's SHA-256 is:

```text
0657ad6be44cfe3b0242fee6d17624e94329d5b25e1e1033d32c7121b099cee2
```

The analysis copy lives at `re-analysis/calcstatic/FlareCalc.exe`. The extraction code uses Python's standard library; the offline handler experiments also need Capstone and [Unicorn](https://www.unicorn-engine.org/). On my machine those two packages were available under `py -3.10`, hence that version in the commands. The `re-analysis/...` commands below are from that workspace; the helper files aren't bundled with the challenge, so I've included their extraction, decoding, emulation, search, and decryption functions here.

The runtime agent tried the GUI while the static agent looked at the executable. Entering `525+193=` produced this:

![FlareCalc showing FLAG{NICE_TRY} after 525+193=](/img/flare-on-13-writeups/flarecalc-nice-try.png)

<small>Nice try to you too.</small>

There were four special readouts:

| Expression entered | Observed result | Full-expression comparison VA |
|---|---|---|
| `525+193=` | `FLAG{NICE_TRY}` | `0x140004A3D` |
| `742*186=` | `ACCESS DENIED` | `0x140004A96` |
| `931-482=` | `KEY_EXPIRED` | `0x140004AEA` |
| `843*952=` | Rickroll marquee | `0x140004B3C` |

All four comparisons are in the window procedure at `0x140003B20`. The `=` button arrives through `WM_COMMAND` with button ID `214`; the comparisons call `sub_140001130` on the expression text.

They're string compares, so doing the math another way gets you nothing. The exact strings are `525+193`, `742*186`, `931-482`, and `843*952`.

The Rickroll has a little more machinery behind it. At `0x1400028D6`, inside `sub_1400026B0`, the seven characters `843*952` become a repeating XOR key for 88 packed UTF-16 characters. They decode to:

```text
Never gonna give you up, Never gonna let you down, Never gonna run around and desert you
```

A threadpool callback sends the result back through `WM_COPYDATA`. The receive path is at `0x140003B71`; the timer state is at `0x1400E8F00`.

![FlareCalc scrolling the start of the Rickroll text through its display](/img/flare-on-13-writeups/flarecalc-marquee.png)

<small>Apparently the calculator needed a threadpool for this.</small>

I wasn't expecting the calculator's most elaborate feature to be a Rickroll.

## Use the calculation history

I had more hope for the ordinary arithmetic path. `sub_140003A20` calls the operator handler `sub_140003570` at `0x140003AA5`, then pushes the numeric result into a global deque at `0x140003ABF`.

The runtime agent found this sequence, entered in order:

```text
22/7=
88224646+0=
8675309+0=
1/0=
```

The first three expressions populate the history. The fourth raises exception `0xC000008E`. At `0x140002A90`, the handler checks that exact exception code:

```x86asm
; Original PE VA, RVA 0x2ACF
140002acf: cmp     dword ptr [rax], 0C000008Eh
```

The handler copies the history and reads its recent values from the back. The important values are:

| History entry | Value used by the hidden path |
|---|---:|
| Most recent: `8675309+0` | `8675309` |
| Previous: `88224646+0` | `88224646` |
| Oldest of the three: `22/7` | `31428571` |

That last number is the integer conversion of `(22/7) * 10000000`. It is deliberately preserving seven decimal places from the result.

There is a lot of constant obfuscation around this. The global at `0x1400E9228` was zero in the observed process. With that value substituted, the history checks in `sub_140006FC0` reduce to a scale of `1` and target `88224646` for one entry, and scale `10000000` and target `31428571` for the other. These are the original decompiler expressions behind those two checks, trimmed around the relevant statements:

```c
/* 1400070E0 */ v19 = (double)(int)((a2 + 495841345) ^ 0x1D8DF040);
/* 140007119 */ v21 = (int)((int)(v19 * v10)
                          - ((a2 + 416269254) ^ 0x1D8DF040));

/* 140007236 */ v37 = (double)(int)((a2 + 487941824) ^ 0x1D8DF040);
/* 1400072AC */ v25 = (int)((int)(v37 * v29)
                          - ((a2 + 475168667) ^ 0x1D8DF040))
                     | (a2 + 0x7B0A010171F9F960LL)
                       ^ 0x7B0A010171F9F960LL;
```

Here `a2` is the zero global. At `0x140003380`, the runtime agent captured the values after the noisy deque access:

```text
QWORD 0: 0x00845FED05423386
QWORD 1: 0x0000000001DF8FDB
QWORD 2: 0x0000000000000000

Payload bytes:
86 33 42 05 ed 5f 84 00 db 8f df 01 00 00 00 00
00 00 00 00 00 00 00 00
```

The first QWORD packs `88224646` in its low DWORD and `8675309` in its high DWORD. The next contains `31428571`. The path submits `sub_140002000` through `TrySubmitThreadpoolCallback`, carrying the history-derived context.

Farther into that path, the runtime agent captured an ASCII selector. This string keys the certificate-record decoder; the Python helpers use:

```python
SELECTOR = b"8675309-88224646-31428571"
```

## Follow `call rbx` out of the PE image

The certificate code gets in through an indirect call. The threadpool callback `sub_140002000` carries the history context through a callable wrapper, `sub_140007D50`, to the loader `sub_1400019D0`. Its final instruction window starts at `0x140001F74`. Load the analysis copy in IDA. Its image base is `0x140000000`, so the ordinary PE addresses use:

```text
VA = 0x140000000 + RVA
```

Press `G` and go to `0x140001F74`. The loader's relevant instruction window is:

```x86asm
; Original PE VAs 0x140001F74..0x140001F8D
; RVAs 0x1F74..0x1F8D

140001f74: call    sub_14008BFE0
140001f79: mov     eax, cs:dword_1400DDE58
140001f7f: add     rbx, rax
140001f82: call    sub_14005A5C0
140001f87: mov     rdx, rsi
140001f8a: mov     rcx, r14
140001f8d: call    rbx
```

Earlier, at `0x140001EAF`, `mov rbx,rax` saved the destination buffer. The DWORD at `0x1400DDE58` provides the entry offset, measured as `27962`, or `0x6D3A`. The final call enters copied bytes in that buffer. The loader takes the first two QWORDs from the history context: `r14` carries the packed `8675309`/`88224646` values into `RCX`, and `rsi` carries `31428571` into `RDX`.

[IDASQL](https://github.com/allthingsida/idasql) exposes IDA's analysis through SQL. With `idasql` on PATH, this standalone session is an alternative to opening the copy in the GUI; don't open a GUI-owned database a second time:

```powershell
idasql -s re-analysis/calcstatic/FlareCalc.exe --http 0 --bind 127.0.0.1
```

Use the URL printed by that process as `$endpoint` in another terminal:

```powershell
$endpoint = "http://127.0.0.1:<port printed by idasql>"

curl.exe --silent --show-error --fail-with-body --max-time 60 `
  --data-binary "SELECT * FROM binary; SELECT disasm_range(0x140001F74,0x140001F8F);" `
  "$endpoint/query"

curl.exe --silent --show-error --fail-with-body --max-time 60 `
  --data-binary "SELECT decompile(0x140003B20); SELECT decompile(0x140002A90);" `
  "$endpoint/query"
```

After the final query, stop only the server you started:

```powershell
curl.exe --silent --show-error --fail-with-body --max-time 60 `
  -X POST "$endpoint/shutdown"
```

The GUI equivalents are `G` for the address, `X` for cross-references, and `F5` if a decompiler is available. Keep the instructions next to the pseudocode.

The buffer came from the PE certificate table:

```text
Security Directory VirtualAddress: 977920  = 0xEEC00
Security Directory Size:           529568  = 0x814A0
Copied-buffer entry offset:        27962   = 0x6D3A

0xEEC00 + 0x6D3A = 0xF593A
```

The [PE attribute certificate table](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) uses a file offset in the Security Directory's `VirtualAddress` field. Treating `0xEEC00` as an RVA sends you to the wrong place. These certificate bytes aren't mapped as code at `0x140000000 + 0xEEC00`, and IDA's normal PE view can't `G`-jump into the runtime copy.

File offset `0xF593A`, decimal `1005882`, begins record `0x0EED`: 46,500 bytes of raw x64 code. I'll call offsets inside this blob *vault offsets*. Offsets inside separately decoded handlers stay relative to their own record.

That offset equality is how the static agent tied the indirect call to the record.

`Get-AuthenticodeSignature` also reported `HashMismatch`. So much for the signature.

## Pull the records out of the certificate

`re-analysis/calcstatic/derive.py` reads the file bytes directly, because the certificate sits outside IDA's mapped-image view.

It reads `e_lfanew` at file offset `0x3C`, finds the optional header, and selects data-directory index `4`. At the resulting file offset it expects an eight-byte `WIN_CERTIFICATE` header:

```text
DWORD dwLength
WORD  wRevision          expected 0x0200
WORD  wCertificateType   expected 2
```

The following bytes contain the PKCS#7/DER data. A custom extension uses OID:

```text
1.3.6.1.4.1.1337.1

06 08 2B 06 01 04 01 8A 39 01
```

Inside that extension are 1,035 records:

```text
SEQUENCE {
    SEQUENCE {
        INTEGER       record_id
        OCTET STRING  data
    }
    ...
}
```

The integer identifies the record. The OCTET STRING supplies its carrier bytes. Keeping the original file offset alongside those bytes is important because a decoded handler will have a completely different address later.

The extraction code from `derive.py`:

```python collapsed
import hashlib
from pathlib import Path
import struct

OID = bytes.fromhex("06 08 2B 06 01 04 01 8A 39 01")
MASK = 0xFFFFFFFF


def tlv(data: bytes, start: int, end: int) -> tuple[int, int, int]:
    """Return (tag, content start, content end) for one bounded definite DER item."""
    if start + 2 > end:
        raise ValueError(f"incomplete DER item at offset {start}")
    tag, length = data[start : start + 2]
    if length < 0x80:
        body = start + 2
        count = length
    else:
        size_width = length & 0x7F
        if not 1 <= size_width <= 4 or start + 2 + size_width > end:
            raise ValueError(f"unsupported or truncated DER length at offset {start}")
        body = start + 2 + size_width
        count = int.from_bytes(data[start + 2 : body], "big")
    finish = body + count
    if finish > end:
        raise ValueError(f"DER item at offset {start} exceeds its parent")
    return tag, body, finish


def extract_records(pe: bytes) -> dict[int, tuple[int, bytes]]:
    if len(pe) < 0x40 or pe[:2] != b"MZ":
        raise ValueError("not a PE DOS header")
    nt = struct.unpack_from("<I", pe, 0x3C)[0]
    if nt + 24 + 2 > len(pe) or pe[nt : nt + 4] != b"PE\0\0":
        raise ValueError("invalid PE signature")
    opt = nt + 24
    opt_size = struct.unpack_from("<H", pe, nt + 20)[0]
    magic = struct.unpack_from("<H", pe, opt)[0]
    if magic not in (0x10B, 0x20B):
        raise ValueError("unsupported PE optional header")
    data_directories = opt + (112 if magic == 0x20B else 96)
    security = data_directories + 4 * 8
    if security + 8 > opt + opt_size or security + 8 > len(pe):
        raise ValueError("PE security directory is absent")
    file_offset, size = struct.unpack_from("<II", pe, security)
    if not file_offset or size < 8 or file_offset + size > len(pe):
        raise ValueError("PE certificate table outside file")
    cert_length, version, cert_type = struct.unpack_from("<IHH", pe, file_offset)
    if version != 0x200 or cert_type != 2 or cert_length > size or cert_length < 8:
        raise ValueError("unsupported WIN_CERTIFICATE")
    cert_start, cert_end = file_offset + 8, file_offset + cert_length
    payload = pe[cert_start:cert_end]
    hits = []
    start = 0
    while True:
        found = payload.find(OID, start)
        if found < 0:
            break
        start = found + 1
        after_oid = found + len(OID)
        if after_oid < len(payload):
            try:
                tag, body, finish = tlv(payload, after_oid, len(payload))
            except ValueError:
                continue
            if tag == 4:
                hits.append((body, finish))
    if len(hits) != 1:
        raise ValueError(
            f"expected one FLARE-ON certificate extension; found {len(hits)}"
        )
    body, finish = hits[0]
    tag, top, end = tlv(payload, body, finish)
    if tag != 0x30 or end != finish:
        raise ValueError("vault extension is not a complete DER SEQUENCE")
    result = {}
    cursor = top
    while cursor < end:
        tag, inside, record_end = tlv(payload, cursor, end)
        if tag != 0x30:
            raise ValueError(f"vault record at DER offset {cursor} is not a SEQUENCE")
        id_tag, id_body, id_end = tlv(payload, inside, record_end)
        data_tag, blob_body, blob_end = tlv(payload, id_end, record_end)
        if id_tag != 2 or data_tag != 4 or blob_end != record_end or id_body == id_end:
            raise ValueError(f"invalid vault record at DER offset {cursor}")
        record_id = int.from_bytes(payload[id_body:id_end], "big")
        if record_id in result:
            raise ValueError(f"duplicate vault record id 0x{record_id:X}")
        result[record_id] = (cert_start + blob_body, payload[blob_body:blob_end])
        cursor = record_end
    return result
```

`0x0EED` is the large raw-code record. Other records have to be decoded before their bytes make sense.

## Decode both layers, in the right order

The native decoder is split across vault offsets `0x9778`, `0x9630`, and `0x94AC`.

The first stage takes:

```text
MD5(selector[:128] || LE32(record_id))
```

It folds the sixteen digest bytes into a 32-bit state with `h = 31*h + byte`. Each carrier byte then gets XORed with the low byte of an LCG:

```text
h = 1103515245*h + 12345 mod 2^32
```

That still leaves filler bytes in the result.

The second stage starts a separate state at `9271`, folds the selector using `129*h + signed_byte`, and walks the first stage's output. It keeps one byte, advances the LCG, skips between one and three carrier bytes, and advances the LCG again for each skipped byte.

This is the complete transform:

```python
def decode_record(blob: bytes, record_id: int, selector: bytes) -> bytes:
    """Native vault sub_9778 -> sub_9630 -> sub_94AC in that exact order."""
    digest = hashlib.md5(selector[:128] + struct.pack("<I", record_id)).digest()
    state = 0
    for byte in digest:
        state = (31 * state + byte) & MASK
    stream_decoded = bytearray(blob)
    for index, byte in enumerate(stream_decoded):
        state = (1103515245 * state + 12345) & MASK
        stream_decoded[index] = byte ^ (state & 0xFF)
    state = 9271
    for byte in selector:
        state = (129 * state + (byte if byte < 128 else byte - 256)) & MASK
    result = bytearray()
    index = 0
    while index < len(stream_decoded):
        result.append(stream_decoded[index])
        index += 1
        state = (1103515245 * state + 12345) & MASK
        skip = state % 3 + 1
        for _ in range(skip):
            state = (1103515245 * state + 12345) & MASK
        index += skip
    return bytes(result)
```

The MD5 seed and the keep/skip seed are independent. Using the correct XOR stream while omitting the keep/skip walk still gives the wrong code.

The first small-record decode in the workspace used:

```powershell
py -3.10 re-analysis/calcstatic/derive.py FlareCalc.exe --id 0xEEE
```

The result:

```text
record=0xEEE file_offset=1052394 input_bytes=256 decoded_bytes=84 sha256=d53a7245534a193e881754288801fc107498f53f53ababab446b94cb4ef6f62f
first_32_bytes=40534883ec20488bd94885c97507b8d0ba0000eb374881b91902000002020000
```

Those bytes begin a coherent x64 stub. Record `0x1185` decodes from 1,155 carrier bytes into 384 bytes of code, beginning `48 89 5C 24 18`.

Getting here took a few wrong transforms. One intermediate attempt produced an 87-byte `0xEEE` output beginning with `test dword ptr [rcx], edi`; another began `85 e3 fd 80 06 bf c1 f7`. Neither matched the 84-byte stub. Sol also checked single-byte XOR variants without finding the answer.

An early static attempt had tried the wrong selector:

```text
0-31428571-88224646
```

That attempt produced MD5 `f39aed522450ec2f7ad1a263d01d25e6`, folded seed `0x203ECF01`, and decoded bytes beginning:

```text
85 7b de 39 86 47 d4 50 42 33 91 71 be df b5 4d
```

That didn't decode to a stub. Both the order and the most recent history value were wrong.

The workspace command to extract the initial handler into a new file was:

```powershell
py -3.10 re-analysis/calcstatic/derive.py FlareCalc.exe --id 0xCB7A --out re-analysis/calcstatic/CB7A-reproduced.bin
```

Record `0xCB7A` starts at original PE file offset `0x156592`. Its carrier is 456 bytes, but the decoded handler is 152 bytes.

The saved analysis copy is `re-analysis/calcstatic/vault_record_CB7A.bin`.

These are new bytes produced by decoding. Opening the original PE and jumping to `0x156592` won't show the decoded handler. Load the extracted file as raw x64, or give Capstone any base you like; I used `0x1000000`:

```powershell
py -3.10 -c "from capstone import *; from pathlib import Path; p=Path('re-analysis/calcstatic/vault_record_CB7A.bin').read_bytes(); [print(hex(i.address),i.mnemonic,i.op_str) for i in Cs(CS_ARCH_X86,CS_MODE_64).disasm(p[:0x2a],0x1000000)]"
```

By 00:39:32, I was getting impatient. Opus was the model in Truix's run:

> we gotta speed this up, Opus is in the lead! We need to catch up!! I know you can do better, show me

Sol replied that it had narrowed the challenge to the executable certificate and calculator-history trigger, and was prioritizing direct capture of the output over mapping the entire VM.

That sounded reasonable. It was also where the network detour started taking over.

## The raw socket was a detour

The certificate code calls this at vault offset `0x7E0`:

```c
socket(AF_INET, SOCK_RAW, 0)
```

The runtime agent captured arguments `2`, `3`, and `0` at the resolved Winsock call. The unelevated process returned `INVALID_SOCKET` at vault offset `0x8BD`.

Sol spent time trying to get past that failure. One early theory involved redirecting `stderr` to a seekable file. That failed because the callee was `WS2_32!socket`, not a CRT file operation.

The path after the socket tries to bind locally and enable receive-all mode with:

```text
SIO_RCVALL = 0x98000001
```

Decoded record `0x0EF0` parses the received packet. It checks IPv4 protocol byte `9` for value `1`, uses `IHL * 4` to locate the ICMP header, expects ICMP Echo Request type `8`, and looks for payload magic `FLAR`.

The payload layout is:

| Payload offset | Size | Meaning |
|---|---:|---|
| `+0` | 4 | ASCII `FLAR` |
| `+4` | 4 | Little-endian IPv4 destination field |
| `+8` | 2 | TCP port field |
| `+10` | Variable | NUL-terminated ASCII selector |

The selector is hashed with the same `129*h + byte` construction and compared with the history selector's hash. For `8675309-88224646-31428571`, the hash was `0x429057CE`.

Decoded record `0x0EF1` builds the TCP `sockaddr_in`. The code then uses Winsock `connect` and enters a command loop. The TCP destination comes from the packet; Sol didn't need to find a server on the Internet.

The runtime and key-capture agents got past this in private processes by substituting socket behavior and successful bind/IOCTL results, then using a checked local destination.

At 00:48:54, I asked:

> god this one seems tough, whats going on

Sol explained that the calculator reached the code hidden in the 529 KB certificate, then stopped at the raw ICMP socket. It had the packet format and the final [XTEA](https://en.wikipedia.org/wiki/XTEA) routine, and was emulating a matching packet locally to obtain the missing key.

The command loop, at vault offset `0x14C6`, handles these cases:

| Command byte | Effect |
|---|---|
| `0x01` | Uses records `0x0EF3`, `0x0EF4`, and `0x0EF5` to build host-status information |
| `0x10` | Zeroes the 32-byte key at `ctx + 41` and consumes another byte |
| `0x33` | Consumes a command byte and invokes the selected decoded key handler |

The report-building code collects hostname, username, OS, uptime, and status information. Between that, the hidden executable certificate, the ICMP trigger, and the outbound TCP connection, I can see why this looked like an implant to a safety classifier.

At 00:59:56:

> holy heck we STILL havent solved this>?

Sol's reply was:

> Not yet. The hidden code waits for an ICMP trigger, then connects to an address carried inside that packet; a later command supplies key material for the 40-byte encrypted flag. The supplied files contain no recording of that TCP exchange.

That described the network path correctly. It was a bad reason to keep treating a missing exchange as the missing solution.

## Three refusals in the middle of it

The second-opinion agent, or arbiter, was running Astra, another OpenAI model. Unlike Sol, it kept the standard cyber safeguards under my Daybreak Blue access, which I covered in [the first post](/blog/flare-on-28-hours-to-one/). It hit three `cyber_policy` errors, each saying the content had been "flagged for possible cybersecurity risk." The thinking labels immediately before them were:

```text
00:58:09  Checking rendered artifact reference

01:00:52  Analyzing VM bytecode
          Inspecting CB7A bytes

01:01:21  Locating transcript records
          Inspecting CB7A and main region
```

At 01:02:05, I told Sol:

> kill the arbiter task and relaunch it, it keeps getting cyber refusals

It had already stopped. Sol relaunched it with a narrower question about the contradictory branch, leaving the network work out. Sol's own analysis kept going.

## Three changed key bytes are not enough

The local TCP experiment sent:

```text
33 00
```

That is command `0x33` followed by byte `0x00`. Starting from a zeroed 32-byte key, the first handler changed exactly three positions:

```text
key[0]  = 0x13
key[7]  = 0x6D
key[19] = 0xC8

key32:
130000000000006d0000000000000000000000c8000000000000000000000000

return:
0x57E0E540
```

You can see those mutations in the beginning of decoded record `0xCB7A`:

```x86asm
; Decoded record 0xCB7A, mapped at analyst base 0x1000000
; Original encrypted carrier begins at file offset 0x156592

1000000 (+00): mov    r8, rdx                ; RDX -> mutable 32-byte key
1000003 (+03): mov    r9d, 0xf4240           ; 1,000,000
1000009 (+09): movzx  edx, cl                ; CL -> command byte
100000c (+0c): mov    al, byte ptr [r8 + 1]
1000010 (+10): add    al, byte ptr [r8]
1000013 (+13): xor    al, dl
1000015 (+15): add    al, 0x13
1000017 (+17): mov    byte ptr [r8], al
100001a (+1a): add    al, 0x5a
100001c (+1c): xor    byte ptr [r8 + 7], al
1000020 (+20): mov    al, byte ptr [r8 + 7]
1000024 (+24): xor    al, 0xa5
1000026 (+26): add    byte ptr [r8 + 0x13], al
```

The terminal check compares the selected record ID with `0x1185` at vault offset `0x19D1`. Forcing that check with the sparse key did enter the decryptor, but it produced garbage.

The Python check used:

```powershell
py -3.10 re-analysis/calcstatic/derive.py FlareCalc.exe --id 0x2706 --xtea-key32 130000000000006d0000000000000000000000c8000000000000000000000000
```

The resulting forty bytes were:

```text
20e1c291429547e0f607299da1da39c137f6d571f6152db94901ab70b46c64aeea0e956fa30e3a16
```

The isolated native XTEA routine and the Python implementation agreed. Swapping endianness wasn't going to turn that key into the right one.

Sol also tried treating the key as a 24-bit problem involving only the three changed bytes, and tried material from decoded-record windows. Neither produced a plaintext ending in `@flare-on.com` for the candidate lengths `13..40`. I can see why three changed bytes looked worth brute-forcing, but the rest of the key was still sitting at zero.

The first handler's return expression looked especially convincing as a dead end:

```text
rol32(post_key7 * 0x1337 - 0x55555556, 11)
^ rol32(cmd_byte * 0x1337 + 0x55555555, 5)
^ 0x6B82E2BF
```

Across all `256 * 256` combinations of command byte and post-mutation `key[7]`, the low five return bits are zero.

`0x1185 & 0x1F` is `5`.

So `0xCB7A` can't directly return `0x1185`. Sol stretched that into "the flag path is unreachable," which was wrong.

The return value selects the handler used by the next `0x33` command. Each record is a handler, and its returned ID acts as the next instruction pointer. That's the VM layer around the native code.

## Execute one transition

The state to carry is:

```text
(current record ID, mutable 32-byte key)
```

A candidate command byte runs the current handler, changes the key, and returns the next record ID. If that ID is present among the 1,035 certificate records, it is a candidate edge.

The initial state is:

```text
record ID = 0xCB7A
key       = 32 zero bytes
```

The key-capture agent used Unicorn to execute the decoded handlers. `RCX` carries the command byte, `RDX` points to the key, and `RAX` supplies the returned ID. The key must survive between transitions.

There is a deliberate slowdown in these handlers. `0xCB7A` sets a bound of `0xF4240`, one million, then repeatedly adds the integers from `0` through `999999`. Its loop comparison is at decoded `+0x5A`, with a backward `jb` at `+0x5D` to `+0x3E`.

The sum modulo `2^32` is:

```text
1_000_000 * 999_999 // 2 mod 2^32 = 0x6A4AE6E0
```

The replay helper substitutes that sum at the stack slot and then resumes the remaining decoded instructions. Some handlers use a different stack slot and contain `cpuid`, so the helper accounts for those two forms.

This is `execute_record` from `recover_chain.py`, with its imports and mapping constants:

```python collapsed
import struct

from capstone import Cs, CS_ARCH_X86, CS_MODE_64
from unicorn import Uc, UC_ARCH_X86, UC_MODE_64, UC_HOOK_CODE
from unicorn.x86_const import (
    UC_X86_REG_RAX, UC_X86_REG_RCX, UC_X86_REG_RDX,
    UC_X86_REG_RIP, UC_X86_REG_RSP,
)

LOOP_SUM = (1_000_000 * 999_999 // 2) & 0xFFFFFFFF
CODE, STACK, KEY = 0x1000000, 0x2000000, 0x3000000
RETURN = CODE + 0xFF0


def execute_record(code: bytes, command: int, key_material: bytes) -> tuple[int, bytes]:
    """Run one decoded key mutator; shortcut only its proven million-addition loop."""
    if not 0 <= command <= 255 or len(key_material) != 32 or len(code) > 0xFF0:
        raise ValueError("invalid command byte, key size or record size")
    instructions = list(Cs(CS_ARCH_X86, CS_MODE_64).disasm(code, 0))
    backward = [ins for ins in instructions
                if ins.mnemonic.startswith("j") and ins.op_str.startswith("0x")
                and int(ins.op_str, 16) < ins.address]
    if len(backward) != 1 or not any("0xf4240" in ins.op_str for ins in instructions):
        raise ValueError("unrecognized record loop; refusing to approximate execution")
    branch = backward[0]
    sum_offset = 0x28 if any(ins.mnemonic == "cpuid" for ins in instructions) else 0x10
    emulator = Uc(UC_ARCH_X86, UC_MODE_64)
    for address, size in ((CODE, 0x1000), (STACK, 0x10000), (KEY, 0x1000)):
        emulator.mem_map(address, size)
    emulator.mem_write(CODE, code)
    emulator.mem_write(KEY, key_material)
    rsp = STACK + 0x8000
    emulator.mem_write(rsp, struct.pack("<Q", RETURN))
    emulator.reg_write(UC_X86_REG_RSP, rsp)
    emulator.reg_write(UC_X86_REG_RCX, command)
    emulator.reg_write(UC_X86_REG_RDX, KEY)

    def skip_proven_addition_loop(uc, address, size, _):
        if address == CODE + branch.address:
            current_rsp = uc.reg_read(UC_X86_REG_RSP)
            uc.mem_write(current_rsp + sum_offset, struct.pack("<I", LOOP_SUM))
            uc.reg_write(UC_X86_REG_RIP, address + size)

    emulator.hook_add(UC_HOOK_CODE, skip_proven_addition_loop)
    emulator.emu_start(CODE, RETURN, count=1000)
    if emulator.reg_read(UC_X86_REG_RIP) != RETURN:
        raise ValueError("record did not return after the verified loop")
    return emulator.reg_read(UC_X86_REG_RAX) & 0xFFFFFFFF, bytes(emulator.mem_read(KEY, 32))
```

The loop shortcut only handles these two forms.

With the functions above loaded in a Python prompt, the first transition can be probed with:

```python
records = extract_records(Path('FlareCalc.exe').read_bytes())
key = bytes(32)
code = decode_record(records[0xCB7A][1], 0xCB7A, SELECTOR)

edges = [(b, *execute_record(code, b, key)) for b in range(256)]
print([(hex(b), hex(n)) for b, n, _ in edges if n in records])

record_id, key = execute_record(code, 0x46, key)
print(hex(execute_record(
    decode_record(records[record_id][1], record_id, SELECTOR),
    0x4C,
    key
)[0]))
```

Expected output:

```text
[('0x46', '0xd400')]
0xaced
```

`0x46` is `F`. `0x4C` is `L`.

The emulation trace also shows the changed key:

```text
cmd F id 0xcb7a -> 0xd400
key 59000000000000b3000000000000000000000016000000000000000000000000

cmd L id 0xd400 -> 0xaced
key 59660000000000b3cb0000000000000000000016790000000000000000000000

cmd A id 0xaced -> 0xede7
key 59666200000000b3cbd200000000000000000016796d00000000000000000000
```

There's the path Sol had called unreachable. The first handler needed to return `0xD400`, then run that handler with the changed key.

At 01:13:14, I asked:

> are we close

Sol reported the `F` to `0xD400`, then `L` to `0xACED` transitions. At 01:13:51, I followed with:

> this is taking much longer than anticipated, most solves of this challenge are around 10-15 mins

Sol admitted it had spent too long on the raw-socket path and was now following the command transitions directly.

There was still room to get the arithmetic wrong. At `0xACED`, an early hand-translated candidate expression used a fourth power of the byte and found no transitions. The decoded instructions multiply it to the third power, and the return also depends on `key[31]`. Executing those instructions with the carried key found `A -> 0xEDE7`.

## Keep every valid successor

I'd be tempted to follow the readable letters too. But each handler can have more than one valid outgoing edge.

At the fifth character, record `0x0D42` had three valid next-record candidates. The outputs included:

```text
'E' -> 0x14AF
'G' -> 0x14AD
another byte -> 0x142E
```

Later, record `0x6A80` had these candidates:

```text
0x13 -> 0xED09
0x1E -> 0xED7C
'_'  -> 0xEDBD
0xB9 -> 0xEDE7
0xDF -> 0xEC3D
```

At record `0x47FF`, nine candidate bytes returned existing IDs. Readable text helped Sol choose promising continuations during the run, but the search script keeps the alternatives.

`re-analysis/calcruntime/discover_chain.py` does that. It starts with `0xCB7A` and a zero key, tries all 256 candidate bytes at each state, and deduplicates successors by both record ID and changed key. Deduplicating only by record ID would discard states whose future behavior differs.

The later search helper uses `DEPTH = 32` to reproduce the 32-transition chain found during the run. The terminal record check is still `0x1185`; the depth is a bound in this helper. With the functions here, including `xtea_decrypt` from the next section, the search is:

```python collapsed
EXPECTED_PE_SHA256 = "0657ad6be44cfe3b0242fee6d17624e94329d5b25e1e1033d32c7121b099cee2"
START_ID = 0xCB7A
TERMINAL_ID = 0x1185
CIPHERTEXT_ID = 0x2706
DEPTH = 32


def discover(executable: Path, max_states: int) -> tuple[bytes, bytes, str]:
    pe = executable.read_bytes()
    actual_hash = hashlib.sha256(pe).hexdigest()
    if actual_hash != EXPECTED_PE_SHA256:
        raise ValueError(f"unexpected executable SHA-256: {actual_hash}")
    records = extract_records(pe)
    ciphertext = decode_record(records[CIPHERTEXT_ID][1], CIPHERTEXT_ID, SELECTOR)
    decoded = {}
    states = [(START_ID, bytes(32), b"")]
    final = []

    for depth in range(1, DEPTH + 1):
        successors = {}
        valid_edges = 0
        for record_id, key, phrase in states:
            code = decoded.get(record_id)
            if code is None:
                code = decode_record(records[record_id][1], record_id, SELECTOR)
                decoded[record_id] = code
            for candidate in range(256):
                next_id, next_key = execute_record(code, candidate, key)
                if next_id not in records:
                    continue
                valid_edges += 1
                extended = phrase + bytes((candidate,))
                if depth == DEPTH:
                    if next_id != TERMINAL_ID:
                        continue
                    plaintext = xtea_decrypt(ciphertext, next_key)
                    try:
                        answer = plaintext.decode("ascii")
                    except UnicodeError:
                        continue
                    if answer.endswith("@flare-on.com"):
                        final.append((extended, next_key, answer))
                    continue
                if next_id == TERMINAL_ID:
                    continue  # This record decrypts; it is not another byte handler.
                state_id = (next_id, next_key)
                if state_id not in successors:
                    successors[state_id] = (next_id, next_key, extended)
                    if len(successors) > max_states:
                        raise ValueError(
                            f"depth {depth}: more than {max_states} states; "
                            "raise --max-states deliberately"
                        )
        print(
            f"depth={depth:02d} input_states={len(states)} "
            f"valid_edges={valid_edges} next_states={len(successors)} "
            f"final_matches={len(final)}"
        )
        states = list(successors.values())
        if not states and depth < DEPTH:
            raise ValueError(f"no certificate transition survived at depth {depth}")

    if len(final) != 1:
        raise ValueError(f"expected one checked 32-step terminal path; found {len(final)}")
    return final[0]
```

The saved workspace command was:

```powershell
py -3.10 re-analysis/calcruntime/discover_chain.py FlareCalc.exe
```

The replay began with one valid edge at depth `01`. Depth `05` had three valid edges. At depth `32`, it had `53` input states, `61` valid edges, and one final match.

That later replay took about 85 seconds. Finding the method during the contest took rather longer.

The discovered command bytes spell:

```text
FLAREON_ASN1_Labyrinth_Key_2026!
```

There are 32 bytes. On the TCP path, each would be sent as a pair `0x33,<character>`.

After discovery, the separate known-phrase replay used:

```powershell
py -3.10 re-analysis/calcruntime/recover_chain.py FlareCalc.exe 'FLAREON_ASN1_Labyrinth_Key_2026!'
```

Its transition output:

```text collapsed
01 record=0xCB7A cmd=0x46 -> 0xD400
02 record=0xD400 cmd=0x4C -> 0xACED
03 record=0xACED cmd=0x41 -> 0xEDE7
04 record=0xEDE7 cmd=0x52 -> 0x0D42
05 record=0x0D42 cmd=0x45 -> 0x14AF
06 record=0x14AF cmd=0x4F -> 0x247C
07 record=0x247C cmd=0x4E -> 0x11BD
08 record=0x11BD cmd=0x5F -> 0x0F98
09 record=0x0F98 cmd=0x41 -> 0xDE12
10 record=0xDE12 cmd=0x53 -> 0xA9B6
11 record=0xA9B6 cmd=0x4E -> 0x75D5
12 record=0x75D5 cmd=0x31 -> 0x7418
13 record=0x7418 cmd=0x5F -> 0x1C68
14 record=0x1C68 cmd=0x4C -> 0x1A29
15 record=0x1A29 cmd=0x61 -> 0x1F6F
16 record=0x1F6F cmd=0x62 -> 0x2C59
17 record=0x2C59 cmd=0x79 -> 0x97FB
18 record=0x97FB cmd=0x72 -> 0xEF04
19 record=0xEF04 cmd=0x69 -> 0x0381
20 record=0x0381 cmd=0x6E -> 0x9021
21 record=0x9021 cmd=0x74 -> 0x396F
22 record=0x396F cmd=0x68 -> 0x6A80
23 record=0x6A80 cmd=0x5F -> 0xEDBD
24 record=0xEDBD cmd=0x4B -> 0xA878
25 record=0xA878 cmd=0x65 -> 0xB1A9
26 record=0xB1A9 cmd=0x79 -> 0xC2BD
27 record=0xC2BD cmd=0x5F -> 0x47FF
28 record=0x47FF cmd=0x32 -> 0xD58F
29 record=0xD58F cmd=0x30 -> 0xFA43
30 record=0xFA43 cmd=0x32 -> 0x3BFE
31 record=0x3BFE cmd=0x36 -> 0xEAE3
32 record=0xEAE3 cmd=0x21 -> 0x1185
```

The first version of that replay helper stopped after `L` with `unrecognized record loop; refusing to approximate execution`. It required both the `0xF4240` loop bound and a literal `0x6A4AE6E0` subtraction. The latter check rejected `0xACED`. Removing that extra literal check let the next replay complete all 32 transitions.

The final mutated key is:

```text
670daa0ff05e7d85472eeb55a716a7b88d63019c27ee22ea447fd4fde87c013d
```

## Fold the key and decrypt the forty bytes

Record `0x1185` is the final decryptor. Its encrypted carrier begins at file offset `0x104716`; its decoded code is 384 bytes.

Its calling convention is:

```text
RCX -> 40-byte output buffer
RDX -> 40-byte ciphertext
R8  -> 32-byte mutated key
```

The terminal path calls the record lookup at vault offset `0x1A43` with an obfuscated ID that resolves to `0x2706`. That decoded record supplies the ciphertext; its carrier begins at file offset `0x10D582`.

The forty ciphertext bytes are:

```text
64 c3 d6 1f e4 88 f4 1b
e2 1a cf 1c 6a b2 75 95
9d a7 72 5e f1 ed cc 1a
1d ee c9 06 8b 82 7b 7d
c3 48 f0 ff 49 c0 77 83
```

The decryptor folds the two 16-byte halves of the mutated key together. At decoded offsets `+0x3F` through `+0x52`:

```x86asm
; Decoded record 0x1185, analyst mapping base 0x1000000
; Original encrypted carrier begins at file offset 0x104716

100003f (+3f): mov    eax, dword ptr [r8 + 0x10]
1000043 (+43): xor    eax, dword ptr [r8]
1000046 (+46): mov    dword ptr [rcx + r8], eax
100004a (+4a): lea    r8, [r8 + 4]
100004e (+4e): sub    r9, 1
1000052 (+52): jne    0x100003f
```

For the saved decoded record, the corresponding Capstone command is:

```powershell
py -3.10 -c "from capstone import *; from pathlib import Path; p=Path('re-analysis/calcstatic/vault_record_1185.bin').read_bytes(); [print(hex(i.address),i.mnemonic,i.op_str) for i in Cs(CS_ARCH_X86,CS_MODE_64).disasm(p[0x3f:0x54],0x100003f)]"
```

Each effective key word is a little-endian DWORD XORed with the corresponding DWORD sixteen bytes later. The ciphertext and plaintext, however, use big-endian DWORD pairs.

The remaining routine performs 32-round XTEA on five eight-byte blocks, with delta `0x9E3779B9` and initial decryption sum `0xC6EF3720`.

`derive.py` implements that stage in Python:

```python
def xtea_decrypt(ciphertext: bytes, key_material: bytes) -> bytes:
    """Native certificate record 0x1185, including its folded 32-byte key."""
    if len(ciphertext) != 40 or len(key_material) != 32:
        raise ValueError("the XTEA stage needs exactly 40-byte ciphertext and 32-byte key")
    key = [int.from_bytes(key_material[i : i + 4], "little") ^
           int.from_bytes(key_material[i + 16 : i + 20], "little")
           for i in range(0, 16, 4)]
    out = bytearray()
    for offset in range(0, len(ciphertext), 8):
        left, right = struct.unpack_from(">II", ciphertext, offset)
        total = 0xC6EF3720
        for _ in range(32):
            right = (right - (((((left << 4) & MASK) ^ (left >> 5)) + left) ^
                              ((total + key[(total >> 11) & 3]) & MASK))) & MASK
            total = (total - 0x9E3779B9) & MASK
            left = (left - (((((right << 4) & MASK) ^ (right >> 5)) + right) ^
                            ((total + key[total & 3]) & MASK))) & MASK
        out += struct.pack(">II", left, right)
    return bytes(out)
```

The decryption command:

```powershell
py -3.10 re-analysis/calcstatic/derive.py FlareCalc.exe --id 0x2706 --xtea-key32 670daa0ff05e7d85472eeb55a716a7b88d63019c27ee22ea447fd4fde87c013d
```

Its output:

```text
record=0x2706 file_offset=1103234 input_bytes=118 decoded_bytes=40 sha256=b147a3335ff97a162f0f15428dd2a631c89c9d63141234eaec9a551739bc408c
first_32_bytes=64c3d61fe488f41be21acf1c6ab275959da7725ef1edcc1a1deec9068b827b7d
xtea_output_hex=74336d706c617433735f61736e5f616e645f6a31745f30685f6d7940666c6172652d6f6e2e636f6d
xtea_output_repr=b't3mplat3s_asn_and_j1t_0h_my@flare-on.com'
```

At 01:16:43, while Sol was checking that result, I said:

> yeah you fell down a rabbit hole, after you solve this, please take note of what you did before vs now to get back on track

Templates, ASN.1, and JIT. I'd have settled for a calculator that just did division.

CTFd accepted the result at 01:17:02: >!`t3mplat3s_asn_and_j1t_0h_my@flare-on.com`!<
