---
title: "flare-on 13: GhostStream"
description: "A WIM with an NTFS alternate data stream, a seven-day gate, and a child process that sabotages its own strlen."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/ghoststream/
challenge: 2
challengeName: "GhostStream"
---

<small class="writeup-stat">Me: 14:28, 18.64M tokens, $4.89, stepped in 3 times.<br>Truix: 4:41, 2.85M tokens, $1.50, stepped in once.</small>

I wasn't expecting a Harry Potter challenge in [FLARE-On](https://flare-on.com/) to end with a Game of Thrones reference. Getting there took a hidden NTFS stream, a seven-day wait Sol wasn't going to sit through, and a `strlen` that lies.

The parent reads the potion text file or its hidden stream, then transforms the buffer in a window procedure. It sends the result over `\\.\pipe\FlareChallenge` as a key for its embedded child executable. The child decrypts a 38-byte blob using an RC4 variant, a repeating spell string, and a string length. Two parent gates stand in the way, and the child lies about that length.

![GhostStream path from the hidden stream through the parent selector, process-age gate, and GUI transform to the named pipe and child decryptor](/img/flare-on-13-writeups/ch2-stream-pipe-child.svg)

<small>Sol patched both parent gates to reach the transform and capture the pipe key.</small>

## Keep the alternate stream

GhostStream came in a WIM image with an executable and a text file about Polyjuice Potion. The text says Ron added too much boomslang skin and the transformation now lasts exactly seven days. Sol found the hidden stream almost immediately, then spent much longer getting the program to use it.

Extract this onto NTFS or you lose the stream. Sol used these commands:

```powershell
& 'C:\Program Files\7-Zip\7z.exe' x -y -pflare 2-GhostStream.7z
& 'C:\Program Files\7-Zip\7z.exe' l -slt GhostStream.wim
& 'C:\Program Files\7-Zip\7z.exe' x -y GhostStream.wim
```

The WIM listing identifies the extra file data before Sol even opens the executable:

```text
Path = GhostStream\PolyjuicePotion.txt
Folder = -
Size = 316
Alternate Stream = -
Alternate Streams = 1
```

The extraction reported:

```text
Folders: 1
Files: 2
Alternate Streams: 1
Alternate Streams Size: 18
Size:       35644
```

Copying the visible text onto FAT or exFAT loses the named stream. If your extraction produces only the ordinary file contents, fix that before debugging anything.

In Windows PowerShell 5.1:

```powershell
Get-Item -LiteralPath 'GhostStream/PolyjuicePotion.txt' -Stream * |
    Format-Table Stream,Length

[BitConverter]::ToString(
    [byte[]](Get-Content -LiteralPath 'GhostStream/PolyjuicePotion.txt' `
        -Stream 'LordVoldemort' -Encoding Byte)
)
```

The result is:

```text
Stream        Length
------        ------
:$DATA           316
LordVoldemort     18

41-6C-62-75-73-44-75-6D-62-6C-65-64-6F-72-65-20-0D-0A
```

Those 18 bytes are:

```python
b"AlbusDumbledore \r\n"
```

Keep the space before `\r\n`. `AlbusDumbledore` is 15 bytes, the space makes 16, and CRLF makes 18. The space matters for Sol's first attempt to use the stream contents directly as a pipe key.

<details>
<summary>File hashes</summary>

The archive, WIM, parent, and extracted child have these SHA-256 values:

| File | SHA-256 |
|---|---|
| `2-GhostStream.7z` | `52f4c307c62169699523219def0e36f523a8b8e31e192972a0c234031d42c413` |
| `GhostStream.wim` | `6c5cd2798e359a9196118617bdcc71afede1b0916dc6e713b9af4e5c3a716469` |
| `GhostStream/GhostStream.exe` | `20a879a65d0408de57a6b94dcf011b5eaa52527673f52c3e18574038c7f07ff2` |
| `GhostStream/Partner_CTF.exe` | `4df12c144f031e324e2f53ccfe38ade3460913aefaa2f785d072549300218af3` |

</details>

`Partner_CTF.exe` is the child executable embedded in the parent's `BIN/101` resource. Both are x64 Windows PEs. The child is 14,848 bytes.

## Pull out the child without running the parent

Sol initially tried extracting `.rsrc/BIN/101` with 7-Zip. That reported `No files to process`. Trying the name `101` did the same thing. Extracting everything produced the child's sections under `GhostStream/peparts`, rather than a usable copy of the whole embedded PE.

The listing showed what was happening:

```text
Path = .rsrc\BIN\101
Size = 14848
Packed Size = 14848
--
Path = .rsrc\BIN\101
Type = PE
Physical Size = 14848
CPU = x64
```

7-Zip had descended into the embedded executable. Sol moved to `pefile`, which was already installed:

```powershell
py -3.12 -c "import pefile; print(pefile.__version__)"
```

The installed version was `2024.8.26`. Sol extracted the child with:

```python
import pefile, pathlib

