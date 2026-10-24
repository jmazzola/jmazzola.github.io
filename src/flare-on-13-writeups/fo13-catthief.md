---
title: "flare-on 13: catthief"
description: "RC4 that restarts for every HTTP body, a custom Huffman, and five JPEGs with the flag written on a pirate scroll."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/catthief/
challenge: 5
challengeName: "catthief"
---

<small class="writeup-stat">Me: 7:03, 18.22M tokens, $4.66, didn't step in.<br>Truix: 3:37, 6.15M tokens, $1.63, stepped in once.</small>

Muse, Meta's model in my [separate run a week later](/blog/muse-wonder-full-flare-on/), opened two cat pictures, found no flag, and started theorizing about steganography. The next picture had the flag written on a scroll. It called this an "embarrassing near-miss" in its notes. Fair enough.

In my original [FLARE-On](https://flare-on.com/) run, Sol split a Rust executable and a packet capture between two RE agents: CatBinary worked out what the executable put on the wire, while CatTraffic reconstructed the HTTP bodies and wrote a separate decoder. Both recovered the same five JPEGs, byte for byte. Getting those images back meant restarting RC4 for every body and parsing a Huffman header that doesn't end on a byte boundary.

## Start with the six HTTP exchanges

`5-catthief.7z` contains two inputs:

| File | SHA-256 |
|---|---|
| `catthief/catthief.exe` | `904e67200ac373a8929e04e799a805d57f0032325e6cf0bf808c69721cb94c22` |
| `catthief/capture.pcapng` | `bdc90661caa86c1d9ccff8d04b1cef5ac656237813e17091687ebb0fa34decec` |

The executable is Windows x64. CatBinary used the byte-identical copy at `catthief/re-analysis/working/catthief-CatBinary.exe`. This one needs no live target: the executable and capture contain everything needed to recover the files offline.

```powershell
Get-FileHash -Algorithm SHA256 catthief/catthief.exe
Get-FileHash -Algorithm SHA256 catthief/capture.pcapng
```

Open the capture in [Wireshark](https://www.wireshark.org/) and apply:

```text
http.request || http.response
```

Add `tcp.stream` as a column. There are six conversations from `192.168.56.103` to `192.168.56.102:8080`. Each contains one `POST /exfil` and an HTTP 200 response. Across those six requests, the first body is only 264 bytes. The other five are several megabytes each.

The client starts with `READY`; each nonempty server reply names the file to upload in the next request.

TShark gives the same view without clicking through the packets:

```powershell
& 'C:/Program Files/Wireshark/tshark.exe' -r catthief/capture.pcapng -Y 'http.request || http.response' -T fields -e frame.number -e tcp.stream -e http.request.method -e http.request.uri -e http.response.code -e http.content_length
```

These are reassembled HTTP body sizes. A multi-megabyte request spans many TCP packets, so taking the payload from the packet carrying its HTTP header would give you an incomplete file.

The binary contains `rustls` and `ring` library strings. Those were distracting here. The capture has readable HTTP headers, including the route and body lengths. This connection is plain HTTP with a separate transform applied to the bodies.

The `Accept-Encoding: gzip` request header describes the response encoding the client accepts, not the uploaded bytes. Sol still had to recover the application's own packing.

Wireshark's Follow → HTTP Stream view lets you read headers and check direction. For the decoder, export the reassembled objects into a fresh directory:

```powershell
New-Item -ItemType Directory re-analysis/cattraffic/objects-reader | Out-Null
& 'C:/Program Files/Wireshark/tshark.exe' -r catthief/capture.pcapng -q --export-objects http,re-analysis/cattraffic/objects-reader
```

All the objects use the route basename `exfil`. TShark adds numeric suffixes in capture order:

| Stream | POST frame | Request object | Request bytes | Response frame | Response object | Response bytes |
|---:|---:|---|---:|---:|---|---:|
| 0 | 7 | `exfil` | 264 | 11 | `exfil(1)` | 36 |
| 1 | 616 | `exfil(2)` | 3,121,086 | 623 | `exfil(3)` | 37 |
| 2 | 1027 | `exfil(4)` | 2,736,058 | 1032 | `exfil(5)` | 40 |
| 3 | 1675 | `exfil(6)` | 3,061,432 | 1678 | `exfil(7)` | 36 |
| 4 | 2271 | `exfil(8)` | 3,079,606 | 2287 | `exfil(9)` | 40 |
| 5 | 2800 | `exfil(10)` | 2,842,789 | 2806 | No body | 0 |

The last response contains HTTP headers but no body. There are eleven exported bodies to account for, not twelve, and no missing sixth image.

## Find the code that builds the body

While CatTraffic worked on those boundaries, CatBinary followed the application strings through the Rust binary. I'd take the literal `/exfil` URL over digging through `rustls` any day.

In IDA, Shift+F12 gets you to the strings. Search for the combined literal containing:

```text
READYhttp://192.168.56.102:8080/exfilERROR
```

It's at VA `0x1400C9130`, original file offset `0xC7930`. The nearby `src\compress.rs` string gives another place to look, though the Rust source itself isn't included.

The reference near `0x140002A00` leads into the large challenge routine at `0x1400029AA`. Within it, `0x1400034B3` builds and XOR-decodes the 25-byte key buffer just before the upload path's first RC4 call.

All addresses here use the preferred image base, `0x140000000`:

```text
RVA = VA - 0x140000000
```

For the `.text` windows shown here, the file offset is `RVA - 0xC00`. That relationship doesn't apply to every section.

If you want the same bounded windows through IDASQL, open the private copy once:

```powershell collapsed
& '<IDA 9.3>/idasql.exe' -s catthief/re-analysis/working/catthief-CatBinary.exe --http 0 --bind 127.0.0.1
```

Use the localhost endpoint printed by that process in another terminal. Replace `<port>` with its port:

```powershell collapsed
curl.exe --silent --show-error --fail-with-body --max-time 60 --data-binary "SELECT * FROM binary; SELECT disasm_range(0x1400034B3,0x140003510); SELECT disasm_range(0x1400052F1,0x14000539E); SELECT disasm_range(0x140005284,0x1400052DE); SELECT disasm_range(0x1400041D0,0x1400041F5);" http://127.0.0.1:<port>/query
```

When finished inspecting the database, stop the IDASQL server you started:

```powershell collapsed
curl.exe --silent --show-error --max-time 60 -X POST http://127.0.0.1:<port>/shutdown
```

This first window is VA `0x1400034B3` through `0x14000350B`, RVA `0x34B3` through `0x350B`, starting at file offset `0x28B3`:

```x86asm
1400034b3: movups  [rbp+0C80h+var_289], xmm8
1400034bb: mov     rax, 407576C41004A6Ch
1400034c5: mov     [rbp+0C80h+var_279], rax
1400034cc: mov     [rbp+0C80h+var_271], 7
1400034d3: xor     eax, eax
1400034d5: cmp     rax, 19h
1400034d9: jz      short loc_1400034E8
1400034db: xor     byte ptr [rbp+rax+0C80h+var_289], 33h
1400034e3: inc     rax
1400034e6: jmp     short loc_1400034D5
1400034e8: lea     rsi, [rbp+0C80h+var_BA8]
1400034ef: mov     rcx, rsi
1400034f2: lea     rdx, [rbp+0C80h+var_289]
1400034f9: call    sub_1400052E2
1400034fe: mov     rcx, rsi
140003501: mov     rdx, [rbp+0C80h+var_D8]
140003508: mov     r8, rbx
14000350b: call    sub_140005281
```

That constructs a 25-byte buffer and XORs every byte with `0x33`.

The first 16 bytes come from `xmm8`. Its earlier load, at `0x140002A49`, is:

```x86asm
movaps xmm8, cs:xmmword_1400C9010
```

The constant is at VA `0x1400C9010`, RVA `0xC9010`, file offset `0xC7810`. Read it directly:

```powershell
xxd -g 1 -s 0xC7810 -l 16 catthief/catthief.exe
```

The encoded bytes are:

```text
5a 02 02 6c 51 00 6c 43 02 46 5d 57 00 41 02 5d
```

The next eight bytes come from the immediate `0x0407576C41004A6C`. The store is little-endian, so its bytes in memory are:

```text
6c 4a 00 41 6c 57 07 04
```

The final byte is `07`.

That gives `16 + 8 + 1 = 25` bytes. `19h` in the loop is decimal 25. Notice the encoded zero bytes: this loop uses a fixed length, so it doesn't stop at the first zero.

You can reproduce the key derivation without copying the answer into your decoder:

```powershell
python -c "from pathlib import Path; encoded=Path('catthief/catthief.exe').read_bytes()[0xC7810:0xC7820]+(0x0407576C41004A6C).to_bytes(8,'little')+bytes([7]); print(bytes(b^0x33 for b in encoded))"
```

The result is:

```text
b'i11_b3_p1und3r1n_y3r_d474'
```

Its hex representation is:

```text
69 31 31 5f 62 33 5f 70 31 75 6e 64 33 72 31 6e
5f 79 33 72 5f 64 34 37 34
```

The suffix `_y3r_d474` is a convenient check that you handled the immediate's byte order correctly.

## RC4 starts over for every body

The key is readable now. Before feeding it several megabytes, the remaining question is where the state resets.

The call at `0x1400034F9` goes to `sub_1400052E2`, the RC4 key-scheduling routine. Its destination state pointer has been moved into `R8` just before this window.

This is VA `0x1400052F1` through `0x140005395`, RVA `0x52F1` through `0x5395`, beginning at file offset `0x46F1`:

```x86asm
1400052f1: xor     r9d, r9d
1400052f4: lea     rdi, [rsp+220h+var_120]
1400052fc: mov     ecx, 40h ; '@'
140005301: xor     eax, eax
140005303: rep stosd
140005305: mov     [rsp+r9+220h+var_120], r9b
14000530d: inc     r9
140005310: cmp     r9, 100h
140005317: jnz     short loc_140005305
140005319: xor     r11d, r11d
14000531c: mov     bl, 19h
14000531e: mov     r9, rsp
140005321: lea     r10, [rsp+220h+var_120]
140005329: xor     r14d, r14d
14000532c: movzx   eax, r14b
140005330: div     bl
140005332: cmp     r14, 100h
140005339: jz      short loc_140005383
14000533b: movzx   eax, al
14000533e: imul    eax, -19h
140005341: movzx   eax, al
140005344: mov     ecx, 100h
140005349: mov     rdi, r9
14000534c: mov     rsi, r10
14000534f: rep movsb
140005351: mov     cl, [rsp+r14+220h+var_220]
140005355: add     r11b, cl
140005358: add     eax, r14d
14000535b: movzx   eax, al
14000535e: add     r11b, [rdx+rax]
140005362: movzx   eax, r11b
140005366: mov     sil, [rsp+rax+220h+var_220]
14000536a: mov     [rsp+r14+220h+var_220], sil
14000536e: inc     r14
140005371: mov     [rsp+rax+220h+var_220], cl
140005374: mov     ecx, 100h
140005379: mov     rdi, r10
14000537c: mov     rsi, r9
14000537f: rep movsb
140005381: jmp     short loc_14000532C
140005383: lea     rsi, [rsp+220h+var_120]
14000538b: mov     ecx, 100h
140005390: mov     rdi, r8
140005393: rep movsb
140005395: and     word ptr [r8+100h], 0
```

There is a lot of copying around a small algorithm.

`rep stosd` clears 64 DWORDs, or 256 bytes. The loop at `0x140005305` then initializes the permutation with `S[i] = i`, stopping at `0x100`.

`R14` is the key-scheduling index `i`. `R11B` holds `j`. The divisor in `BL` is `0x19`, the 25-byte key length. The division, multiplication by `-25`, and addition calculate `i % 25`.

The byte additions at `0x140005355` and `0x14000535E` implement:

```text
j = (j + S[i] + key[i % 25]) & 255
```

The stores at `0x14000536A` and `0x140005371` swap `S[i]` and `S[j]`. The repeated `movsb` operations copy temporary permutation buffers; they don't imply extra cipher rounds.

At the end, the word-sized clear at `[r8+0x100]` resets two adjacent bytes. Those are the stream indices `i` and `j`.

The second call in the upload block, `sub_140005281`, is the RC4 byte generator. Here `RCX` points to that state, `RDX` points to the body, and `R8` is the body length.

This window is VA `0x140005284` through `0x1400052DC`, RVA `0x5284` through `0x52DC`, starting at file offset `0x4684`:

```x86asm
140005284: mov     r9b, [rcx+100h]
14000528b: mov     al, [rcx+101h]
140005291: inc     r9b
140005294: movzx   r9d, r9b
140005298: xor     r10d, r10d
14000529b: cmp     r8, r10
14000529e: jz      short loc_1400052DE
1400052a0: lea     r11d, [r9+r10]
1400052a4: mov     [rcx+100h], r11b
1400052ab: movzx   r11d, r11b
1400052af: mov     bl, [rcx+r11]
1400052b3: add     al, bl
1400052b5: mov     [rcx+101h], al
1400052bb: movzx   esi, al
1400052be: mov     dil, [rcx+rsi]
1400052c2: mov     [rcx+r11], dil
1400052c6: mov     [rcx+rsi], bl
1400052c9: add     bl, [rcx+r11]
1400052cd: movzx   r11d, bl
1400052d1: mov     r11b, [rcx+r11]
1400052d5: xor     [rdx+r10], r11b
1400052d9: inc     r10
1400052dc: jmp     short loc_14000529B
```

`R10` counts body bytes. For each byte, the function advances `i`, adds `S[i]` to `j`, swaps the two permutation entries, and selects `S[(S[i] + S[j]) & 255]`. The instruction at `0x1400052D5` XORs that keystream byte into the body in place.

The upload path calls KSA at `0x1400034F9` immediately before PRGA at `0x14000350B`. The response path does the same thing at `0x1400041DA` and `0x1400041F0`.

So every request body starts with a fresh RC4 state. Every response body also starts with a fresh RC4 state. Keeping one continuous stream across the capture is wrong, even if you preserve packet order perfectly: carrying the state from the control request into the first filename response would use the wrong part of the keystream.

The recovery script implements that by making the state local to each `rc4()` call:

```python
KEY = b"i11_b3_p1und3r1n_y3r_d474"

def rc4(data: bytes) -> bytes:
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + KEY[i % len(KEY)]) & 255
        state[i], state[j] = state[j], state[i]
    i = j = 0
    out = bytearray(len(data))
    for pos, byte in enumerate(data):
        i = (i + 1) & 255
        j = (j + state[i]) & 255
        state[i], state[j] = state[j], state[i]
        out[pos] = byte ^ state[(state[i] + state[j]) & 255]
    return bytes(out)
```

The cheapest check is the first response, `exfil(1)`. It is only 36 bytes. With a fresh state, it decrypts to:

```text
C:\Users\flare\Desktop\important.jpg
```

The plaintext bytes are:

```text
43 3a 5c 55 73 65 72 73 5c 66 6c 61 72 65 5c 44
65 73 6b 74 6f 70 5c 69 6d 70 6f 72 74 61 6e 74
2e 6a 70 67
```

The remaining nonempty responses decode to:

```text
C:\Users\flare\Desktop\anothercat.jpg
C:\Users\flare\Desktop\yetanothercat.jpg
C:\Users\flare\Desktop\catcatcat.jpg
C:\Users\flare\Desktop\myfavoritecat.jpg
```

The response names the next file to upload. `exfil(7)` asks for `catcatcat.jpg`; the image itself is in the following request, `exfil(8)`.

## The JPEG starts five bits earlier than you might expect

The server responses are RC4-only. The outgoing bodies have another layer: the client compresses them, then applies RC4.

A correctly decrypted upload still doesn't start with JPEG magic. The first large upload begins:

```text
20 00 05 f3 d7 00 e1 01 01 ...
```

The tiny control request begins:

```text
20 00 00 00 00 40 00 00 ...
```

The `src\compress.rs` string, bit writer, and 256-entry table of small code lengths pointed to Huffman; assigning canonical codes from those lengths recovered `READY` and then all five JPEGs.

In the challenge routine, the calls at `0x1400033B8` and `0x1400033C7` pass widths 11 and 32 to the bit writer, `sub_1400053FE`. The following writes at `0x1400033D9` and `0x1400033EE` serialize the symbol-length table and packed data. The writer processes bits most significant first.

The frame layout is:

| Bit offset | Width | Field |
|---|---:|---|
| `0..10` | 11 bits | Alphabet size, 256 |
| `11..42` | 32 bits | Packed-data byte count |
| `43..2090` | 256 × 8 bits | Huffman code length for each byte value, in symbol order |
| `2091` onward | Packed byte count × 8 bits | Huffman-coded payload, MSB-first |

The 32-bit field is the number of compressed bytes. It is not the decoded image size.

The header is:

```text
11 + 32 + 256*8 = 2091 bits
```

That puts the payload three bits into byte 261. A parser that rounds the header up to 262 bytes and starts decoding there discards the first five payload bits.

The total physical body length still works out to:

```text
ceil((2091 + packed_byte_count*8) / 8)
```

CatBinary initially described the format as a fixed 256-byte table plus an eight-byte length/header area, before resolving the bit writer. Its first `READY` test also decoded to `READYDDDD` because it read through the physical end of the buffer. Restricting the decoder to the declared encoded-bit end changed that to `READYDD`. The last two extra letters belong there.

The declared packed payload can contain padding that decodes as extra symbols, and the last physical byte has alignment bits outside that payload that must not be decoded at all.

The control message makes this easy to see. Its only used symbols produce these [canonical codes](https://www.rfc-editor.org/rfc/rfc1951):

| Symbol | Code |
|---|---|
| `D` | `00` |
| `R` | `01` |
| `Y` | `10` |
| `A` | `110` |
| `E` | `111` |

The bits are `01 111 110 00 10 | 00 00`, or `R E A D Y | D D`: 12 data bits plus four zero padding bits fill the two packed bytes. The correct bounded result is:

```text
b'READYDD'
```

I much prefer debugging this on seven letters rather than waiting for an image viewer to complain.

![Diagram of the six HTTP exchanges, their exported bodies, and the unaligned Huffman header](/img/flare-on-13-writeups/ch5-body-flow.svg)

<small>The exchanges and bit layout in one diagram. The payload starts inside byte 261, because apparently a byte boundary was too much to ask.</small>

## Rebuild the canonical Huffman table

The frame stores code lengths rather than a tree or explicit bit strings. Canonical Huffman codes save the decoder from having to reproduce how the encoder built its tree.

To reconstruct the canonical codes, discard symbols with length zero, then sort the remaining symbols by `(length, symbol)`. Start the code value at zero. Whenever the length increases, left-shift the code by the increase. Assign that code to the current symbol, increment it, and continue.

`re-analysis/cattraffic/recover.py` uses a lookup table rather than walking a tree for every bit. If the longest code is `width` bits, a shorter code occupies every lookup entry sharing its prefix. With width 3, `D=00` fills both `000` and `001`. Each entry stores both the symbol and the number of bits consumed.

The decompressor:

```python
HEADER_BITS = 11 + 32 + 256 * 8
HEADER_BYTES = (HEADER_BITS + 7) // 8

def decompress(data: bytes) -> tuple[bytes, int]:
    """Decode a 256-symbol MSB-first canonical Huffman frame.

    Returns (decoded bytes, packed byte count); decoded trailing bytes may be
    padding symbols because the frame stores encoded length, not decoded length.
    """
    if len(data) < HEADER_BYTES:
        raise ValueError("Truncated Huffman header")
    header = int.from_bytes(data[:HEADER_BYTES], "big") >> (8 * HEADER_BYTES - HEADER_BITS)
    lengths = (header & ((1 << 2048) - 1)).to_bytes(256, "big")
    packed_len = (header >> 2048) & 0xFFFFFFFF
    alphabet = header >> (2048 + 32)
    if alphabet != 256:
        raise ValueError(f"Unsupported Huffman alphabet: {alphabet}")
    if (HEADER_BITS + packed_len * 8 + 7) // 8 != len(data):
        raise ValueError("Encoded byte count does not match frame length")
    symbols = sorted((length, symbol) for symbol, length in enumerate(lengths) if length)
    if not symbols:
        raise ValueError("Empty Huffman alphabet")
    width = max(lengths)
    min_length = symbols[0][0]
    if width > 15:
        raise ValueError(f"Unexpected Huffman code width: {width}")
    if sum(1 << (width - length) for length, _ in symbols) != 1 << width:
        raise ValueError("Invalid Huffman code lengths")
    lookup = [None] * (1 << width)
    code = last_length = 0
    for length, symbol in symbols:
        code <<= length - last_length
        base = code << (width - length)
        repeat = 1 << (width - length)
        lookup[base : base + repeat] = [(symbol, length)] * repeat
        code += 1
        last_length = length
    if any(entry is None for entry in lookup):
        raise ValueError("Incomplete Huffman lookup")

    # Look at up to width bits without reading past the actual encoded bit count.
    # A zero-filled spare byte permits a final lookahead at the file boundary.
    data += b"\0"
    bit_pos = HEADER_BITS
    end_bit = HEADER_BITS + packed_len * 8
    output = bytearray()
    while bit_pos + min_length <= end_bit:
        pos = bit_pos >> 3
        offset = bit_pos & 7
        bits = ((data[pos] << 8) | data[pos + 1]) >> (16 - width - offset)
        symbol, length = lookup[bits & ((1 << width) - 1)]
        if bit_pos + length > end_bit:
            break
        output.append(symbol)
        bit_pos += length
    return bytes(output), packed_len
```

`HEADER_BYTES` is 262 because reading the header requires part of that last byte. The right shift removes the five payload bits from the integer used to parse the header. It doesn't remove them from the original `data` buffer. The decode loop then starts at bit 2091, so those bits are still there when needed.

The code-length check expresses completeness in units of the longest code. A code of length `length` covers `2**(width - length)` entries in the lookup table. The sum must cover exactly `2**width` entries.

The captured frames have these code lengths:

| Body | Packed bytes | Code-length distribution |
|---|---:|---|
| `exfil` | 2 | 251 unused symbols, three 2-bit codes, two 3-bit codes |
| `exfil(2)` | 3,120,824 | Three 7-bit codes, 247 8-bit codes, six 9-bit codes |
| `exfil(4)` | 2,735,796 | One 6-bit code, one 7-bit code, 246 8-bit codes, eight 9-bit codes |
| `exfil(6)` | 3,061,170 | Eight 7-bit codes, 232 8-bit codes, sixteen 9-bit codes |
| `exfil(8)` | 3,079,344 | Eleven 7-bit codes, 223 8-bit codes, twenty-two 9-bit codes |
| `exfil(10)` | 2,842,527 | Two 7-bit codes, 250 8-bit codes, four 9-bit codes |

The two-byte lookahead is enough for the code widths in this capture, which top out at nine bits. It isn't a general 15-bit decoder despite the looser width check: `width + offset` must fit within those 16 lookahead bits.

## Recover all five images

The RC4 and Huffman functions above are the core of `recover.py`. The rest of the script supplies the object mapping, checks the decoded boundaries, and writes the images only after all inputs have decoded successfully. Those two functions and the driver below make up the complete script.

The driver and its imports:

```python collapsed
import argparse
from pathlib import Path
import sys

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--objects", type=Path, required=True, help="tshark --export-objects http directory")
    parser.add_argument("--output", type=Path, required=True, help="new output directory")
    args = parser.parse_args()
    if not args.objects.is_dir():
        parser.error("--objects must be an existing directory")
    if args.output.exists():
        parser.error("--output must not exist (recovery never overwrites files)")
    names = ["exfil", "exfil(2)", "exfil(4)", "exfil(6)", "exfil(8)", "exfil(10)"]
    reply_names = [f"exfil({i})" for i in (1, 3, 5, 7, 9)]
    for name in names + reply_names:
        if not (args.objects / name).is_file():
            parser.error(f"Missing exported HTTP body: {name}")
    replies = [rc4((args.objects / name).read_bytes()).decode("utf-8") for name in reply_names]
    for i, reply in enumerate(replies):
        print(f"server reply {i}: {reply}")
    # Decode first; a malformed sample must not create a partial output directory.
    decoded = []
    for stream, name in enumerate(names):
        body = (args.objects / name).read_bytes()
        plaintext, packed_len = decompress(rc4(body))
        if stream == 0:
            if not plaintext.startswith(b"READY"):
                raise ValueError("The control message does not begin with READY")
            print(f"stream 0: {len(body)} HTTP bytes; {packed_len} packed bytes; {plaintext!r}")
            continue
        if not plaintext.startswith(b"\xff\xd8"):
            raise ValueError(f"Stream {stream} does not begin with JPEG SOI")
        eoi = plaintext.rfind(b"\xff\xd9")
        if eoi < 0 or len(plaintext) - (eoi + 2) > 8:
            raise ValueError(f"Stream {stream} has no terminal JPEG EOI within 8 bytes of its end")
        clean = plaintext[: eoi + 2]
        print(f"stream {stream}: {len(body)} HTTP bytes; {packed_len} packed bytes; "
              f"JPEG {len(clean)} bytes; {len(plaintext) - len(clean)} padding bytes; "
              f"name {Path(replies[stream-1].replace(chr(92), '/')).name}")
        decoded.append((stream, clean))
    args.output.mkdir(parents=True)
    for stream, body in decoded:
        path = args.output / f"stream-{stream}.jpg"
        path.write_bytes(body)
        print(f"wrote {path}")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, UnicodeError, ValueError) as error:
        sys.exit(f"Error: {error}")
```

The transform order is visible in one line:

```python
plaintext, packed_len = decompress(rc4(body))
```

Responses go through `rc4()` alone. Requests go through RC4 and then Huffman decoding.

The frame doesn't contain an exact decoded-byte count, so the driver checks the JPEG's own boundaries. It requires SOI, `ff d8`, at the start, then finds a terminal EOI, `ff d9`, with no more than eight decoded bytes after it. It won't silently discard arbitrary amounts of trailing output.

CatBinary's first fast image decoder reported one extra zero byte after each JPEG. Its loop checked whether a symbol started before `end`, but didn't reject a symbol whose full code crossed that boundary. The Python decoder has the additional `bit_pos + length > end_bit` check and reported zero trailing bytes for all five images. After the EOI boundary was applied, the two implementations produced the same JPEGs.

Run the script against your fresh exports:

```powershell
python re-analysis/cattraffic/recover.py --objects re-analysis/cattraffic/objects-reader --output re-analysis/cattraffic/recovered-reader
```

`recovered-reader` must not already exist. If you're using Sol's existing exports, change the input to `re-analysis/cattraffic/objects` and keep a fresh output directory.

The script printed:

```text
server reply 0: C:\Users\flare\Desktop\important.jpg
server reply 1: C:\Users\flare\Desktop\anothercat.jpg
server reply 2: C:\Users\flare\Desktop\yetanothercat.jpg
server reply 3: C:\Users\flare\Desktop\catcatcat.jpg
server reply 4: C:\Users\flare\Desktop\myfavoritecat.jpg
stream 0: 264 HTTP bytes; 2 packed bytes; b'READYDD'
stream 1: 3121086 HTTP bytes; 3120824 packed bytes; JPEG 3123324 bytes; 0 padding bytes; name important.jpg
stream 2: 2736058 HTTP bytes; 2735796 packed bytes; JPEG 2738892 bytes; 0 padding bytes; name anothercat.jpg
stream 3: 3061432 HTTP bytes; 3061170 packed bytes; JPEG 3065529 bytes; 0 padding bytes; name yetanothercat.jpg
stream 4: 3079606 HTTP bytes; 3079344 packed bytes; JPEG 3084399 bytes; 0 padding bytes; name catcatcat.jpg
stream 5: 2842789 HTTP bytes; 2842527 packed bytes; JPEG 2844616 bytes; 0 padding bytes; name myfavoritecat.jpg
```

The script writes `stream-1.jpg` through `stream-5.jpg`. All five recovered images are 2816×1536 RGB JPEGs. Pillow found no EXIF, ICC profile, or JPEG comment through its metadata fields.

For `catcatcat.jpg`, check the fourth output:

```powershell
Get-FileHash -Algorithm SHA256 re-analysis/cattraffic/recovered-reader/stream-4.jpg
Start-Process re-analysis/cattraffic/recovered-reader/stream-4.jpg
```

It should be 3,084,399 bytes with SHA-256:

```text
fc78f7b3ac326e5925a77f431169d43494af6637b8b136d1a89b38c4287bc635
```

## Read the scroll

`catcatcat.jpg` is the fourth large upload, TCP stream 4, object `exfil(8)`. The initial `READY` exchange is stream 0 and doesn't count as an image.

Open it and look at the parchment beside the cat. The text is in the image pixels, which explains why searching the capture or JPEG metadata for an email address wouldn't find it.

This was the third image Muse checked, not the third upload. There were only five pictures.

Both of Sol's RE agents recovered the image, and there it was.

![The recovered JPEG with the flag inked across a parchment scroll](/img/flare-on-13-writeups/catthief-scroll.webp)

<small>A crop of the scroll. No steganography required.</small>

The two lines read:

```text
th3r3_b3_tr34sure_1n_
th4t_pc4p@flare-on.com
```

Join them without a space or newline. CTFd accepted it. Treasure in the PCAP, written on a pirate scroll beside a cat. I don't think the hint could have been much more literal.

The flag: >!`th3r3_b3_tr34sure_1n_th4t_pc4p@flare-on.com`!<
