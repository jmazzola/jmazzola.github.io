---
title: "flare-on 13: ToxicMiner"
description: "A cpuminer fork hiding an almost-SHA-256 that hashes your volume serial, with the missing serial brute-forced on the GPU."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/toxicminer/
challenge: 4
challengeName: "ToxicMiner"
---

<small class="writeup-stat">Me: 15:34, 51.36M tokens, $12.74, didn't step in.<br>Truix: 10:35, 8.60M tokens, $2.65, stepped in twice, 1 refusal.</small>

Sol decoded the first thing in ToxicMiner's banner that looked like a flag and submitted it:

```text
bTFuM195MHVyXzB3bl9idXMxbjNzcw==@flare.com
```

Decode the Base64 part:

```powershell
python -c "import base64; print(base64.b64decode('bTFuM195MHVyXzB3bl9idXMxbjNzcw=='))"
```

```text
b'm1n3_y0ur_0wn_bus1n3ss'
```

Sol decoded the Base64, appended the expected [FLARE-On](https://flare-on.com/) domain and submitted `m1n3_y0ur_0wn_bus1n3ss@flare-on.com`. 

Yeah Sol, it's just that easy - CTFd rejected it. About a minute in, already mining the wrong thing: it even fixed the domain to `@flare-on.com` on the way down and still missed that the banner string is a decoy.

The binary is a [cpuminer-multi](https://github.com/tpruvot/cpuminer-multi) 1.3.7 fork with a lot of real mining code, curl, OpenSSL, and enough algorithms to keep an agent busy for quite a while. Sol needed the bit that printed `Accepted: %s`.

## Find the scanner

`4-ToxicMiner.7z` contains the Windows x64 `ToxicMiner.exe`. Its SHA-256 is:

```text
ee3a410dc86ea45a45c2aaedd071dd39b58035f066f8c9a134c93d4537a28a93
```

To check the hash:

```powershell
Get-FileHash -Algorithm SHA256 ToxicMiner.exe
```

`re-analysis/working/ToxicMiner-static.exe` is a byte-identical analysis copy. All the native addresses here use the preferred image base `0x140000000`. Subtract that to get an RVA. For these code windows, the corresponding file offset is `RVA - 0xC00`; don't apply that rule blindly to other PE sections.

I was glad this didn't need a mining pool. Sol found that after parsing the command line, the program forces benchmark mode and selects algorithm index `39`:

- At `0x140100330`, it sets `dword_140491AA8` to `1`.
- At `0x14010033A`, it sets the selected algorithm to `0x27`.
- Index `39` in the algorithm-name table resolves to `sha256d`.
- The worker's case `39` calls `sub_140134F70`.

Sol bounded the baseline to one thread and one second:

```powershell
.\ToxicMiner.exe --threads=1 --time-limit=1 --quiet
```

It printed `using 'sha256d' algorithm` and `Benchmark: 4025.46 kH/s`, then exited. No URL or Stratum server needed. Keep those bounds for native runs in a disposable Windows lab.

In IDA, open the analysis copy and let analysis finish. `Shift+F12`, search for `Accepted: %s`, then follow its cross-reference. The relevant reference is at `0x140135209`, inside the scanner at `0x140134F70`. You can also press `G` and jump directly to either address.

That gets you past the linked libraries without having to reverse a cryptocurrency miner from scratch.

For the same bounded windows through IDASQL, start one session on the private copy (use the full path to `idasql.exe` if it isn't on PATH):

```powershell collapsed
idasql -s re-analysis/working/ToxicMiner-static.exe --http 0 --bind 127.0.0.1
```

In another terminal, use the endpoint printed by the server. Replace `<port>` with that port:

```powershell collapsed
$endpoint = 'http://127.0.0.1:<port>'

curl.exe --silent --show-error --fail-with-body --max-time 60 --data-binary "SELECT * FROM binary; SELECT disasm_range(0x140134FCE,0x140135015); SELECT disasm_range(0x140135080,0x14013515F); SELECT disasm_range(0x1401351BE,0x14013521C); SELECT disasm_range(0x1401355AC,0x14013562C); SELECT disasm_range(0x140136230,0x140136268);" "$endpoint/query"
```

Keep the session open for subsequent queries, then close it when you're finished:

```powershell collapsed
curl.exe --silent --show-error --max-time 60 -X POST "$endpoint/shutdown"
```

## The username is a 32-byte digest

The scanner starts by obtaining a volume serial. This window begins at VA `0x140134FCE`, RVA `0x134FCE`, file offset `0x1343CE`:

```x86asm
140134FCE: lea     r9, VolumeSerialNumber
140134FD5: mov     [rsp+200h+lpFileSystemNameBuffer], rbx
140134FDA: xor     r8d, r8d
140134FDD: mov     [rsp+200h+lpFileSystemFlags], rbx
140134FE2: xor     edx, edx
140134FE4: xor     ecx, ecx
140134FE6: mov     [rsp+200h+lpMaximumComponentLength], rbx
140134FEB: call    cs:GetVolumeInformationA
140134FF1: mov     cs:dword_140492B4C, 1
140134FFB: mov     edi, ebx
140134FFD: mov     rbx, cs:qword_140495CF8
```

Windows x64 passes its first four arguments in `RCX`, `RDX`, `R8`, and `R9`. Here, `RCX=0` means the root-path argument is null, and `R9` points at the serial output. It asks for the volume containing the current directory. Moving the executable somewhere else doesn't necessarily change that input.

The serial lands at `0x140492B48`. The adjacent DWORD at `0x140492B4C` is the cache flag set by the store after the API call.

The username comes from `--user` or `-u`. At `0x140135011`, the scanner compares its length with `0x40`, then parses 32 pairs of characters using `%02x`. It expects 64 hexadecimal characters representing 32 bytes.

Those bytes are compared with a double hash of two DWORDs: the volume serial and an incrementing mining nonce. This is the original scanner window at VA `0x140135080` through `0x14013515D`, starting at file offset `0x134480`:

```x86asm
140135080: movups  xmm0, cs:xmmword_1401BD250
140135087: mov     eax, cs:VolumeSerialNumber
14013508D: inc     r14d
140135090: movups  xmm1, cs:xmmword_1401BD260
140135097: xor     r8d, r8d
14013509A: mov     [rbp+100h+var_174], rbx
14013509E: lea     rdx, [rbp+100h+var_180]
1401350A2: mov     [rbp+100h+var_16C], rbx
1401350A6: lea     rcx, [rsp+200h+Buf1]
1401350AB: mov     [rbp+100h+var_164], rbx
1401350AF: movups  [rsp+200h+Buf1], xmm0
1401350B4: mov     [rbp+100h+var_15C], rbx
1401350B8: movups  [rsp+200h+var_190], xmm1
1401350BD: mov     [rbp+100h+var_154], rbx
1401350C1: mov     [rbp+100h+var_14C], rbx
1401350C5: mov     [rbp+100h+var_180], eax
1401350C8: mov     [rbp+100h+var_17C], r14d
1401350CC: mov     [rbp+100h+var_178], 80000000h
1401350D3: mov     [rbp+100h+var_144], 40h
1401350DA: call    sub_140135240
1401350DF: movups  xmm0, [rsp+200h+Buf1]
1401350E4: xor     r8d, r8d
1401350E7: lea     rdx, [rbp+100h+var_100]
1401350EB: movups  xmm1, [rsp+200h+var_190]
1401350F0: lea     rcx, [rbp+100h+var_140]
1401350F4: mov     [rbp+100h+var_DC], rbx
1401350F8: movaps  [rbp+100h+var_100], xmm0
1401350FC: movups  xmm0, cs:xmmword_1401BD250
140135103: mov     [rbp+100h+var_D4], rbx
140135107: movaps  [rbp+100h+var_F0], xmm1
14013510B: movups  xmm1, cs:xmmword_1401BD260
140135112: mov     [rbp+100h+var_CC], rbx
140135116: movups  [rbp+100h+var_140], xmm0
14013511A: mov     [rbp+100h+var_E0], 80000000h
140135121: movups  [rbp+100h+var_130], xmm1
140135125: mov     [rbp+100h+var_C4], 100h
14013512C: call    sub_140135240
140135131: test    edi, edi
140135133: jz      short loc_14013515F
140135135: movups  xmm0, [rbp+100h+var_140]
140135139: mov     r8d, 20h
14013513F: lea     rdx, [rbp+100h+Buf2]
140135143: movups  xmm1, [rbp+100h+var_130]
140135147: lea     rcx, [rsp+200h+Buf1]
14013514C: movups  [rsp+200h+Buf1], xmm0
140135151: movups  [rsp+200h+var_190], xmm1
140135156: call    memcmp
14013515B: test    eax, eax
14013515D: jz      short loc_1401351BE
```

There are two separately initialized compression jobs in that block. Each pair of `movups` loads supplies the eight SHA-256 IV words, starting with `0x6A09E667`.

For the first job, `EAX` supplies the serial and `R14D` supplies the nonce. The block is 16 native-order DWORDs:

```text
word  0: serial
word  1: nonce
word  2: 80000000
words 3 through 14: 00000000
word 15: 00000040
```

The last word is the input length in bits: two DWORDs are eight bytes, or 64 bits.

The first result becomes the message for a second compression:

```text
words 0 through 7: first result
word  8: 80000000
words 9 through 14: 00000000
word 15: 00000100
```

That message is 32 bytes, or 256 bits. The second compression starts from the IV again.

Both calls clear `R8D`. The compressor has another path that byte-swaps its input, but these calls use its native-word path. The final eight state words remain in little-endian memory order. Formatting the conventional big-endian SHA digest would give you the wrong username even if the arithmetic were right.

Finally, `R8D=0x20` makes `memcmp` compare all 32 bytes. Its zero return takes the branch at `0x14013515D`.

## Passing the comparison still isn't enough

At the success branch, the scanner computes another double hash. This one uses the same serial but a fixed nonce, `0x0B501E7E`, decimal `189800062`.

VA `0x1401351BE` is RVA `0x1351BE`, file offset `0x1345BE`:

```x86asm
1401351BE: mov     ecx, cs:VolumeSerialNumber
1401351C4: lea     r8, [rbp+100h+Buf2]
1401351C8: mov     edx, 0B501E7Eh
1401351CD: call    sub_140134CA0
1401351D2: movups  xmm0, [rbp+100h+Buf2]
1401351D6: lea     rax, [rbp+100h+var_C0]
1401351DA: mov     r9d, 33h
1401351E0: lea     r8, unk_1401BD3B0
1401351E7: mov     [rsp+200h+lpMaximumComponentLength], rax
1401351EC: mov     edx, 10h
1401351F1: lea     rcx, [rsp+200h+var_1B0]
1401351F6: movups  [rsp+200h+var_1B0], xmm0
1401351FB: call    sub_140134D70
140135200: lea     r8, [rbp+100h+var_C0]
140135204: mov     ecx, 2
140135209: lea     rdx, aAcceptedS ; "Accepted: %s"
140135210: call    sub_140117B70
140135215: xor     ecx, ecx
140135217: call    exit
```

`sub_140134CA0` takes the serial in `ECX`, the nonce in `EDX`, and the digest output buffer in `R8`.

After it returns, `movups xmm0,[...Buf2]` copies only the first 16 digest bytes. Those become the RC4 key passed to `sub_140134D70`. The remaining arguments give the lengths directly: `EDX=0x10` for the key and `R9D=0x33` for the 51-byte ciphertext at `0x1401BD3B0`.

The mining nonce only determines whether the username comparison succeeds. It doesn't carry through to the decryption key.

![Reconstruction of ToxicMiner's nonce-dependent username gate, fixed-nonce RC4 key derivation, and two custom compression blocks, including native vectors for serial 0x5CD25509](/img/flare-on-13-writeups/ch4-two-hashes.svg)

<small>Two digest jobs, two different nonces. The bottom hashes use my drive's serial.</small>

Sol initially forced the conditional branch to reach this path. In a private diagnostic copy, the branch at RVA `0x13515D`, file offset `0x13455D`, changed from:

```text
74 5F    jz  short loc_1401351BE
```

to:

```text
EB 5F    jmp short loc_1401351BE
```

With the wrong serial, it printed gibberish after `Accepted:`. I'd have tried the branch patch too, but reaching the print statement wasn't going to fix the key.

Sol later obtained a nonce-zero digest for my drive and passed it to an unchanged comparison. My volume serial was `0x5CD25509`. The native nonce-zero digest was:

```text
5573dbd3c94a16b372f8c26f4388219c4e309b0a5a8728757e9241b4b491b9b0
```

Sol ran the byte-identical protocol-analysis copy:

```powershell
.\re-analysis\working\ToxicMiner_protocol.exe --threads=1 --time-limit=1 --quiet --user=5573dbd3c94a16b372f8c26f4388219c4e309b0a5a8728757e9241b4b491b9b0
```

It exited successfully in about `0.13` seconds, printing `Accepted:` followed by nonprintable bytes. The username passed without a branch patch. My drive's serial still decrypted garbage.

## The almost-SHA-256 problem

Sol's first model used ordinary SHA-256 Boolean operations and 64 rounds. The IV, schedule, and constants were familiar. It was still wrong.

For my serial and the fixed nonce, that early model produced:

```text
16f2b0a787a70bfeb43132be7763bcbe8bf9905cfbe8055b2039c836a33a5e3b
```

The native digest started with `66e9f5d0`, not `16f2b0a7`.

The initial candidate sweep tried `0x00000000`, my serial `0x5CD25509`, the previous challenge's UDF ID `0x6A6D00FF`, the fixed nonce `0x0B501E7E` as a serial, and two ASCII guesses, `0x464C4152` ("FLAR") and `0x45524F4E` ("ERON"). None gave readable plaintext, but the hash model had already failed on a known input. Sol had to fix that before ruling out serials.

Jump to `0x140135240`, the compressor. There are four changes to recover.

First, it only performs 32 rounds. The schedule expands through `W[31]`. The `R12D=2` bound near `0x140135333` is two batches of eight schedule words, not a two-round compression loop. The compression rounds are unrolled, beginning near `0x140135544` and ending with `K[31]=0x14292967` at `0x1401361B0`.

Second, the Choose and Majority functions contain additions where standard SHA-256 uses XOR. This is the original window at VA `0x1401355AC`, RVA `0x1355AC`, file offset `0x1349AC`:

```x86asm
1401355AC: lea     r8d, [rdi+r11]
1401355B0: and     r8d, r13d
1401355B3: movq    r9, xmm0
1401355B8: xor     r8d, r11d
1401355BB: mov     rax, r11
1401355BE: add     r8d, dword ptr [rsp+160h+var_140]
1401355C3: mov     ecx, esi
1401355C5: shr     rax, 20h
1401355C9: add     r8d, edx
1401355CC: add     eax, 71374491h
1401355D1: shr     ecx, 16h
1401355D4: add     r8d, eax
1401355D7: mov     edx, esi
1401355D9: shl     edx, 13h
1401355DC: mov     eax, esi
1401355DE: shr     eax, 0Dh
1401355E1: mov     r14d, ebx
1401355E4: or      edx, eax
1401355E6: and     r14d, r9d
1401355E9: mov     eax, esi
1401355EB: mov     r10d, ebx
1401355EE: shl     eax, 0Ah
1401355F1: and     r10d, esi
1401355F4: or      ecx, eax
1401355F6: mov     r15, r9
1401355F9: xor     edx, ecx
1401355FB: shr     r15, 20h
1401355FF: add     r15d, r8d
140135602: mov     ecx, esi
140135604: shl     ecx, 1Eh
140135607: mov     eax, esi
140135609: shr     eax, 2
14013560C: or      ecx, eax
14013560E: mov     [rsp+160h+var_160], r15d
140135612: xor     edx, ecx
140135614: mov     eax, r9d
140135617: and     eax, esi
140135619: mov     ecx, r15d
14013561C: add     r14d, eax
14013561F: ror     ecx, 19h
140135622: xor     r14d, r10d
140135625: lea     eax, [r8+rdx]
140135629: add     r14d, eax
```

At the first round's entry, `R13D=e`, `EDI=f`, `R11D=g`, `ESI=a`, `EBX=b`, and the low DWORD moved into `R9` is `c`.

That first `lea` does arithmetic. It doesn't read memory. It computes `f+g`, truncated to 32 bits, then the `and` and `xor` produce:

```text
Choose = g ^ (e & ((f + g) mod 2^32))
```

Later, `R14D` holds `b&c`, `EAX` holds `a&c`, and `R10D` holds `a&b`. The `add` at `0x14013561C` introduces carries before the XOR:

```text
Majority = (a & b) ^ (((a & c) + (b & c)) mod 2^32)
```

Third, the first two round constants are swapped. The first is `0x71374491` at `0x1401355CC`; the second is `0x428A2F98` at `0x140135647`.

Sol briefly generalized that into `K[t ^ 1]`, swapping every adjacent pair. That model failed too, on both my serial and serial zero.

The next instruction groups explain why. At `0x140135696`, the immediate is the ordinary third constant, `0xB5C0FBCF`. At `0x1401356EC`, it is the ordinary fourth, `0xE9B5DBA5`. Only the first pair changes.

## The extra operation after feed-forward

The fourth change happens after the working variables have been added back into the state. It changes word zero using a lookup byte and a potentially unaligned DWORD from the state itself.

This window starts at VA `0x140136230`, RVA `0x136230`, file offset `0x135630`:

```x86asm
140136230: lea     rcx, unk_1401BD270
140136237: mov     r10d, [r12]
14013623B: movzx   eax, r10b
14013623F: movzx   ecx, byte ptr [rax+rcx]
140136243: mov     eax, 24924925h
140136248: mul     r9d
14013624B: mov     eax, r9d
14013624E: sub     eax, edx
140136250: shr     eax, 1
140136252: add     eax, edx
140136254: shr     eax, 4
140136257: imul    eax, 1Ch
14013625A: sub     r9d, eax
14013625D: xor     ecx, [r9+r12]
140136261: xor     ecx, r10d
140136264: mov     [r12], ecx
```

`R12` points to the post-feed-forward state. `R10D` is `state[0]`, and `R9D` is `state[1]`.

The byte load selects:

```text
SBOX[state[0] & 255]
```

The multiply and shifts implement unsigned division. Multiplying the quotient by `0x1C` and subtracting it leaves `state[1] % 28`.

Then `[r9+r12]` reads four bytes starting at that byte offset. There's no DWORD-sized index here. If the remainder is five, the read starts at byte five of the serialized state, crossing a word boundary.

The resulting operation is:

```text
state[0] ^= LE32(state_bytes, state[1] % 28) ^ SBOX[state[0] & 255]
```

The state bytes used for that read are the bytes before the final XOR.

The 256-byte S-box lives at RVA `0x1BD270`, file offset `0x1BC070`. The 51-byte ciphertext lives at RVA `0x1BD3B0`, file offset `0x1BC1B0`. To see them in the file:

```powershell
xxd -g 1 -s 0x1BC070 -l 16 ToxicMiner.exe
xxd -g 1 -s 0x1BC1B0 -l 51 ToxicMiner.exe
```

The S-box starts `91 44 37 71 98 2f 8a 42`. It's the full SHA-256 round-constant table: all 64 words stored little-endian, with `K[0]` and `K[1]` swapped. The compressor only runs 32 rounds, but the other 32 constants still get work as lookup bytes.

The ciphertext is:

```text
f4f9659f31f3da5cf137a1b8cf90a1581eebe499a7c11b1502af7463d3b21928
66de3de97163e775dfe4ab616fb90c2789fc87
```

## Get native answers before searching

Sol found those four changes by comparing the model with native results. Its protocol agent captured native values while its crypto agent used [Unicorn](https://www.unicorn-engine.org/) to run the compressor's machine code in a CPU emulator with chosen inputs. They compared both the first compression and the final digest.

For the native key probe, the protocol agent used a separate `ToxicMiner_digest_probe.exe`. It forced the gate branch, replaced the output argument at RVA `0x135200`, and changed the format string at RVA `0x1BD3F0` from `%s` to `%x`.

The original instruction bytes at `0x135200` were:

```text
4c 8d 45 40    lea r8, [rbp+40h]
```

Four probe variants loaded one DWORD each from the digest buffer:

| Replacement bytes | Loaded value | Printed native DWORD | Bytes in memory |
|---|---|---|---|
| `44 8b 45 e0` | `[rbp-20h]` | `d0f5e966` | `66e9f5d0` |
| `44 8b 45 e4` | `[rbp-1Ch]` | `d740687e` | `7e6840d7` |
| `44 8b 45 e8` | `[rbp-18h]` | `9b7b215b` | `5b217b9b` |
| `44 8b 45 ec` | `[rbp-14h]` | `e3aa2ae7` | `e72aaae3` |

Concatenate the memory bytes and the native RC4 key for my drive is:

```text
66e9f5d07e6840d75b217b9be72aaae3
```

Ordinary RC4 with that captured key reproduced the native gibberish byte-for-byte. A separate zero-key probe also agreed with ordinary RC4. The RC4 implementation wasn't the mismatch.

To expose the first compression rather than the second, the first-block diagnostic replaced the instruction at RVA `0x134D43`:

```text
c7 45 e0 00 00 00 80
```

with:

```text
41 b8 20 00 00 00 90
```

That sets `R8D` to the 32-byte copy length. It redirected the call at RVA `0x134D55` from:

```text
e8 e6 04 00 00
```

to:

```text
e8 79 18 08 00
```

The replacement calls the copy routine at RVA `0x1B65D3`, exposing the first state instead of compressing it again.

For fixed nonce `0x0B501E7E`, the comparison vectors were (the UDF serial's pair came from native-image emulation):

| Serial | Boundary | Native-order bytes |
|---|---|---|
| `0x00000000` | First compression | `88b444a047338fa899cd0598588094178f0028896f4a5f076e4260837c8becf8` |
| `0x00000000` | Final digest | `023c142d815e388f57a4753bfe70db2478f146e82bb7899ec7eecf3352363f6f` |
| `0x5CD25509` | First compression | `caa8b29630a59abfd9b505b056743daead91bd0e275757694c826670a3cccee0` |
| `0x5CD25509` | Final digest | `66e9f5d07e6840d75b217b9be72aaae3a3863d43705f8a17b7fb8190dc0fbb6d` |
| `0x6A6D00FF` | First compression | `5fb40c171d4107da509b189a3dab13f595dff74138f6d49c98859ad53f9eb9c6` |
| `0x6A6D00FF` | Final digest | `4d9345752ce8b9134ea11192a1d5d62876c04466e3c221709e34d16c9ea74def` |

The first four are also embedded in the CUDA search as mandatory checks.

A first-compression mismatch sends you back to word order, round count, arithmetic, constants, or that final state operation. A matching first compression followed by a wrong final digest narrows it to the second block's construction. Comparing only the eventual RC4 plaintext throws that information away.

The UDF serial came from challenge 3. The corrected model and native serial-override experiment both decrypted this:

```text
bdc1f40b9c85dc6bc763bfe6eac760a79d944abaf9549bc93f76cbba2e491bc0
e5b9db00cd9862259515cdf37a28274bb8bbd5
```

For comparison, serial zero produced:

```text
f32f0f407ca5d55dffd644cc4d8625d7612a727095668e3bd21bc653e0f42ece
17dfa1427da0763bf3a4a68e29a2c2d7e88596
```

My serial produced:

```text
f0cac14b9eb3a1d7f204e395cde8bf92c9a9284de1f804f9953e698b7e320dd5
366784589c0ae1040c8293961c179069241e09
```

Now the implementation was right and the serial was wrong. Much better problem to have.

## The complete CPU reference

I'd rather read this than another screen of unrolled rounds. Sol's corrected `re-analysis/working/ToxicMiner_crypto_reference.py` contains the entire S-box and ciphertext, performs the DWORD read at the byte offset, and keeps the gate digest separate from the fixed-nonce key digest.

```python collapsed
#!/usr/bin/env python3
"""Reproduce ToxicMiner's custom SHA256d gate and RC4 payload, without running it.

Example: python re-analysis/working/ToxicMiner_crypto_reference.py --serial 0x5CD25509
The original RVA 0x135240 compression mixes in a 256-byte table at RVA
0x1BD270; the ciphertext is 51 bytes at RVA 0x1BD3B0. This does not
modify the executable or the current volume serial.
"""

import argparse
import string
import struct

MASK = 0xFFFFFFFF
IV = (
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
    0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
)
K = (
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5,
    0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3,
    0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC,
    0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7,
    0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
)
SBOX = bytes.fromhex(
    '91443771982F8A42CFFBC0B5A5DBB5E95BC25639F111F159A4823F92D55E1CAB'
    '98AA07D8015B8312BE853124C37D0C55745DBE72FEB1DE80A706DC9B74F19B'
    'C1C1699BE48647BEEFC69DC10FCCA10C246F2CE92DAA84744ADCA9B05CDA88F'
    '97652513E986DC631A8C82703B0C77F59BFF30BE0C64791A7D55163CA06672'
    '92914850AB72738211B2EFC6D2C4D130D385354730A65BB0A6A762EC9C2818'
    '52C7292A1E8BFA24B661AA8708B4BC2A3516CC719E892D1240699D685350EF4'
    '70A06A1016C1A419086C371E4C774827B5BCB034B30C1C394AAAD84E4FCA9C'
    '5BF36F2E68EE828F746F63A5781478C8840802C78CFAFFBE90EB6C50A4F7A3'
    'F9BEF27871C6'
)
CIPHERTEXT = bytes.fromhex(
    'F4F9659F31F3DA5CF137A1B8CF90A1581EEBE499A7C11B1502AF7463D3B21928'
    '66DE3DE97163E775DFE4AB616FB90C2789FC87'
)
assert len(SBOX) == 256 and len(CIPHERTEXT) == 51


def ror(x, n):
    return ((x >> n) | (x << (32 - n))) & MASK


def compress(state, words):
    """One 32-round SHA-like block, then RVA 0x136230's state[0] XOR."""
    w = list(words)
    if len(w) != 16:
        raise ValueError('A SHA256 block requires 16 words')
    for t in range(16, 32):
        x, y = w[t - 15], w[t - 2]
        s0 = ror(x, 7) ^ ror(x, 18) ^ (x >> 3)
        s1 = ror(y, 17) ^ ror(y, 19) ^ (y >> 10)
        w.append((w[t - 16] + s0 + w[t - 7] + s1) & MASK)
    a, b, c, d, e, f, g, h = state
    for t in range(32):
        s1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)
        ch = g ^ (e & ((f + g) & MASK))
        k = K[1] if t == 0 else K[0] if t == 1 else K[t]
        t1 = (h + s1 + ch + k + w[t]) & MASK
        s0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)
        maj = (a & b) ^ (((a & c) + (b & c)) & MASK)
        t2 = (s0 + maj) & MASK
        a, b, c, d, e, f, g, h = (t1 + t2) & MASK, a, b, c, (d + t1) & MASK, e, f, g
    state = [(state[i] + v) & MASK for i, v in enumerate((a, b, c, d, e, f, g, h))]
    raw = struct.pack('<8I', *state)
    offset = state[1] % 28
    state[0] ^= struct.unpack_from('<I', raw, offset)[0] ^ SBOX[state[0] & 0xFF]
    return state


def hash_serial(serial, nonce):
    """RVA 0x134CA0: custom SHA256d on two native-order 32-bit words."""
    if not (0 <= serial <= MASK and 0 <= nonce <= MASK):
        raise ValueError('serial and nonce must be unsigned 32-bit integers')
    first = compress(IV, [serial, nonce, 0x80000000] + [0] * 12 + [64])
    second = compress(IV, first + [0x80000000] + [0] * 6 + [256])
    return struct.pack('<8I', *second)


def rc4(key, data):
    """RVA 0x134D70, key scheduling over all 256 bytes and ordinary PRGA."""
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + key[i % len(key)]) & 0xFF
        state[i], state[j] = state[j], state[i]
    i = j = 0
    out = bytearray()
    for value in data:
        i = (i + 1) & 0xFF
        j = (j + state[i]) & 0xFF
        state[i], state[j] = state[j], state[i]
        out.append(value ^ state[(state[i] + state[j]) & 0xFF])
    return bytes(out)


def uint32(value):
    try:
        number = int(value, 0)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f'invalid integer: {value}') from exc
    if not 0 <= number <= MASK:
        raise argparse.ArgumentTypeError('integer must be between 0 and 0xffffffff')
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True, type=uint32, help='volume serial in hex or decimal')
    parser.add_argument('--nonce', type=uint32, default=0, help='mining nonce used to calculate --user (default: 0)')
    parser.add_argument('--user', help='optional 64-hex username to compare with the gate digest')
    args = parser.parse_args()
    if args.user is not None and (len(args.user) != 64 or any(ch not in string.hexdigits for ch in args.user)):
        parser.error('--user requires exactly 64 hexadecimal characters')
    gate_digest = hash_serial(args.serial, args.nonce)
    key_digest = hash_serial(args.serial, 189800062)
    plaintext = rc4(key_digest[:16], CIPHERTEXT)
    print(f'volume_serial=0x{args.serial:08X} nonce=0x{args.nonce:08X}')
    print(f'gate_digest={gate_digest.hex()}')
    if args.user is not None:
        print(f'username_matches_gate={bytes.fromhex(args.user) == gate_digest}')
    print(f'key_digest={key_digest.hex()}')
    print(f'rc4_key={key_digest[:16].hex()}')
    print(f'payload_hex={plaintext.hex()}')
    print(f'payload={plaintext!r}')


if __name__ == '__main__':
    main()
```

## Brute-force the serial

The decryption nonce is fixed, leaving only a 32-bit serial to search. Sol's GPU agent wrote `re-analysis/gpu/toxicminer_search.cu` to enumerate it.

For each serial, the search:

1. Computes the corrected double hash at nonce `0x0B501E7E`.
2. Uses the first 16 digest bytes, in native little-endian order, as an RC4 key.
3. Decrypts the 51-byte ciphertext.
4. Rejects any byte outside printable ASCII `32..126`.
5. Requires the final 13 bytes to be `@flare-on.com`.

The search reads the S-box and ciphertext from the original PE using its section table, checks their leading bytes, and verifies the four zero/local-serial hash vectors before starting. A mismatch raises `GPU SHA does not match native emulation; refusing search`.

It also checks the entire RC4 and suffix-filter path with a synthetic 51-byte message: 38 `A` characters followed by `@flare-on.com`. It temporarily encrypts that known plaintext with the host RC4 implementation, makes the GPU recover it for the known serial, then restores the real ciphertext.

The search kernel uses `BLOCK_SIZE=128`, `CIPHER_SIZE=51`, and `SUFFIX_OFFSET=38`. `hashSerial` implements the same two custom compression calls as the Python reference. Its device-side hash helpers and the `ciphertext` and `suffix` globals are omitted from this excerpt. Each thread gets its own 256-byte RC4 state in shared memory, interleaved so threads don't collide on memory banks.

```c collapsed
struct Candidate {
    uint32_t found;
    uint32_t serial;
    uint32_t digest[8];
};

// Store each thread's S[x] in its own word lane. With a fixed thread ID the
// word's shared-memory bank does not depend on x, avoiding random RC4 bank conflicts.
__device__ __forceinline__ unsigned rc4Offset(unsigned x, unsigned lane) {
    return ((x >> 2) * BLOCK_SIZE + lane) * 4 + (x & 3);
}

__global__ void searchKernel(uint64_t base, uint32_t count, Candidate* result) {
    const uint32_t index = blockIdx.x * BLOCK_SIZE + threadIdx.x;
    if (index >= count) return;
    const uint32_t serial = static_cast<uint32_t>(base + index);
    uint32_t digest[8];
    hashSerial(serial, digest);

    // 256 private bytes per thread, packed into bank-distinct shared-memory
    // words; no synchronization is needed between threads.
    __shared__ uint8_t permutations[BLOCK_SIZE * 256];
    const unsigned lane = threadIdx.x;
#pragma unroll 1
    for (unsigned k = 0; k < 256; ++k)
        permutations[rc4Offset(k, lane)] = static_cast<uint8_t>(k);
    unsigned j = 0;
#pragma unroll 1
    for (unsigned k = 0; k < 256; ++k) {
        const unsigned keyByte = (digest[(k & 15) >> 2] >> (8 * (k & 3))) & 255;
        const unsigned a = rc4Offset(k, lane);
        const uint8_t value = permutations[a];
        j = (j + value + keyByte) & 255;
        const unsigned b = rc4Offset(j, lane);
        const uint8_t other = permutations[b];
        permutations[a] = other;
        permutations[b] = value;
    }
    unsigned i = 0; j = 0;
#pragma unroll 1
    for (unsigned k = 0; k < CIPHER_SIZE; ++k) {
        i = (i + 1) & 255;
        const unsigned a = rc4Offset(i, lane);
        const uint8_t value = permutations[a];
        j = (j + value) & 255;
        const unsigned b = rc4Offset(j, lane);
        const uint8_t other = permutations[b];
        permutations[a] = other;
        permutations[b] = value;
        const uint8_t plain = ciphertext[k] ^
            permutations[rc4Offset((value + other) & 255, lane)];
        if (plain < 32 || plain > 126) return;
        if (k >= SUFFIX_OFFSET && plain != suffix[k - SUFFIX_OFFSET]) return;
    }
    if (atomicCAS(&result->found, 0u, 1u) == 0) {
        result->serial = serial;
#pragma unroll
        for (int k = 0; k < 8; ++k) result->digest[k] = digest[k];
    }
}
```

The host decrypts each surviving candidate again and repeats the ASCII and suffix checks.

My machine had an RTX 3080 Ti and CUDA 13.1. The build script uses Visual Studio 2022 Community and targets `sm_86`:

```bat
@echo off
rem Build the independent bounded CUDA search using installed VS 2022 and CUDA.
rem Usage: re-analysis\gpu\build.cmd (from workspace root).
call "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b 1
"%CUDA_PATH%\bin\nvcc.exe" -O3 -std=c++17 -arch=sm_86 -Xcompiler="/O2 /EHsc" -o re-analysis\gpu\toxicminer_search.exe re-analysis\gpu\toxicminer_search.cu
exit /b %errorlevel%
```

Sol lost a little time getting the Windows compiler command through the shell. A bare `call` failed with `command not found`, then nested quoting around `vcvars64.bat` failed too. Putting the command in `build.cmd` avoided that mess:

```powershell
cmd.exe /c re-analysis\gpu\build.cmd
```

The search started at zero, with a full 32-bit upper bound and finite launches:

```powershell
.\re-analysis\gpu\toxicminer_search.exe ToxicMiner.exe --start 0 --count 0x100000000 --chunk 0x2000000 --launch 0x20000
```

Its saved output included:

```text
PE RVA 0x1bd270 -> file 0x1bc070; RVA 0x1bd3b0 -> file 0x1bc1b0
GPU vector serial=0x00000000 stage=1 hash=88b444a047338fa899cd0598588094178f0028896f4a5f076e4260837c8becf8
GPU vector serial=0x00000000 stage=2 hash=023c142d815e388f57a4753bfe70db2478f146e82bb7899ec7eecf3352363f6f
GPU vector serial=0x5cd25509 stage=1 hash=caa8b29630a59abfd9b505b056743daead91bd0e275757694c826670a3cccee0
GPU vector serial=0x5cd25509 stage=2 hash=66e9f5d07e6840d75b217b9be72aaae3a3863d43705f8a17b7fb8190dc0fbb6d
GPU 51-byte RC4/suffix known-answer test passed
Scanning [0,4294967296) at nonce 0xb501e7e; chunk=33554432; launch=131072
FOUND serial=0x01cec01d (30326813)
digest=761fcd4a32f712d302644850b953b63d3cbdef20da4cceb3d9d87529163b06ff
flag=cpu_m3lt3d_4nd_all_i_g0t_w4s_th1s_fl4g@flare-on.com
processed=30408704 elapsed_seconds=0.0851915
```

The candidate is decimal `30,326,813`, or `0x01CEC01D`: "1CE C01D", hexspeak for "ICE COLD". A cold serial for `cpu_m3lt3d`. The processed count is `30,408,704` because the host checks after each launch, rather than stopping individual GPU threads at the candidate's numeric position.

That `0.0851915` seconds covers the GPU search, not figuring out the algorithm, fixing the wrong models, compiling, or setting everything up.

With Sol's search tool, the 65,536-serial replay window containing the answer is (chosen after the fact, obviously):

```powershell
.\re-analysis\gpu\toxicminer_search.exe ToxicMiner.exe --start 0x01CE0000 --count 0x10000 --chunk 0x10000 --launch 0x20000
```

[Muse, the model in my other run](/blog/muse-wonder-full-flare-on/), took the simpler route: it loaded the binary and called its own key function from 24 threads, about 25 million times a second, finding the serial in roughly two seconds. The GPU was optional.

## Give the miner its serial

I wanted to see the miner print something readable for once. With `0x01CEC01D` recovered, the CPU reference gives both inputs:

```powershell
python re-analysis/working/ToxicMiner_crypto_reference.py --serial 0x01CEC01D --nonce 0 --user daea2a4dbd92c4e9aaec12dc9d46b55dc254ab49777e0284e5253fd8966db610
```

```text
volume_serial=0x01CEC01D nonce=0x00000000
gate_digest=daea2a4dbd92c4e9aaec12dc9d46b55dc254ab49777e0284e5253fd8966db610
username_matches_gate=True
key_digest=761fcd4a32f712d302644850b953b63d3cbdef20da4cceb3d9d87529163b06ff
rc4_key=761fcd4a32f712d302644850b953b63d
payload_hex=6370755f6d336c7433645f346e645f616c6c5f695f6730745f7734735f746831735f666c346740666c6172652d6f6e2e636f6d
payload=b'cpu_m3lt3d_4nd_all_i_g0t_w4s_th1s_fl4g@flare-on.com'
```

Nonce zero supplies a convenient username for the first mining iteration. The RC4 key still comes from nonce `0x0B501E7E`.

The final native confirmation used `ToxicMiner_serial.exe`, a private copy with SHA-256:

```text
42f4146c721a44e43b4ee996af0e8ed206113275ca499526921afbd96e6cb34f
```

This time Sol left the comparison branch alone. It changed the ten-byte store immediately after `GetVolumeInformationA`, at VA `0x140134FF1`, RVA `0x134FF1`, file offset `0x1343F1`.

| Copy | Instruction bytes | Effect |
|---|---|---|
| Original | `c7 05 51 db 35 00 01 00 00 00` | Store `1` into cache flag `0x140492B4C` |
| Private diagnostic | `c7 05 4d db 35 00 1d c0 ce 01` | Store `0x01CEC01D` into serial `0x140492B48` |

This is one ten-byte instruction with five changed byte positions. At file offset `0x1343F3`, `51` becomes `4d`. At `0x1343F7` through `0x1343FA`, `01 00 00 00` becomes `1d c0 ce 01`.

For a RIP-relative store, add the displacement to the next instruction's address, `0x140134FFB`. Reducing the displacement by four moves the destination from the cache flag to the adjacent serial. The API still obtains the real serial, then this instruction substitutes the recovered value.

To compare the instruction bytes:

```powershell
xxd -g 1 -s 0x1343ED -l 24 ToxicMiner.exe
xxd -g 1 -s 0x1343ED -l 24 ToxicMiner_serial.exe
```

Every instruction outside that store remains byte-identical, including the comparison, both hash paths, RC4, ciphertext, and print path. The redirected store leaves the cache flag unset, but the successful path exits immediately.

Sol ran:

```powershell
.\ToxicMiner_serial.exe --threads=1 --time-limit=1 --quiet --user=daea2a4dbd92c4e9aaec12dc9d46b55dc254ab49777e0284e5253fd8966db610
```

```text
[2026-10-06 23:46:06] 1 miner threads started, using 'sha256d' algorithm.
[2026-10-06 23:46:06] Accepted: cpu_m3lt3d_4nd_all_i_g0t_w4s_th1s_fl4g@flare-on.com
```

The serial-substitution copy printed the flag, and CTFd accepted it.

I still have no idea where you were supposed to get that serial without brute-forcing it. "CPU melted" is a bit much when my GPU did the search in 85 milliseconds.

The flag: >!`cpu_m3lt3d_4nd_all_i_g0t_w4s_th1s_fl4g@flare-on.com`!<