pe = pefile.PE('GhostStream/GhostStream.exe')
for e in pe.DIRECTORY_ENTRY_RESOURCE.entries:
    for e2 in e.directory.entries:
        for e3 in e2.directory.entries:
            d = e3.data.struct
            print(e.name or e.id, e2.name or e2.id, d.OffsetToData, d.Size)
            if d.Size == 14848:
                pathlib.Path('GhostStream/Partner_CTF.exe').write_bytes(
                    pe.get_data(d.OffsetToData, d.Size)
                )
```

It reported:

```text
BIN 101 32944 14848
24 1 47792 381
```

`OffsetToData` is the resource data RVA. `pe.get_data()` handles the RVA-to-file translation. This reads the parent and writes a separate child file; it doesn't launch either executable.

Sol did launch the parent for a baseline. After roughly ten seconds, it produced:

```text
[*] Try harded to find the secrets.
[+] Execution complete.
Press any key to continue . . .
[Partner] Process started.

[FAILED] Try again with better debugging
```

There's no need to repeat that launch to recover the flag.

Around here, Sol was also hunting for my IDA installation and [IDASQL](https://github.com/allthingsida/idasql), which exposes an IDA database through SQL. The executable reader couldn't import `ida_domain` and `idapro`, `idasql --version` returned `command not found`, and a glob across my user directory timed out. It fell back to Capstone while looking.

At 23:10:03 ET I pointed it at the install:

> idasql is at [my IDA folder] btw

## Follow the parent's filename selector

The image base is `0x140000000` for both executables. Keep the three address forms separate:

| Location | VA in IDA | RVA | File offset |
|---|---|---|---|
| Parent ADS selector | `0x140001A8C` | `0x1A8C` | `0xE8C` |
| Parent age comparison | `0x140001BAA` | `0x1BAA` | `0xFAA` |
| Child `strlen` call | `0x1400014F7` | `0x14F7` | `0x8F7` |
| Child success branch | `0x1400016A4` | `0x16A4` | `0xAA4` |

The RVA is `VA - image_base`. A file offset also depends on the PE section mapping. Seeking to file offset `0x14F7` won't land on the child's call instruction.

In IDA, load an unaltered working copy, press `G`, and enter the full VA. `Space` switches to text view, `X` follows references, and `F5` gives pseudocode if the decompiler is available.

Sol's IDASQL queries pulled out the two parent branches. I've shortened the executable path to `idasql`:

```powershell
$analysis = Join-Path $env:TEMP ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $analysis | Out-Null

Copy-Item -LiteralPath 'GhostStream/GhostStream.exe' `
    -Destination (Join-Path $analysis 'GhostStream.exe')

idasql -s (Join-Path $analysis 'GhostStream.exe') -q "SELECT * FROM binary; SELECT disasm_range(0x140001A8C,0x140001AA5); SELECT disasm_range(0x140001BA6,0x140001BB7);"
```

The `binary` result should have the original parent hash, `20a879...7f07ff2`, rather than one of the diagnostic copies.

