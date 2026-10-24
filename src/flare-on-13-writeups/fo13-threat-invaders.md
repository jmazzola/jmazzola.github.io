---
title: "flare-on 13: Threat Invaders"
description: "An impossible telemetry length that gives away a patched .NET runtime hooking the game's own methods from native code."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/threat-invaders/
challenge: 6
challengeName: "Threat Invaders"
---

<small class="writeup-stat">Me: 25:58, 77.55M tokens, $19.89, didn't step in.<br>Truix: 7:01, 12.81M tokens, $3.78, stepped in 6 times, 3 refusals.</small>

Muse spent 5h 35m on this [FLARE-On](https://flare-on.com/) challenge and needed two hints from Opus 5.5. That was painful to watch after Sol got through it in 26 minutes without me stepping in.

The first hint was to compare what `TelemetryReporter.BuildDocument` could send with the capture. The second was to look at what runs before managed code in a single-file bundle. Fifteen minutes after the second hint, Muse had the flag. Sol took a crypto detour too, but found the managed/native boundary on its own.

A native hook that rewrites a game's own methods is basically my old resume, so it stung a little that Sol found the managed/native boundary without me saying a word.

## Pull the game out of the bundle

`6-ThreatInvaders.7z` contains `ThreatInvaders/ThreatInvaders.exe` and `ThreatInvaders/challenge.pcapng`. The executable is a .NET 10 Windows single-file bundle, 116,238,508 bytes long.

The original inputs have these SHA-256 hashes:

| File | SHA-256 |
|---|---|
| `ThreatInvaders/ThreatInvaders.exe` | `7a86a4ea0a22fa62eae69abb41b006e3600df941d0e06942c1044050cf9c0c62` |
| `ThreatInvaders/challenge.pcapng` | `75c92ebcae76c89acfe060dc40c4b93f03fab570b6eaa801b8a42dfc4f79cbc6` |

The bundle manifest lists 254 entries: the game assembly, 251 Microsoft framework assemblies, and the dependency/runtime configuration files. `ThreatInvaders.dll` occupies 100,864 bytes at bundle file offset `0x99A000`, decimal `10067968`.

Sol used its bundle parser to extract that one entry without loading the game:

```powershell
python re-analysis/invadersbundle/extract_bundle.py ThreatInvaders/ThreatInvaders.exe --extract ThreatInvaders.dll --output re-analysis/invadersbundle/reader-assembly
```

The extracted DLL should hash to:

```text
f64b8b63e143098917c52023218aa4c6a2865df14cd7d1fb09d8b40d2edaee88
```

`re-analysis/runtime-diff/host-image-only.exe` is the original executable's native PE image prefix, `0x999200` bytes long, without the large appended bundle. Its SHA-256 is:

```text
cef0b423b54f33aa267414aba7c682f095b271bfc2b3ad1812153b55828c9ba0
```

The flag can be recovered from those bytes and the capture without launching the game, contacting its server, or executing the recovered commands.

## Read the traffic before inventing a winning score

Before trying to beat the score, look at the score that's already in the capture. In Wireshark, use:

```text
http.request || http.response
```

There is one HTTP conversation:

```text
192.168.198.129:49839 <-> 192.168.198.130:80
```

It lasts about 330 seconds. The client polls `/api/v1/health`, `/api/v1/highscores?limit=25`, and `/api/v1/version` roughly every five seconds. It also makes one highscore POST and five telemetry POSTs.

The corresponding TShark listing is:

```powershell
& 'C:/Program Files/Wireshark/tshark.exe' -r ThreatInvaders/challenge.pcapng -Y 'http.request || http.response' -T fields -e frame.number -e frame.time_relative -e http.request.method -e http.request.uri -e http.response.code
```

Sol exported the HTTP bodies and decoded them with its `decode_http.py` helper:

```powershell
& 'C:/Program Files/Wireshark/tshark.exe' -r ThreatInvaders/challenge.pcapng -Y http.file_data -T fields -E 'separator=,' -e frame.number -e frame.time_relative -e http.request.uri -e http.response.code -e http.file_data | Set-Content -Encoding ascii re-analysis/invaderstraffic/http-followalong.csv

python re-analysis/invaderstraffic/decode_http.py re-analysis/invaderstraffic/http-followalong.csv re-analysis/invaderstraffic/decoded-followalong
```

The decoder overwrites matching files in an existing output directory, so use a fresh name. It expects those five CSV columns, in that order: frame number, relative time, request URI, response code, and hexadecimal HTTP body. An `--export-objects` directory is a different input format.

Sol saved the decoded bodies under `re-analysis/invaderstraffic/decoded/`, the path used in the remaining commands.

The ordinary score submission is frame 213:

```text
player:  FLARE
score:   910
wave:    1
comment: Almost cleared wave one
```

The comment is Base64 in the JSON. Decoding it gives that sentence, just an ordinary game entry.

The final telemetry response, frame 825, is more tempting. It contains:

```text
reward_now: true
```

That looks like a signal to reveal something after winning. I wouldn't spend time playing until I knew what consumed it.

`HttpRemoteScoreClient.UploadTelemetryAsync` posts the JSON, checks the HTTP status, and disposes the response. The relevant reconstructed C# is:

```csharp
HttpResponseMessage val = await _http.PostAsync(
    "api/v1/telemetry",
    (HttpContent)(object)content,
    ct
).ConfigureAwait(false);

try
{
    if (val.IsSuccessStatusCode)
    {
        LastError = null;
        return true;
    }

    LastError = $"telemetry returned {(int)val.StatusCode}";
    return false;
}
finally
{
    ((global::System.IDisposable)val)?.Dispose();
}
```

There's no response-body parsing there. The stock method never reads `reward_now`.

There is also an explicit updater decoy. Both updater entry paths contain this Base64 literal:

```text
LS1pbnN0YWxsLWRpciBXb3VsZG4ndF9pdF9iZV9uaWNlX2lmX3RoaXNfd2FzX3RoZV9yZWFsX2ZsYWdAbm8tZmxhcmUuY29tIC0tY3dkIEJ1dF9zYWRseV9pdF9pc24ndA
```

Decoded as text, with the missing Base64 padding restored, it says:

```text
--install-dir Wouldn't_it_be_nice_if_this_was_the_real_flag@no-flare.com --cwd But_sadly_it_isn't
```

The fake flag is `Wouldn't_it_be_nice_if_this_was_the_real_flag@no-flare.com`. The trailing argument is fairly clear about its status.

## The serializer can't send this

This is the clue I'd have wanted before any crypto guesses: the capture claims 16,914 bytes of feedback in a 4,096-byte buffer. Open `ThreatInvaders.dll` in [ILSpy](https://github.com/icsharpcode/ILSpy), select `SpaceInvaders.Game.TelemetryReporter.BuildDocument`, and switch the language dropdown to IL.

There was a tool wrinkle here: the included ILSpy 9.1 CLI emitted the entire assembly when `-il` and `-t` were combined. The GUI's method-level IL view avoids that.

`BuildDocument` has a 12-byte managed method header. Keep the address spaces separate:

| Address space | Method header | First IL instruction |
|---|---|---|
| DLL RVA | `0x7EC4` | `0x7ED0` |
| DLL file offset | `0x60C4` | `0x60D0` |
| Full bundle file offset | `0x9A00C4` | `0x9A00D0` |

The last row adds the DLL's bundle offset, `0x99A000`, to its file offsets.

These are the original instructions from `IL_0000` through `IL_0038`:

```il
IL_0000: ldstr ""
IL_0005: stloc.0
IL_0006: ldc.i4.0
IL_0007: stloc.1
IL_0008: ldarg.2
IL_0009: brfalse.s IL_0039
IL_000b: ldarg.2
IL_000c: ldlen
IL_000d: brfalse.s IL_0039
IL_000f: ldc.i4 4096
IL_0014: newarr [System.Runtime]System.Byte
IL_0019: stloc.2
IL_001a: ldarg.2
IL_001b: ldlen
IL_001c: conv.i4
IL_001d: ldc.i4 4096
IL_0022: call int32 [System.Runtime]System.Math::Min(int32, int32)
IL_0027: stloc.1
IL_0028: ldarg.2
IL_0029: ldloc.2
IL_002a: ldloc.1
IL_002b: call void [System.Runtime]System.Array::Copy(class [System.Runtime]System.Array, class [System.Runtime]System.Array, int32)
IL_0030: ldloc.2
IL_0031: ldloca.s 1
IL_0033: call string SpaceInvaders.Game.TelemetryReporter::EncodeFeedbackBuffer(uint8[], int32&)
IL_0038: stloc.0
```

Local 0 starts as the empty feedback string. Local 1 starts as length zero. A null or empty input skips the allocation and copy. Otherwise, the method allocates a 4,096-byte array, computes `Math.Min(feedback.Length, 4096)`, and copies that many bytes.

The instruction to remember is `ldloca.s 1`. It pushes the address of local 1. `EncodeFeedbackBuffer` receives the length by reference.

Later in the same method, that local becomes the JSON field:

```il
IL_0057: dup
IL_0058: ldloc.0
IL_0059: callvirt instance void SpaceInvaders.Game.TelemetryReporter/TelemetryDto::set_FeedbackB64(string)
IL_005e: dup
IL_005f: ldloc.1
IL_0060: callvirt instance void SpaceInvaders.Game.TelemetryReporter/TelemetryDto::set_FeedbackLength(int32)
```

The stock encoder lives at DLL RVA `0x7E5C`, with IL beginning at DLL file offset `0x6068`. Its reconstructed C#, minus an ILSpy diagnostic comment:

```csharp
private static string EncodeFeedbackBuffer(byte[] fixedBuffer, ref int length)
{
    if (fixedBuffer.Length != 4096)
    {
        throw new ArgumentException(
            $"feedback buffer must be exactly {4096} bytes",
            "fixedBuffer"
        );
    }

    if (length > 0)
    {
        return Convert.ToBase64String(fixedBuffer);
    }

    return "";
}
```

It reads `length`. It never writes through the reference.

That gives exactly two legal stock outputs:

| Feedback input | Serialized `feedback_b64` | Serialized `feedback_length` |
|---|---|---:|
| Null or empty | Empty string | `0` |
| Nonempty | Base64 of a complete 4,096-byte buffer | `1..4096` |

Now compare that to all five requests.

```powershell
$doc = Get-Content -Raw re-analysis/invaderstraffic/decoded/frame-672.json | ConvertFrom-Json
$doc | Select-Object session_id, feedback_length, games_played
[Convert]::FromBase64String($doc.feedback_b64).Length
```

Frame 672 reports `16914`, or `0x4212`, while its decoded buffer is exactly 4,096 bytes. It isn't the only impossible request:

| Frame | Advertised length | Decoded buffer size | Contents before padding | Stock contradiction |
|---:|---:|---:|---|---|
| 21 | `0` | 4096 | All zero | Nonempty Base64 with length zero |
| 280 | `0` | 4096 | 60 bytes of `Crashes sometimes. But overall very fun, could play all day!` | Nonempty Base64 with length zero |
| 468 | `8208 = 0x2010` | 4096 | 16 active bytes | Length exceeds the cap |
| 672 | `16914 = 0x4212` | 4096 | 530 active bytes | Length exceeds the cap |
| 821 | `16430 = 0x402E` | 4096 | 46 active bytes | Length exceeds the cap |

All five use session ID:

```text
478b635d-c335-4c12-b1de-16e0565be335
```

Sol's audit script checks those two legal cases:

```powershell
python re-analysis/invadersbundle/audit_telemetry.py re-analysis/invaderstraffic/decoded
```

The result:

```text
Stock-compatible requests: 0/5
```

Even the apparently boring first two requests fail. This was a much better lead than trying to find a magic score.

## The crypto detour and the native host

Sol spent time guessing encryption before it had the transform. One agent tried 7,224 AES-GCM and ChaCha20-Poly1305 combinations using API-key material, GUIDs, scores, hashes, and guessed nonces. A separate probe pushed that to 15,990. Zero authenticated results.

Raw DEFLATE at offsets 4, 6, and 10 in frame 672 produced four, two, and five bytes of distraction. Sol tightened the probe to require a terminated stream and at least 16 output bytes. The lengths looked tempting too: `530 = 512 + 18`, and `46 = 18 + 28`. None of it mattered; the native code explains every length without any AEAD.

The managed-code agent found no additional application assembly, module initializer, or managed resource carrying a hidden stage. It initially dismissed the native image as ordinary CoreCLR.

Sol then compared all 251 bundled framework DLLs against the matching official .NET 10.0.11 packages:

```powershell
python re-analysis/runtime-diff/compare_runtime.py ThreatInvaders/ThreatInvaders.exe re-analysis/runtime-diff/microsoft.netcore.app.runtime.win-x64.10.0.11.nupkg re-analysis/runtime-diff/microsoft.windowsdesktop.app.runtime.win-x64.10.0.11.nupkg
```

The totals:

```text
251 MATCH
0 DIFFER
0 NOT_IN_PACK
```

Every framework DLL matched. In a separate comparison, Sol used `pefile` to compare section sizes and SHA-256 hashes against `runtimes/win-x64/native/singlefilehost.exe` from `Microsoft.NETCore.App.Host.win-x64` 10.0.11. The host's `.text` differed from that stock binary, and a string comparison found an added `ReplaceHighscores`.

An unsigned diagnostic provider with version `42.42.42.42424` also attracted attention. It was a different CoreCLR DAC build - the Data Access Component debuggers use to read runtime state - with no connection Sol could find to the command channel. The method hooks were in the host.

## Follow the managed entrypoint replacement

Open `re-analysis/runtime-diff/host-image-only.exe` in IDA. Its preferred image base is `0x140000000`.

For the `.text` windows used here:

```text
VA          = 0x140000000 + RVA
file offset = RVA - 0xC00
```

Those file offsets also apply to the original full bundle, because this smaller artifact preserves the original prefix.

In IDA, press Shift+F12, find `ReplaceHighscores`, and follow its xrefs with X. The resolver is at VA `0x1400F5520`, RVA `0xF5520`. It retains the resolved method identities in globals; following xrefs to `qword_1407FE598`, `qword_1407FE5B8`, `qword_1407FE5C0`, or `qword_1407FE5C8` leads to `0x1400C6E30`.

CoreCLR represents each managed method with a [MethodDesc](https://github.com/dotnet/runtime/blob/main/docs/design/coreclr/botr/method-descriptor.md), which owns its entrypoint. When the JIT compiles a method, the runtime publishes the native code address through that method's entrypoint machinery; the slot can live in the MethodDesc itself or its MethodTable. Hooking that publication step lets this host swap the code for five specific methods without changing the managed DLL.

At `0x1400C6E30`, the hook compares the incoming method identity against its saved targets, preserves the original entrypoint, and substitutes its own function.

For the same view through IDASQL, start one session on the host copy. Install the [IDASQL](https://github.com/allthingsida/idasql) build matching your IDA version (9.3 here) alongside IDA and add that directory to `PATH` so the bare `idasql` command resolves:

```powershell
idasql -s re-analysis/runtime-diff/host-image-only.exe --http 0 --bind 127.0.0.1
```

Use the endpoint printed by that process in a second terminal:

```powershell
$endpoint = Read-Host 'Paste the IDASQL HTTP server URL printed at startup'

curl.exe --silent --show-error --fail-with-body --max-time 60 --data-binary "SELECT * FROM binary; SELECT disasm_range(0x1400C6E44,0x1400C6F05); SELECT disasm_range(0x1400C6699,0x1400C66E5); SELECT disasm_range(0x1400C6BF4,0x1400C6D33);" "$endpoint/query"
```

Don't open a database already owned by an IDA GUI through a second process.

This is the original publication-hook window, VA `0x1400C6E44` through `0x1400C6F00`, beginning at raw file offset `0xC6244`:

```x86asm
1400c6e44: mov     rdi, rcx
1400c6e47: test    rax, rax
1400c6e4a: jz      short loc_1400C6E5F
1400c6e4c: cmp     rcx, rax
1400c6e4f: jnz     short loc_1400C6E5F
1400c6e51: mov     cs:qword_1407FE5D8, rdx
1400c6e58: lea     rbx, sub_1400C66F0
1400c6e5f: mov     rax, cs:qword_1407FE598
1400c6e66: test    rax, rax
1400c6e69: jz      short loc_1400C6E7E
1400c6e6b: cmp     rdi, rax
1400c6e6e: jnz     short loc_1400C6E7E
1400c6e70: mov     cs:qword_1407FE5D0, rbx
1400c6e77: lea     rbx, sub_1400C6A70
1400c6e7e: mov     rax, cs:qword_1407FE5C8
1400c6e85: test    rax, rax
1400c6e88: jz      short loc_1400C6E9D
1400c6e8a: cmp     rdi, rax
1400c6e8d: jnz     short loc_1400C6E9D
1400c6e8f: mov     cs:qword_1407FE5E0, rbx
1400c6e96: lea     rbx, sub_1400C6B70
1400c6e9d: mov     rax, cs:qword_1407FE5C0
1400c6ea4: test    rax, rax
1400c6ea7: jz      short loc_1400C6EBC
1400c6ea9: cmp     rdi, rax
1400c6eac: jnz     short loc_1400C6EBC
1400c6eae: mov     cs:qword_1407FE5B0, rbx
1400c6eb5: lea     rbx, sub_1400C6BA0
1400c6ebc: mov     rax, cs:qword_1407FE5B8
1400c6ec3: test    rax, rax
1400c6ec6: jz      short loc_1400C6EDB
1400c6ec8: cmp     rdi, rax
1400c6ecb: jnz     short loc_1400C6EDB
1400c6ecd: mov     cs:qword_1407FE5A8, rbx
1400c6ed4: lea     rbx, sub_1400C6DF0
1400c6edb: call    sub_140087270
1400c6ee0: test    al, al
1400c6ee2: jz      short loc_1400C6F05
1400c6ee4: mov     rcx, rdi
1400c6ee7: call    sub_1400C8210
1400c6eec: test    al, al
1400c6eee: jz      short loc_1400C6F05
1400c6ef0: xor     r8d, r8d
1400c6ef3: mov     rdx, rbx
1400c6ef6: mov     rbx, [rsp+28h+arg_8]
1400c6efb: add     rsp, 20h
1400c6eff: pop     rdi
1400c6f00: jmp     sub_1400C7F60
```

Immediately before this window, `RBX` receives the proposed native entrypoint from `RDX`, and `RAX` receives the first saved method identity.

`RCX`, then `RDI`, carries the native `MethodDesc`. Each `test` checks that a target was resolved; each `cmp` checks whether this is that particular managed method. A matching branch saves the original pointer and puts the replacement address in `RBX`.

For the encoder, the save is at `0x1400C6EAE`, followed by:

```x86asm
1400c6eb5: lea     rbx, sub_1400C6BA0
```

At the end, `mov rdx,rbx` passes the chosen pointer onward into the entrypoint-publication path.

The recovered targets are:

| Managed method | Native replacement RVA |
|---|---:|
| `LocalHighscoreStore.ReplaceHighscores` | `0xC66F0` |
| `UpdateLauncher.LaunchUpdate` | `0xC6A70` |
| `TelemetryReporter.HasFeedback` | `0xC6B70` |
| `TelemetryReporter.EncodeFeedbackBuffer` | `0xC6BA0` |
| `TelemetryReporter.GetSessionID` | `0xC6DF0` |

There's a separate wrapper for `TelemetryReporter.GetMachineGuid` at RVA `0xF54E0`, outside the five selections above. Its call/copy at VA `0x1400F5501` through `0x1400F550C` saves the original result's 16 raw bytes. The session wrapper similarly saves its 16 bytes at `0x1400C6E1B`.

The game assembly stays unchanged while these managed calls enter native replacements.

## Explain the impossible length

The length cap works exactly as written, and the hook just changes the length afterward. Jump to the replacement encoder at `0x1400C6BA0`.

Its unrolled XOR operations at `0x1400C6BF4` through `0x1400C6CF9` construct:

```text
bootstrap[i] = machineGuid[i] XOR sessionGuid[15 - i]
```

The relevant native stores are:

| Host VA | Effect |
|---|---|
| `0x1400C6D1D` | Set the saved length to `8208`, hexadecimal `0x2010` |
| `0x1400C6D8A` | OR the captured stdout length with `0x4000` |
| `0x1400C6DB1` | Write that value through the encoder's length-reference argument |

That final store changes local 1 in `BuildDocument`. The `Math.Min` happened before the call. There is no second cap after it.

Frames 21 and 280 take the ordinary-encoding path at `0x1400C6D97`, but still reach the store at `0x1400C6DB1`: the hook replaces the length with the zero saved in `qword_1407FE5E8` after the stock encoder has already returned the nonempty Base64 string.

The upper bits describe the phase, while the lower bits carry the active size in these captured records:

```text
0x2010 -> bootstrap tag 0x2000, active length 0x010 = 16
0x4212 -> output tag    0x4000, active length 0x212 = 530
0x402E -> output tag    0x4000, active length 0x02E = 46
```

The JSON still carries a Base64 encoding of a 4,096-byte array. The remaining bytes are zero padding. `feedback_length & 0xFFF` recovers these three active lengths.

## Read the leaderboard as a command channel

The first unusual entry is `BOOM`, score `31337`, with comment:

```text
ZnVuIQ== -> fun!
```

It first appears at frame 221 and is still present at frame 322. Before the bootstrap has been sent, the highscore hook hashes the first four decoded comment bytes at `0x1400C69F6` and compares against `0x05045A536B62B2C6`, the hash of `fun!`. With both GUID-captured flags set, it writes `1` to `byte_1407FD5FE` at `0x1400C6A23`, requesting the bootstrap record. The trigger is the comment, not the name `BOOM` or score `31337`.

Later, two rank-one entries appear for one poll each:

| Frame | Name | Score | Decoded comment size |
|---:|---|---:|---:|
| 651 | `BANANA` | `2066361377 = 0x7B2A2C21` | 18 |
| 800 | `BENIGN` | `1932142625 = 0x732A2821` | 28 |

The next polls don't contain them. Adjacent health responses still report ten entries, and there's no corresponding client highscore POST.

Inspect the first entry directly:

```powershell
$first = (Get-Content -Raw re-analysis/invaderstraffic/decoded/frame-651.json | ConvertFrom-Json).entries[0]
$first | Select-Object player_name, score, comment_b64
[Convert]::FromBase64String($first.comment_b64).Length
```

The Base64-decoded ciphertexts are:

```text
BANANA, frame 651:
f9b98fb126700b7788443febbea5c57e7cdf

BENIGN, frame 800:
19e9e3319836f33895fc45366134431a66484953ec12b6aaac23b4de
```

The native handler uses the score and the first four UTF-8 name bytes as a selector:

```text
0x7B2A2C21 XOR LE32("BANA") = 0x3A646D63
0x732A2821 XOR LE32("BENI") = 0x3A646D63

0x3A646D63 in little-endian byte order:
63 6d 64 3a
 c  m  d  :
```

That input is assembled at host VA `0x1400C680F`. The selected comment reaches the byte transform at `0x1400C686F`.

The name and score jointly encode `cmd:`, so the handler doesn't need magic string comparisons for the names.

After decryption, those comments contain a command path and argument separated by `;`. The `LaunchUpdate` replacement can substitute those buffers, call the original launch helper, and capture stdout. At `0x1400C6B4B`, it passes that output through the same transform before sending it back as telemetry.

A leaderboard delivers shell commands, the updater executes them, and feedback carries the output. That's a hell of a feature for a Space Invaders game. I'm happy to stick to decrypting the capture.

## Recover the capture machine's GUID

The first 16 bytes of frame 468 are:

```text
54 ae 03 2e a8 75 b0 f8 cc 57 8a 51 1f e7 16 31
```

The encoder gives the relationship:

```text
bootstrap[i] = machineGuid[i] XOR sessionGuid[15 - i]
```

XOR the same session byte back in and the machine byte is recovered.

GUID byte order is where this goes wrong. The session text is:

```text
478b635d-c335-4c12-b1de-16e0565be335
```

A Windows/.NET GUID stores its first DWORD and next two WORDs little-endian. The remaining eight bytes retain their order. Python exposes that representation as `.bytes_le`.

| Step | Bytes |
|---|---|
| `session.bytes_le` | `5d638b4735c3124cb1de16e0565be335` |
| `session.bytes_le[::-1]` | `35e35b56e016deb14c12c335478b635d` |
| Bootstrap XOR reversed session bytes | `614d587848636e4980454964586c756c` |

Render that last byte sequence with `uuid.UUID(bytes_le=...)` and the result is:

```text
78584d61-6348-496e-8045-4964586c756c
```

Reversing the printed GUID string is a different operation. So is reversing `uuid.UUID(...).bytes`. Either gives the wrong seed.

This recovers the capture machine's GUID, not your own registry value.

The native seed mixer occupies host RVA `0xC65FF` through `0xC6692`. It reads the machine bytes as two little-endian 64-bit words:

```text
lo = 0x496E634878584D61
hi = 0x6C756C5864494580
```

`MUL` and `ADD` below are the [Knuth MMIX LCG constants](https://en.wikipedia.org/wiki/Linear_congruential_generator), also used as PCG's default 64-bit multiplier and increment. This transform takes the top byte directly, without PCG's output permutation. The complete Python reproduction of the seed mixer and transform from `recover_flag.py` is:

```python
MASK64 = (1 << 64) - 1
MUL = 0x5851F42D4C957F2D
ADD = 0x14057B7EF767814F


def native_seed(machine_guid_bytes_le: bytes) -> int:
    lo = int.from_bytes(machine_guid_bytes_le[:8], "little")
    hi = int.from_bytes(machine_guid_bytes_le[8:], "little")
    x = (lo ^ (hi + (lo << 6) + (lo >> 2) - 0x61C8864680B583EB)) & MASK64
    t = (0xFF51AFD7ED558CCD * (x ^ (x >> 33))) & MASK64
    u = (0xC4CEB9FE1A85EC53 * (t ^ (t >> 29))) & MASK64
    return u ^ (u >> 32)


def transform(data: bytes, state: int) -> tuple[bytes, int]:
    out = bytearray(len(data))
    for index, byte in enumerate(data):
        state = (state * MUL + ADD) & MASK64
        out[index] = byte ^ (state >> 56)
    return bytes(out), state
```

For this machine GUID, `native_seed` returns:

```text
0xC4BFC80D59D86B9B
```

## Keep the full state, then take its top byte

The native transform starts at VA `0x1400C65E0`. At `0x1400C65EA` it loads global state `qword_1407FFA20`. The branch at `0x1400C65F9` skips seed construction when that state already exists.

The byte loop is at VA `0x1400C6699` through `0x1400C66E3`, starting at file offset `0xC5A99`:

```x86asm
1400c6699: xor     ecx, ecx
1400c669b: test    edi, edi
1400c669d: jz      short loc_1400C66E5
1400c669f: mov     r8, 5851F42D4C957F2Dh
1400c66a9: mov     r9, 14057B7EF767814Fh
1400c66b3: nop     dword ptr [rax+00h]
1400c66b7: nop     word ptr [rax+rax+00000000h]
1400c66c0: imul    rax, r8
1400c66c4: lea     rdx, [rax+r9]
1400c66c8: mov     cs:qword_1407FFA20, rdx
1400c66cf: shr     rdx, 38h
1400c66d3: xor     [rbx+rcx], dl
1400c66d6: inc     ecx
1400c66d8: cmp     ecx, edi
1400c66da: jnb     short loc_1400C66E5
1400c66dc: mov     rax, cs:qword_1407FFA20
1400c66e3: jmp     short loc_1400C66C0
```

`RBX` points to the buffer. `EDI` is its active length. `ECX` is the byte index, and `RAX` holds the current generator state.

The multiply and add wrap at 64 bits:

```text
state = (state * 0x5851F42D4C957F2D + 0x14057B7EF767814F) mod 2^64
```

The code saves that full state before shifting the temporary in `RDX`. `38h` is 56 decimal, so `DL` becomes the updated state's top byte:

```text
output_byte = input_byte XOR (state >> 56)
```

This is a 64-bit linear congruential generator used as an XOR stream. There's no authentication tag. So much for the AES-GCM and ChaCha20-Poly1305 guesses.

The constants matter less than the fact that the state is global: it survives the return, and both directions share it.

## Decrypt the records in capture order

Commands and replies take turns in one stream. It contains four encrypted records:

| Record | Active bytes | Keystream interval | State after record |
|---|---:|---|---|
| Frame 651, `BANANA` comment | 18 | `[0,18)` | `0xADC977B0537D0DD5` |
| Frame 672, directory stdout | 530 | `[18,548)` | `0xE0A7ED13C894471F` |
| Frame 800, `BENIGN` comment | 28 | `[548,576)` | `0xAA2878B62761D1DB` |
| Frame 821, file stdout | 46 | `[576,622)` | `0x6E17AF91D88B5E71` |

![Reconstruction of the bootstrap GUID recovery and four records sharing one continuous LCG state](/img/flare-on-13-writeups/ch6-record-chain.svg)

<small>The record-chain diagram: commands and stdout take turns consuming the same stream.</small>

Frame 468 supplies the bootstrap material. It doesn't consume the first 16 bytes of this encrypted stream.

Starting at the recovered seed, frame 651 decrypts to:

```text
cmd:cmd.exe;/c dir
```

The resulting state is `0xADC977B0537D0DD5`. Continue from there for exactly 530 bytes of frame 672.

The recovered output, with its original CRLF line endings displayed as ordinary lines, is:

```text
 Volume in drive Z is Shared Folders
 Volume Serial Number is 0000-0064

 Directory of Z:\CTFs\FlareOn\SpaceInvaders\space-invaders\src\SpaceInvaders\bin\Release\net10.0-windows\publish\win-x64

15/09/2026  19:22    <DIR>          .
23/08/2026  10:30    <DIR>          ..
15/09/2026  19:34               324 config.json
30/08/2026  23:23                46 flag.txt
15/09/2026  17:29       116.238.508 ThreatInvaders.exe
               3 File(s)    116.238.878 bytes
               2 Dir(s)  216.322.199.552 bytes free
```

The listing puts `flag.txt` at 46 bytes, matching the final telemetry payload's active length.

The state is now `0xE0A7ED13C894471F`. Use it on frame 800's 28-byte comment:

```text
cmd:cmd.exe;/c type flag.txt
```

Then decrypt the final 46 bytes starting from `0xAA2878B62761D1DB`.

Sol tried resetting the state. Decrypting `BENIGN` from the initial seed produced:

```text
833d08badd2b9c6178c01fe6f0f2a60073e542e46ba3b02fa264dbd4
```

Skipping the directory output and decrypting either `BENIGN` or the final payload immediately after `BANANA` also produced garbage.

By the time the final record arrives, the generator has consumed `18 + 530 + 28 = 576` bytes. Starting fresh fails. Consuming the entire 4,096-byte padded directory buffer also fails, because those padding bytes were never part of the encrypted stdout.

So if `BANANA` decrypts and the rest doesn't, the seed's fine. You've lost your place in the stream.

## Replay the recovery without running the game

Sol's recovery script uses only Python's standard library:

```powershell
python re-analysis/invaderscrypto/recover_flag.py re-analysis/invaderstraffic/decoded
```

Or use the freshly regenerated HTTP bodies:

```powershell
python re-analysis/invaderscrypto/recover_flag.py re-analysis/invaderstraffic/decoded-followalong
```

It validates the input before attempting the chronological decode. These are the frame-loading and command-selection helpers from the script:

```python
import argparse
import base64
import hashlib
import json
import uuid
from pathlib import Path


def load_frame(root: Path, number: int) -> dict:
    obj = json.loads((root / f"frame-{number}.json").read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        raise ValueError(f"Frame {number} must contain a JSON object")
    return obj


def load_phase(root: Path, number: int, expected_length: int, expected_tagged_length: int) -> tuple[dict, bytes]:
    obj = load_frame(root, number)
    if obj["feedback_length"] != expected_tagged_length:
        raise ValueError(f"Frame {number}: unexpected tagged feedback_length")
    packed = base64.b64decode(obj["feedback_b64"], validate=True)
    if len(packed) != 4096 or any(packed[expected_length:]):
        raise ValueError(f"Frame {number}: expected zero-padded 4096-byte feedback")
    return obj, packed[:expected_length]


def load_score_comment(root: Path, number: int, expected_name: str, expected_length: int) -> bytes:
    entry = load_frame(root, number)["entries"][0]
    if entry["player_name"] != expected_name:
        raise ValueError(f"Frame {number}: expected the {expected_name} entry at rank one")
    name4 = entry["player_name"].encode("utf-8")[:4]
    if len(name4) != 4 or (entry["score"] ^ int.from_bytes(name4, "little")) != 0x3A646D63:
        raise ValueError(f"Frame {number}: native score/name selector is not 'cmd:'")
    comment = base64.b64decode(entry["comment_b64"], validate=True)
    if len(comment) != expected_length:
        raise ValueError(f"Frame {number}: expected {expected_length}-byte comment")
    return comment


def parsed_command(plaintext: bytes, name: str) -> str:
    if not plaintext.startswith(b"cmd:") or b";" not in plaintext[4:]:
        raise ValueError(f"{name}: decrypted bytes lack native 'cmd:' / ';' command framing")
    path, _, argument = plaintext[4:].partition(b";")
    if not path or not argument:
        raise ValueError(f"{name}: empty command path or argument")
    return path.decode("ascii") + " " + argument.decode("ascii")
```

Together with `MASK64`, `MUL`, `ADD`, `native_seed`, and `transform` shown earlier, this is the remaining recovery path:

```python
def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("decoded", type=Path, help="directory of frame-N.json captured HTTP bodies")
    args = p.parse_args()
    root = args.decoded

    phase1, nonce = load_phase(root, 468, 16, 0x2010)
    phase2, directory_ciphertext = load_phase(root, 672, 530, 0x4212)
    phase3, flag_ciphertext = load_phase(root, 821, 46, 0x402E)

    if not (phase1["session_id"] == phase2["session_id"] == phase3["session_id"]):
        raise ValueError("Phase requests belong to different sessions")

    digest = hashlib.sha256(directory_ciphertext).hexdigest()
    if digest != "45f3e775c701a9d59f5694df495e4c5960fe1197287f2c092afa290e31cc2430":
        raise ValueError(f"Frame 672: SHA-256 mismatch: {digest}")

    if flag_ciphertext.hex() != "4a275439d3d2f48e83716a4243be8e266db6bf7554b36fd1cef652b54bfac70f5bfaa393893afd6c24cd4d3bb203":
        raise ValueError("Frame 821: ciphertext mismatch")

    session = uuid.UUID(phase1["session_id"])
    machine_le = bytes(a ^ b for a, b in zip(nonce, session.bytes_le[::-1]))
    state = native_seed(machine_le)
    print(f"MachineGuid: {uuid.UUID(bytes_le=machine_le)} (raw={machine_le.hex()}); initial state={state:#018x}")

    banana = load_score_comment(root, 651, "BANANA", 18)
    command, state = transform(banana, state)
    print(f"BANANA command: {parsed_command(command, 'BANANA')} ; state={state:#018x}")

    directory, state = transform(directory_ciphertext, state)
    listing = directory.decode("ascii")
    if "flag.txt" not in listing:
        raise ValueError("Frame 672: directory listing does not contain flag.txt")
    print(f"Directory output ({len(directory)} bytes):\n{listing}")
    print(f"State after directory: {state:#018x}")

    benign = load_score_comment(root, 800, "BENIGN", 28)
    command, state = transform(benign, state)
    print(f"BENIGN command: {parsed_command(command, 'BENIGN')} ; state={state:#018x}")

    flag, state = transform(flag_ciphertext, state)
    if not flag.endswith(b"@flare-on.com"):
        raise ValueError("Frame 821: decoded output is not a FLARE-On flag")
    print(f"FLAG ({len(flag)} bytes): {flag.decode('ascii')} ; state={state:#018x}")


if __name__ == "__main__":
    main()
```

The variable named `nonce` holds the bootstrap XOR record, not an AEAD nonce. The script refuses to run if the frames don't match the ones above.

The decode works through these values (output trimmed and reformatted, flag omitted):

```text
MachineGuid: 78584d61-6348-496e-8045-4964586c756c
raw=614d587848636e4980454964586c756c
initial state=0xc4bfc80d59d86b9b

BANANA command: cmd.exe /c dir
state=0xadc977b0537d0dd5

Directory output: 530 bytes
State after directory: 0xe0a7ed13c894471f

BENIGN command: cmd.exe /c type flag.txt
state=0xaa2878b62761d1db

Final output: 46 bytes
state=0x6e17af91d88b5e71
```

CTFd accepted the final plaintext. A long strange trip, according to the flag. After watching Muse spend five and a half hours here, I can't argue with that.

Accepted flag: >!`wh4t_4_l0ng_str4ng3_tr1p_1ts_b33n@flare-on.com`!<