The selector is small:

```x86asm
; GhostStream.exe
; VA 0x140001A8C, RVA 0x1A8C, file offset 0xE8C

140001a8c: cmp     cs:dword_140006668, 1
140001a93: jnz     short loc_140001AC0
140001a95: mov     r8, [rdi+10h]
140001a99: mov     rdx, [rdi+8]
140001a9d: mov     rcx, [rdi]
140001aa0: call    sub_140001130
```

Unless the global DWORD equals exactly `1`, `jnz` skips the decode-and-format path. The ordinary filename is:

```text
%sPolyjuicePotion.txt
```

The gated path decodes:

```text
%sPolyjuicePotion.txt:LordVoldemort
```

The `%s` is the parent executable's directory. The decoder also uses the executable's basename, so preserve `GhostStream.exe` when making a diagnostic copy.

GhostRuntime, the subagent handling the parent's stream and runtime gates, later reproduced that filename decode. The 35 encoded bytes come from immediates at parent RVA `0x1F1B` through `0x1F59`:

```text
f2401d3c394637423630321d3c41363c3bfb41454107193c3f31233c3931323a3c3f41
```

The decoder at VA `0x140001130` sums those bytes modulo 256. The sum is `0xE1`, which selects mode `2`. Its filename-dependent value is:

```text
filename = GhostStream.exe
filename[0] = G
filename[len(filename) >> 1] = r
G XOR r = 0x35
```

For that mode, each output byte is:

```text
(0x35 + encoded_byte - 2) & 0xFF
```

The resulting bytes are:

```text
2573506f6c796a75696365506f74696f6e2e7478743a4c6f7264566f6c64656d6f7274
```

Which gives the ADS filename above. The same decoder recovers `\\.\pipe\FlareChallenge` from another constant.

Sol initially applied the decoder's other formula, `(encoded_byte + 1) XOR filename_value`, to this input. That was the wrong mode. Checking the `0xE1` checksum against the switch fixed it. Renaming the parent to `a.exe` also produces garbage because it changes the filename-derived value.

An xref query for `dword_140006668` found its read at the comparison, with no ordinary initialization setting it to `1`. In `GhostStream/debug/GhostStream.exe`, Sol changed the comparison's immediate byte at RVA `0x1A92` from `01` to `00`, so the default zero now selected the ADS path.

## Seven days means process age

Seven days sounded excessive to me. The calculation in `main` takes the potion clue literally:

```x86asm
; GhostStream.exe, original Capstone listing
; Length calculation and multiplication

140002054 mov      rax, rbx
140002057 inc      rax
14000205a cmp      byte ptr [rcx + rax], 0
14000205e jne      0x140002057
140002060 mov      edx, 0x5c
140002065 imul     esi, eax, 0x29f
```

Later:

```x86asm
140002234 mov      r8d, 1
14000223a add      esi, 0xf
14000223d call     qword ptr [rip + 0x1e15]
```

`GhostStream.exe` is 15 characters long. `0x29F` is 671, so the threshold is:

```text
15 * 671 + 15 = 10080 minutes
10080 / 60 / 24 = 7 days
```

The helper at VA `0x140001680` resolves time APIs through `GetProcAddress` at `0x140001720` and `0x1400017EA`. It obtains the current process handle at `0x140001732`, collects its creation time through the call at `0x140001754`, and subtracts that FILETIME from the current FILETIME.

The decompiled assignment is:

```c
/* 14000182E */ qword_140006670 = (v11 - v12) / 0x23C34600uLL;
```

`0x23C34600` is `600000000`, the number of 100-nanosecond FILETIME ticks in a minute. The value is whole process-age minutes. Changing the WIM timestamp wouldn't help.

`main` loads that value at `0x1400022DF` and passes it to the window procedure alongside the threshold. The relevant window-procedure data fields are:

| Offset from `r9` | Use on this path |
|---|---|
| `+0x00` | Pointer to the file/pipe-key buffer |
| `+0x08` | Pointer to a separate buffer used by the other age branch |
| `+0x10` | Elapsed process-age minutes |
| `+0x18` | Threshold, `10080` |
| `+0x20` | Previous GUI message value |

The decision is:

```x86asm
; GhostStream.exe
; VA 0x140001BA6, RVA 0x1BA6
; cmp at VA 0x140001BAA, file offset 0xFAA

140001ba6: mov     rax, [r9+18h]
140001baa: cmp     [r9+10h], rax
140001bae: jbe     loc_140001C34
140001bb4: mov     rdx, [r9]
```

`jbe` is unsigned less-than-or-equal. The transform path therefore requires elapsed time greater than `10080`, not equal to it.

The other path mutates the separate buffer and puts it in the `SESSION_TOKEN_CACHE` environment variable with `SetEnvironmentVariableA`.

There's also a listener on `127.0.0.1:31337` accepting `OVERRIDE:`. It XORs the supplied bytes with `0x33`, then adds `5`, writing the result into the key buffer. Sol tried override-derived keys, which looked promising until GhostRuntime followed the next write: the main thread sleeps for ten seconds, then reads the key file into that same buffer. The file read overwrites the socket-provided bytes before the GUI transform.

## Turn Dumbledore into the pipe key

The window procedure remembers the previous message and combines its low byte with the current message:

```x86asm
; GhostStream.exe, original Capstone listing

140001b73 mov      eax, dword ptr [r9 + 0x20]
140001b77 mov      dword ptr [r9 + 0x20], ebx
140001b7b movzx    r11d, bl
140001b7f xor      r11b, al
140001b82 cmp      ebx, 1
140001b85 je       0x140001b9d
```

The transform happens on message `1`, `WM_CREATE`. After the age comparison, the first loop XORs the string with the byte in `r11b`. Then it applies this mask to the first 15 bytes:

```x86asm
140001bf7 xor      byte ptr [rdx], 0x8b
140001bfa xor      byte ptr [rdx + 1], 0x8f
140001bfe xor      byte ptr [rdx + 2], 0x92
140001c02 xor      byte ptr [rdx + 3], 0x85
140001c06 xor      byte ptr [rdx + 4], 0x88
140001c0a xor      byte ptr [rdx + 5], 0x96
140001c0e xor      byte ptr [rdx + 6], 0x98
140001c12 xor      byte ptr [rdx + 7], 0x9b
140001c16 xor      byte ptr [rdx + 8], 0x94
140001c1a xor      byte ptr [rdx + 9], 0x8b
140001c1e xor      byte ptr [rdx + 0xa], 0x95
140001c22 xor      byte ptr [rdx + 0xb], 0xe6
140001c26 xor      byte ptr [rdx + 0xc], 0xed
140001c2a xor      byte ptr [rdx + 0xd], 0xf0
140001c2e xor      byte ptr [rdx + 0xe], 0xe7
140001c32 jmp      0x140001c84
```

Sol first forced only the ADS selector in a diagnostic parent. The child received `AlbusDumbledore `, including the space, and still failed. It was reading the right stream now, but skipping the age-gated transformation.

In a later diagnostic run, Sol replaced the load at RVA `0x22DF` (file offset `0x16DF`) with `mov eax,10081; nop; nop`: `48 8b 05 8a 43 00 00` became `b8 61 27 00 00 90 90`. That made the value passed to the window procedure exceed the threshold. The captured child key was:

```text
key 11 b'HarryPotter'
```

The full reconstructed transformed buffer is:

```text
48 61 72 72 79 50 6f 74 74 65 72 00 00 00 00 a2 8f 88
```

The first NUL is at index 11. The parent sends the effective C-string `HarryPotter` through `\\.\pipe\FlareChallenge`.

Working backward from that captured key and the original mask gives a previous-message low byte of `0x83`, making the first XOR byte `0x83 ^ 1 = 0x82`. That fits `WM_NCCALCSIZE`; Sol recovered it from the key rather than logging the message itself.

Sol's short reconstruction reproduces the NUL-terminated key:

```python
ads = b"AlbusDumbledore \r\n"
mask = bytes.fromhex("8b 8f 92 85 88 96 98 9b 94 8b 95 e6 ed f0 e7")
observed_previous_message = 0x83  # inferred from the previously recorded forced-gate run
wire = bytes(a ^ (observed_previous_message ^ 1) ^ m for a, m in zip(ads, mask))
print(wire.split(b"\0", 1)[0])
# b'HarryPotter'
```

`zip()` stops after the 15 mask bytes. That covers the part containing the entire resulting C-string and its first four NULs. The full GUI transform also touches the remaining input bytes, which explains the `a2 8f 88` tail in the longer buffer.

## The child replaces `strlen`

The child reads from the pipe around VA `0x1400010E2` through `0x140001211`. Its key schedule at `0x14000139E` through `0x1400013EC` builds a 256-byte RC4 state from that input. The output loop also uses a repeating spell string as an XOR input and a length returned by `strlen`.

That `strlen` is lying.

Open the original `Partner_CTF.exe`, rather than `Partner_Debug.exe`, `Partner_19.exe`, or `Partner_18.exe`. Sol's IDASQL command:

```powershell
$analysis = Join-Path $env:TEMP ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $analysis | Out-Null

Copy-Item -LiteralPath 'GhostStream/Partner_CTF.exe' `
    -Destination (Join-Path $analysis 'Partner_CTF.exe')

idasql -s (Join-Path $analysis 'Partner_CTF.exe') -q "SELECT * FROM binary; SELECT disasm_range(0x1400014F3,0x1400014FD); SELECT disasm_range(0x140001699,0x1400016AD);"
```

The call looks ordinary:

```x86asm
; Partner_CTF.exe
; strlen call VA 0x1400014F7, RVA 0x14F7, file offset 0x8F7

1400014f3: lea     rcx, [rbp+310h+Str]; Str
1400014f7: call    cs:strlen
```

On Windows x64, `rcx` holds the first argument and `rax` receives the return value. The local string was copied from `Wingardium Leviosa`, an 18-byte ASCII literal at VA `0x140003380`.

But the child has already called `VirtualProtect` with `0x40` (`PAGE_EXECUTE_READWRITE`) to make the code at `ucrtbase!strlen` writable, then overwritten its first 23 bytes. These are the original stores:

```x86asm
; Partner_CTF.exe, original Capstone listing
; r14 holds the strlen code address

140001412 mov      rcx, r14
140001415 mov      edx, 0x17
14000141a mov      r8d, 0x40
140001420 call     qword ptr [rip + 0x1bea]
140001426 movups   xmm6, xmmword ptr [r14]
14000142a mov      ebx, dword ptr [r14 + 0x10]
14000142e lea      rdx, [rbp + 0x90]
140001435 movzx    edi, word ptr [r14 + 0x14]
14000143a lea      rcx, [rip + 0x1f2f]
140001441 movzx    esi, byte ptr [r14 + 0x16]
140001446 xorps    xmm0, xmm0
140001449 mov      dword ptr [r14], 0x1304c031
140001450 mov      r8d, 0x40
140001456 mov      dword ptr [r14 + 4], 0x17501b2
14000145e mov      dword ptr [r14 + 8], 0x301100e8
140001466 mov      dword ptr [r14 + 0xc], 0x48c2fe01
14000146e mov      dword ptr [r14 + 0x10], 0x2138c1ff
140001476 mov      word ptr [r14 + 0x14], 0xf375
14000147d mov      byte ptr [r14 + 0x16], 0xc3
```

Written little-endian, those immediates produce:

```text
31 c0 04 13 b2 01 75 01 e8 00 11 30 01 fe c2 48 ff c1 38 21 75 f3 c3
```

There is an overlapping-instruction trick in those bytes. A linear disassembly sees:

```text
+0x00  xor eax, eax
+0x02  add al, 0x13
+0x04  mov dl, 1
+0x06  jne +0x09
+0x08  call ...
```

The branch at `+0x06` enters at `+0x09`, inside what the linear sweep interpreted as a `call`. The bytes there are `00 11 30 01`: add `dl` to the byte at `rcx`, then XOR that byte with `al`. `dl` increments for each character. `al` remains `0x13`, so the return value is 19.

This also explains the spell string Sol initially got wrong. Before measuring the local `Wingardium Leviosa` buffer, the child calls the modified routine on its global string at VA `0x140005078`. The original disk bytes are:

```text
42 78 73 5d 62 76 60 5e 75 29 54 70 63 6e 6f 6c 56 6a 4e
```

The byte-level operation is an incrementing add followed by XOR `0x13`. For example, the first byte becomes `(0x42 + 1) ^ 0x13 = 0x50`, ASCII `P`. At runtime the whole string becomes:

```text
50 69 65 72 74 6f 74 75 6d 20 4c 6f 63 6f 6d 6f 74 6f 72
Piertotum Locomotor
```

Sol measured that runtime value at 23:15:29. Its earlier offline model had used the original disk literal:

```text
Bxs]bv`^u)TpcnolVjN
```

That model couldn't produce the right answer even with the correct pipe key.

After both calls, the child restores the saved CRT bytes and keeps the second return value in `r12`:

```x86asm
1400014ed call     qword ptr [rip + 0x1d1d]
1400014f3 lea      rcx, [rbp + 0x70]
1400014f7 call     qword ptr [rip + 0x1d13]
1400014fd movups   xmmword ptr [r14], xmm6
140001501 mov      dword ptr [r14 + 0x10], ebx
140001505 lea      r9, [rsp + 0x68]
14000150a mov      word ptr [r14 + 0x14], di
14000150f mov      edx, 0x17
140001514 mov      byte ptr [r14 + 0x16], sil
140001518 mov      rcx, r14
14000151b mov      r8d, dword ptr [rsp + 0x68]
140001520 mov      r12, rax
140001523 call     qword ptr [rip + 0x1ae7]
```

At 23:19:28, Sol captured the decoded global and the bogus length together:

```text
global b'Piertotum Locomotor\x00\x00\x00\x00\x00\x00' R12 19
```

## The length changes two parts of the cipher

The ciphertext is constructed from immediates in `main`, rather than stored as one obvious string:

```x86asm
; Partner_CTF.exe, original Capstone listing

140001211 mov      dword ptr [rsp + 0x40], 0x35875c96
140001219 mov      r8d, 0xda
14000121f mov      dword ptr [rsp + 0x44], 0x8b397ad7
140001227 lea      rcx, [rbp + 0xf6]
14000122e mov      dword ptr [rsp + 0x48], 0x286d0475
140001236 mov      dword ptr [rsp + 0x4c], 0xc85856bb
14000123e mov      dword ptr [rsp + 0x50], 0xe1daee35
140001246 mov      dword ptr [rsp + 0x54], 0x37a956a4
14000124e mov      dword ptr [rsp + 0x58], 0xf9561581
140001256 mov      dword ptr [rsp + 0x5c], 0xd340a27
14000125e mov      dword ptr [rsp + 0x60], 0x262c82ee
140001266 mov      word ptr [rsp + 0x64], 0xf8a5
```

Packed little-endian, that is 38 bytes:

```text
965c8735d77a398b75046d28bb5658c835eedae1a456a937811556f9270a340dee822c26a5f8
```

The key schedule is the usual RC4 permutation:

```text
S = [0, 1, ..., 255]
j = 0
for i = 0..255:
    j = (j + S[i] + key[i % key_length]) & 255
    swap S[i], S[j]
```

The output loop, or PRGA (pseudo-random generation algorithm), differs from ordinary RC4 in two places. It advances `i` by the measured string length, and adds that same length to each ciphertext byte before the XORs. So that extra byte breaks the cipher twice. I'd stop trying new keys at this point.

The child processes two bytes per iteration, for 19 iterations. This portion shows the first byte's cyclic spell lookup and addition:

```x86asm
1400015b3 mov      rax, rsi
1400015b6 mov      byte ptr [rcx], bl
1400015b8 movzx    ecx, byte ptr [rdx]
1400015bb xor      edx, edx
1400015bd div      r10
1400015c0 add      rcx, rbx
1400015c3 movzx    eax, dil
1400015c7 add      al, byte ptr [r11 - 1]
1400015cb movzx    ecx, cl
1400015ce movzx    ecx, byte ptr [rsp + rcx + 0x70]
1400015d3 xor      cl, byte ptr [rdx + r13]
1400015d7 xor      cl, al
1400015d9 lea      eax, [r9 + rdi]
1400015dd mov      byte ptr [r11 - 1], cl
```

`div r10` leaves the position modulo the spell length in `rdx`. `r13` points to `Piertotum Locomotor`, so `[rdx+r13]` selects the repeating spell byte. The low byte of `rdi` supplies the length-dependent addition. The next state index also advances by `rdi`.

Using `HarryPotter`, the correctly decoded spell, and length 19 produced this exact garbage:

```text
09f230b24368fe8669a87c38901441fb6542e940ff7ad113880492267f07d2947510fa206e8c
```

That matched the failing decode. Sol kept trying keys and spell variants anyway, including `LordVoldemort`, `Expelliarmus`, `Alohomora`, and `Avada Kedavra`. It also swept possible GUI XOR bytes. None of those repaired the length parameter.

## I gave the subagents credit too soon

At 23:18:56, Sol started GhostCipher, the subagent handling the cipher and child, alongside GhostRuntime on the parent.

At 23:19:33, I wrote:

> can you make subagents for RE sooner? We're already 9m 30s on this challenge

They had already been spawned about 37 seconds earlier. Sol told me they were running, then continued working in the main agent.

The decisive parameter sweep was the main agent's own call at 23:20:06. It tried length values `1` through `255` against `HarryPotter`, the ADS key, the ordinary text, and `LordVoldemort`. The result was:

```text
MATCH HarryPotter 18 b'y0u_kn0w_n07h1n6_j0n_5n0w@flare-on.com'
HarryPotter best [(38, 18), (22, 234), (22, 206)]
ADS best [(24, 149), (22, 169), (22, 93)]
text best [(23, 211), (23, 49), (22, 170)]
Lord best [(24, 201), (23, 118), (22, 231)]
```

Only the `HarryPotter`/18 combination produced the flag domain. It also produced 38 printable bytes out of 38.

At 23:20:20, I said:

> Yes I'm saying make it a rule to utilize the RE subagents sooner, look at how fast that was

I was wrong - the main agent had the flag 27 seconds before either subagent reported. GhostCipher's final report arrived at 23:20:33 and GhostRuntime's at 23:22:00.

GhostCipher pinned down the disk-string/runtime-string distinction and the two-byte output loop. GhostRuntime recovered the encoded ADS filename, explained the GUI transformation, and ruled out the network override as a required extra key source. Good work, just too late to deserve the credit I gave it for the solve.

## Reproduce the 18-byte decode

I'd take this over waiting seven days. Sol's read-only Python decoder doesn't need to run a PE, change a system clock, or create a named pipe.

The ciphertext comes from the original child immediates. The pipe key comes from the forced-gate parent capture and the ADS transformation. The spell comes from the runtime decoding above.

```python
# Read-only Python 3 reconstruction: cipher parts are immediates at
# original Partner_CTF.exe main VA 0x140001211-0x1400012A8.
parts = [
    (0x8B397AD735875C96, 8), (0xC85856BB286D0475, 8),
    (0x37A956A4E1DAEE35, 8), (0x0D340A27F9561581, 8),
    (640451310, 4), ((-1883) & 0xffff, 2),
]
cipher = b"".join(n.to_bytes(width, "little") for n, width in parts)
assert len(cipher) == 38
pipe_key = b"HarryPotter"      # observed diagnostic parent-to-child pipe message
spell = b"Piertotum Locomotor"  # observed after child's runtime XOR decoding

def decode(str_len):
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + pipe_key[i % len(pipe_key)]) & 255
        state[i], state[j] = state[j], state[i]
    i = j = 0
    result = bytearray()
    for n in cipher:
        i = (i + str_len) & 255  # unusual child PRGA stride
        j = (j + state[i]) & 255
        state[i], state[j] = state[j], state[i]
        value = ((n + str_len) & 255) ^ spell[len(result) % len(spell)]
        result.append(value ^ state[(state[i] + state[j]) & 255])
    return bytes(result)

print("pipe/key/cipher:", len(pipe_key), len(cipher))   # 11 38
print("natural length:", len(b"Wingardium Leviosa"))   # 18
print("18-byte model:", decode(18).decode("ascii"))
print("19-byte model:", decode(19).hex())
```

The two lengths give:

```text
pipe/key/cipher: 11 38
natural length: 18
18-byte model: y0u_kn0w_n07h1n6_j0n_5n0w@flare-on.com
19-byte model: 09f230b24368fe8669a87c38901441fb6542e940ff7ad113880492267f07d2947510fa206e8c
```

Changing `str_len` from 19 to 18 repairs both the PRGA stride and the ciphertext-byte addition. The 19-byte `Piertotum Locomotor` cycle stays unchanged.

This uses the natural length of the original literal. The unmodified child uses the sabotaged result, 19.

## The success print was patched too

Sol then made `Partner_18.exe`, fed it `HarryPotter`, and got:

```text
[SUCCESS] Decrypted Flag: y0u_kn0w_n07h1n6_j0n_5n0w@flare-on.com
```

Sol called that executable confirmation. That copy had a second patch, though.

The original verifier searches the output for `@flare-on.com` at VA `0x14000167B`, then checks the returned pointer:

```x86asm
; Partner_CTF.exe, original
; Branch VA 0x1400016A4, RVA 0x16A4, file offset 0xAA4

140001699: mov     rsi, [rsp+410h+arg_0]
1400016a1: test    rax, rax
1400016a4: jz      short loc_1400016F4
1400016a6: lea     rdx, [rbp+310h+var_240]
1400016ad: lea     rcx, aSuccessDecrypt; "\n[SUCCESS] Decrypted Flag: %s\n"
```

The saved diagnostic copy changes two places:

| Child RVA / file offset | Original bytes | `Partner_18.exe` bytes | Effect |
|---|---|---|---|
| `0x14F7` / `0x8F7` | `ff 15 13 1d 00 00` | `b8 12 00 00 00 90` | Replace `call strlen` with `mov eax,18; nop`. |
| `0x16A4` / `0xAA4` | `74 4e` | `90 90` | Remove the conditional jump after `strstr`, allowing the success print even when the domain check fails. |

Its SHA-256 is:

```text
dcb2fd5c446348bd726b5a1a859907dc2c8d35279a695d786838ab2b8f6fa3ce
```

The patch history explains the second change. At 23:13:27, Sol created `Partner_Debug.exe` by removing the success-check branch so it could see failed plaintext. At 23:13:56, it based `Partner_19.exe` on that already-patched copy and forced the length to 19. At 23:20:10, it based `Partner_18.exe` on `Partner_19.exe` and changed the immediate to 18.

The visibility patch survived every copy.

An earlier `[SUCCESS]` print even contains the 19-byte-model garbage. Removing the branch made it print success for that too.

For a clean native check, start from a fresh original child, change only the call at file offset `0x8F7`, leave `74 4e` intact at `0xAA4`, and feed the captured pipe key. Sol didn't run that one-patch version.

Sol submitted the decoded flag at 23:20:27. The next browser read showed `[*] Correct` with challenge three unlocked.

All those spells, and the answer is "you know nothing, Jon Snow." Wrong franchise, but after my subagent victory lap, fair enough.

The flag: >!`y0u_kn0w_n07h1n6_j0n_5n0w@flare-on.com`!<
