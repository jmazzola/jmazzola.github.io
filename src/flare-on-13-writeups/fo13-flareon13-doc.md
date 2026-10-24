---
title: "flare-on 13: FlareOn13.doc"
description: "One file that is a PDF, a raw CD image, a UDF volume, a ZIP and a fat Mach-O at once, with six clues feeding one key."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/flareon13-doc/
challenge: 3
challengeName: "FlareOn13.doc"
---

<small class="writeup-stat">Me: 10:09, 36.67M tokens, $9.73, didn't step in.<br>Truix: 5:31, 9.61M tokens, $4.13, didn't step in.</small>

I mostly watched this one. A `.doc` that can't settle on a file type is pretty good spectator material. OpenAI's Sol 6 and its RE subagents pulled apart this [FLARE-On](https://flare-on.com/) challenge without any steering from me, although Sol did submit one of the clues as a flag before it found the checker.

## A `.doc` with six different ideas about its file type

`flareon13.doc` is 1,855,887 bytes. The original SHA-256 is:

```text
21632dd113a3b4d4678100fb4c37476a1aa77135b5e129e25fca92fbd6f4521f
```

The Python examples use Python 3.12 and write extracted files under `re-analysis/reader-03/`. Sol recovered everything statically on Windows x64, without running the DOS stub or either ARM64 executable.

The extension is pretty unhelpful. There are six format layers to account for: a DOS COM-style program, PDF, a raw CD-ROM image carrying UDF, a fat Mach-O inside that filesystem, ZIP, and a fixed VHD footer. Some overlap the same bytes; the Mach-O is a file inside the UDF layer.

Start with the boundaries:

```sh
xxd -g1 -l 152 -s 0 flareon13.doc
xxd -g1 -l 64 -s 0x8D flareon13.doc
xxd -g1 -l 24 -s 0x1C4E39 flareon13.doc
xxd -g1 -l 8 -s 0x1C4F8F flareon13.doc
```

The first command shows `68 20 20 58 35` at offset zero, the start of a 16-bit DOS stub. The harmless EICAR antivirus-test text is visible at `0x60`. Across `0x80` through `0x8B`, the bytes are:

```text
4c 45 21 24 25 50 44 46 2d 31 2e 37
 L  E  !  $  %  P  D  F  -  1  .  7
```

That puts `%PDF-1.7` at `0x84`. PDF object 1 begins at `0x8D`, declares `/Length 1839086`, and its stream data starts at `0xB2`.

Near the end, the third command shows:

```text
25 25 45 4f 46 0a 50 4b 03 04
 %  %  E  O  F \n  P  K
```

The PDF's `%%EOF` starts at `0x1C4E39`. Six bytes later, at `0x1C4E3F`, there is a ZIP local-file header, `PK\x03\x04`. The final command finds `conectix` at `0x1C4F8F`, the beginning of the last 512 bytes. That is the fixed-VHD footer, including a matching footer checksum.

A PDF viewer can happily finish at `%%EOF` while an archive tool finds a ZIP member after it.

## Taking the sector headers out

The large PDF stream wraps a raw CD image. Its sectors are 2352 bytes long, with 2048 user-data bytes in each sector. Removing the sector overhead reconstructs a UDF 1.50 volume named `FLAREON`.

I'd be tempted to start counting at the PDF stream. That would be wrong: the raw-sector grid starts at document offset zero, not `0xB2`. The PDF header and stream declaration already occupy part of sector zero.

For each of the first 781 sectors, take bytes `[16:2064]`. That removes the 16-byte front and the 288 bytes after the user data:

```python
from hashlib import sha256
from pathlib import Path

raw = Path("flareon13.doc").read_bytes()
assert raw[0x84:0x8c] == b"%PDF-1.7"
assert len(raw) >= 781 * 2352
out = Path("re-analysis/reader-03")
out.mkdir(parents=True, exist_ok=True)

volume = b"".join(raw[s * 2352 + 16 : s * 2352 + 2064]
                  for s in range(781))
assert len(volume) == 1_599_488
print("UDF SHA-256:", sha256(volume).hexdigest())
(out / "flareon13.udf").write_bytes(volume)

# UDF sectors 278 onward are the contiguous click_me file's recorded extent.
click = volume[278 * 2048 : 278 * 2048 + 502_816]
print("click_me SHA-256:", sha256(click).hexdigest())
(out / "click_me").write_bytes(click)
```

The reconstructed volume should hash to:

```text
6ff331ecba0148ec7082006cb33770a419f2d320846fb4e181ce617600c5a1d7
```

`click_me` should hash to:

```text
c1df0f6bfdc367097a8fc2f904da0bdc1576fc0744e2fbbad27e205635cc92f9
```

A UDF-capable filesystem viewer can extract the files instead. There is also a `README.TXT`, whose entire useful contribution is `benign corpus payload`.

The recorded extent for `click_me` starts at UDF sector 278. Its first byte is at original document offset `0x9FA30`, but the complete file is only contiguous after stripping the raw-sector overhead. If you anchor the extraction at the PDF stream, the `click_me` hash will disagree before you get anywhere near reversing its code.

The extracted file is a 502,816-byte fat Mach-O with two ARM64 slices:

| Slice | CPU subtype | Offset inside `click_me` | Size | Code-signature identifier |
|---|---:|---:|---:|---|
| 0 | 0 | `0x4000` | `0x10BD0` | `totally_fake_flag` |
| 1 | 3 | `0x18000` | `0x62C20` | `true_honest_flag` |

The small slice produces one clue. The larger slice was compiled with Crystal, with runtime type metadata such as `LibC::Kevent` at slice offset `0x41640`, and checks all six clues before decrypting the answer. Despite the name, `totally_fake_flag` still has work to do.

Six formats does not mean six clues. The PDF gives two, the VHD gives none, and the Mach-O both supplies a clue and checks the whole set:

| Input | What to recover | Where it comes from |
|---:|---|---|
| 1 | The modified antivirus-test string | DOS stub |
| 2 | White text encoded as EBCDIC | PDF object 5 |
| 3 | Text in an off-page JBIG2 image | PDF object 8 |
| 4 | A literal descriptor string | UDF |
| 5 | The contents of `flag.txt` | ZIP |
| 6 | A masked custom-hash result | Small Mach-O slice |

The VHD footer and `README.TXT` are decoys, not extra inputs. I can live with a README that contributes nothing. The file named `totally_fake_flag` being necessary is more annoying.

## Keeping the offsets straight

Sol's agents found six encoded digest records at original document offset `0xF9070`. To inspect their references in the larger Mach-O, that offset has to pass through the sector conversion.

I don't trust mental arithmetic with this many coordinate systems. Just subtracting the document offset of `click_me` and the fat-file offset of slice 1 gives the wrong answer. Every raw sector includes 304 bytes that disappeared during extraction.

The conversion is:

```text
Original document:
    0xF9070 = 433 * 2352 + 0x640

Inside click_me:
    (433 - 278) * 2048 + (0x640 - 16) = 0x4DE30

Inside Mach-O slice 1:
    0x4DE30 - 0x18000 = 0x35E30

At image base 0x100000000:
    0x100000000 + 0x35E30 = 0x100035E30
```

Sector 433 contains the record. Subtracting 278 removes the sectors before the file's extent; multiplying by 2048 uses the reconstructed sector size. Subtracting 16 removes the raw-sector header from the within-sector position.

![Diagram mapping the polyglot document's raw sectors into UDF data and Mach-O slice offsets](/img/flare-on-13-writeups/ch3-polyglot-sector-map.svg)

<small>One file, several coordinate systems. This diagram shows format order, not proportional byte lengths.</small>

In IDA, load the larger slice, go to `0x100035E30`, and follow its cross-reference to `0x1000017CC`. The instructions load the first encoded record in two 16-byte pieces:

```asm
1000017cc: LDR             Q0, xmmword_100035E30
1000017d0: LDR             Q1, xmmword_100035E40
1000017d4: MOV             W1, #0x20
1000017d8: STP             Q0, Q1, [X0]
1000017dc: MOV             W0, #1
1000017e0: BL              _calloc
```

The pattern continues for six records. Later, at `0x1000023D4` through `0x1000023F4`, the code loads MD5's initialization words in reverse order: `0x10325476`, `0x98BADCFE`, `0xEFCDAB89`, and `0x67452301`.

Each stored record occupies 32 bytes, but the decoder only uses the low nibble of each byte. Two encoded bytes produce one decoded byte:

```python
((hi & 15) << 4) | (lo & 15)
```

That turns each 32-byte record into a 16-byte MD5 digest. The table runs from document offset `0xF9070` through `0xF912F`, giving Sol a way to check each clue's exact capitalization and encoding.

## The DOS string changes before it is printed

The visible string at `0x60` begins with `EICAR`. The first `0x60` bytes are all printable ASCII, but disassembling them as 16-bit code at COM origin `0x100` shows a self-modifying DOS stub. It builds `BX = 0x140`, then changes the string one byte at a time:

```asm
0100: push 0x2020
0103: pop ax
0104: xor ax, 0x2160         ; AX = 0x0140
0107: push ax
0108: pop bx
0109: push 0x4020
010c: pop ax
010d: xor ax, 0x6023         ; AL = 0x03
0110: xor byte ptr [bx + 0x20], al
```

Each following group reloads `AX` with `0x4020` before its XOR:

| File offset | In-memory address | XOR byte | Change |
|---|---|---|---|
| `0x60` | `BX + 0x20` | `0x03` | `E` to `F` |
| `0x61` | `BX + 0x21` | `0x05` | `I` to `L` |
| `0x62` | `BX + 0x22` | `0x02` | `C` to `A` |
| `0x63` | `BX + 0x23` | `0x13` | `A` to `R` |
| `0x64` | `BX + 0x24` | `0x17` | `R` to `E` |

At `0x13B`, the same push/pop/XOR pattern builds `DX = 0x160`, pointing to file offset `0x60`. The last part sets `AX = SI = 0x097B` and subtracts `SI` from the words at `0x15C` and `0x15E`. That turns the printable bytes `48 2b 48 2a` into `cd 21 cd 20`: `int 21h`, then `int 20h`. With `AH = 09h`, the first interrupt prints the string at `DS:DX` up to the `$` at file offset `0x83`; the second exits.

I like that even the interrupt instructions have to be assembled out of printable bytes. The first input is the string after those five XORs:

```text
FLARE-STANDARD-ANTIVIRUS-TEST-FILE!
```

I like that the checker lets Sol settle this without running the stub. Compare both versions against the first encoded MD5 record:

```python
from hashlib import md5
from pathlib import Path

d = Path("flareon13.doc").read_bytes()
disk = d[0x60:0x83]
assert disk.startswith(b"EICAR") and disk.endswith(b"FILE!")
in_memory_candidate = b"FLARE" + disk[5:]

encoded = d[0xF9070:0xF9070+32]
stored = bytes(((hi & 15) << 4) | (lo & 15)
               for hi, lo in zip(encoded[::2], encoded[1::2]))

print("literal disk bytes match:", md5(disk).digest() == stored)
print("changed prefix matches:", md5(in_memory_candidate).digest() == stored)
```

The expected results are `False`, then `True`. A strings search gets you the wrong prefix; the checker wants `FLARE`.

## White PDF text, encoded as EBCDIC

The PDF is encrypted, but an empty password decrypts it. With `pypdf` available, read the first page's decrypted content stream:

```python
import re
from pypdf import PdfReader

pdf = PdfReader("flareon13.doc", strict=False)
print("PDF decrypt status:", pdf.decrypt(""))
content = pdf.pages[0].get_contents().get_data()

for encoded in re.findall(rb"<([0-9a-fA-F]{16,})>", content):
    try:
        text = bytes.fromhex(encoded.decode("ascii")).decode("cp037")
    except (UnicodeError, ValueError):
        continue
    if "ghost" in text:
        print("hidden cp037 text:", text)
```

Sol got decrypt status `2`, the owner-password path. The parser can also warn:

```text
invalid pdf header: b'h  X5'
```

Those are the DOS bytes at the beginning of the polyglot. The PDF header is at `0x84`, and the successful decryption still yields the page content.

Object 5 contains this hex text:

```text
<9481899586998194856d8582838489836d878896a2a3>
```

Decode those bytes as EBCDIC code page 037 and you get `mainframe_ebcdic_ghost`. The page paints it white, which makes looking at the rendered page a poor way to find it.

Sol appended `@flare-on.com` and submitted `mainframe_ebcdic_ghost@flare-on.com`. CTFd rejected it.

I didn't step in there. The rejected submission sent Sol and the agents back to the program checking the clues, rather than appending the domain to another string. This one passed the second MD5 check.

## Moving the JBIG2 image onto a page

The PDF also contains an 808-by-48 JBIG2 image. The original page draws it with:

```text
q 12 0 0 1 -80 -80 cm /Im Do Q
```

That scales the image to 12 by 1 points and translates it to `(-80, -80)`, off the page. I'm not going to find that by zooming.

Object 8's 381 encrypted bytes start at document offset `0x1C4A84`. The empty-password PDF decryption yielded the revision-2, 40-bit RC4 file key `7f8fc27d1e`. PDF encryption derives a separate key for each object. For object 8, generation 0, the derivation used here is:

```python
md5(file_key + b"\x08\x00\x00\x00\x00").digest()[:10]
```

The five appended bytes encode the object and generation numbers. Decrypt the image stream with that key, then wrap the JBIG2 data in a new, unencrypted PDF whose page fits the image.

Rebuilding the page lets the image fill an 808-by-48 canvas instead. The complete wrapper includes RC4:

```python collapsed
from hashlib import md5
from pathlib import Path

doc = Path("flareon13.doc").read_bytes()
file_key = bytes.fromhex("7f8fc27d1e")
image_key = md5(file_key + b"\x08\x00\x00\x00\x00").digest()[:10]
encrypted = doc[0x1C4A84:0x1C4A84 + 381]
assert len(encrypted) == 381

def rc4(key, data):
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + key[i % len(key)]) & 255
        state[i], state[j] = state[j], state[i]
    i = j = 0
    out = bytearray()
    for byte in data:
        i = (i + 1) & 255
        j = (j + state[i]) & 255
        state[i], state[j] = state[j], state[i]
        out.append(byte ^ state[(state[i] + state[j]) & 255])
    return bytes(out)

image = rc4(image_key, encrypted)
draw = b"q 808 0 0 48 0 0 cm /Im Do Q"
objects = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 808 48] "
    b"/Resources << /XObject << /Im 4 0 R >> >> /Contents 5 0 R >>",
    b"<< /Type /XObject /Subtype /Image /Width 808 /Height 48 "
    b"/BitsPerComponent 1 /ColorSpace /DeviceGray /Filter /JBIG2Decode "
    b"/Length 381 >>\nstream\n" + image + b"\nendstream",
    f"<< /Length {len(draw)} >>\nstream\n".encode() + draw + b"\nendstream",
]

parts, offsets = [b"%PDF-1.7\n"], []
for number, body in enumerate(objects, 1):
    offsets.append(sum(map(len, parts)))
    parts.append(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")

xref = sum(map(len, parts))
parts.append(b"xref\n0 6\n0000000000 65535 f \n")
parts.extend(f"{offset:010} 00000 n \n".encode() for offset in offsets)
parts.append(
    f"trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n{xref}\n%%EOF\n".encode()
)

out = Path("re-analysis/reader-03/jbig2-preview.pdf")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(b"".join(parts))
print(out)
```

The image dictionary keeps `/Filter /JBIG2Decode`, so a JBIG2-capable viewer does the image decoding. The new page has a `[0 0 808 48]` MediaBox and draws `/Im` across that page.

Sol used Edge's PDFium viewer. Open `re-analysis/reader-03/jbig2-preview.pdf` there, or in another viewer that supports JBIG2. If PyMuPDF is already available, this command produces a PNG at twice the image dimensions:

```powershell
py -3.12 -c "import pymupdf; d=pymupdf.open('re-analysis/reader-03/jbig2-preview.pdf'); p=d[0].get_pixmap(matrix=pymupdf.Matrix(2,2)); p.save('re-analysis/reader-03/jbig2-preview.png'); print('image',p.width,p.height)"
```

That printed `image 1616 96`. The pixels spell `jbig2_fax_geometry`.

![Decoded JBIG2 pixels spelling jbig2_fax_geometry](/img/flare-on-13-writeups/flareon13doc-jbig2.png)

<small>Much easier to read when it's on the page. Enlarged 2x.</small>

## The UDF clue and the ZIP called `flag.txt`

I appreciate that one of these clues is just sitting there. The UDF descriptor clue `udf_tagged_descriptor` appears literally in the original raw-sector bytes at `0xC1F5` and `0x154F5`. The first occurrence can be checked without mounting or decoding anything:

```powershell
py -3.12 -c "from pathlib import Path; raw=Path('flareon13.doc').read_bytes(); print(hex(raw.find(b'udf_tagged_descriptor')))"
```

The ZIP takes more work, despite containing a file helpfully named `flag.txt`.

```sh
unzip -Z -v flareon13.doc
```

Its local header is at `0x1C4E3F`. The member uses ZipCrypto encryption and compression method 2, the old Reduce-1 method.

The encrypted packed length is 222 bytes. Twelve of those belong to the ZipCrypto header, leaving a 210-byte compressed body. The uncompressed length is 18 bytes.

The compressed body starts with 192 zero bytes encoding an all-zero follower table: 256 follower sets, each with a six-bit count, take `256 * 6 / 8 = 192` bytes. That provides known plaintext for recovering ZipCrypto's internal state with [bkcrack](https://github.com/kimci86/bkcrack). The command used 32 known zero bytes at compressed-stream offset zero:

```sh
./bkcrack-1.8.1-win64/bkcrack.exe -C flareon13.doc -c flag.txt -x 0 0000000000000000000000000000000000000000000000000000000000000000
```

The recovered internal keys were:

```text
0917ed61 cfc8f696 5d3e9072
```

Those keys are enough to make a decrypted copy of the archive:

```sh
./bkcrack-1.8.1-win64/bkcrack.exe -C flareon13.doc -k 0917ed61 cfc8f696 5d3e9072 -D re-analysis/reader-03/docpoly-decrypted.zip
```

The compressed bytes remain Reduce-1 data. For this member, the zero follower table is followed by the literal text, so the extraction doesn't need a general-purpose Reduce-1 implementation:

```python
from pathlib import Path
from struct import unpack_from

p = Path("re-analysis/reader-03/docpoly-decrypted.zip").read_bytes()
off = p.index(b"PK\x03\x04")
method = unpack_from("<H", p, off + 8)[0]
packed = unpack_from("<I", p, off + 18)[0]
name_len, extra_len = unpack_from("<HH", p, off + 26)

body = p[
    off + 30 + name_len + extra_len :
    off + 30 + name_len + extra_len + packed
]
assert method == 2 and packed == 210 and body[:192] == bytes(192)
print(body[192:].decode("ascii"))
```

The remaining 18 bytes are `reduce_not_deflate`, the phrase supplied to the checker.

So `flag.txt` was another decoy. Its contents provide the fifth input.

## The small Mach-O almost does SHA-1

The remaining clue comes from the small ARM64 slice at fat-file offset `0x4000`. Its `start` function begins at VA `0x1000006B4`.

The code processes `totally_fake_flag` with an 80-round SHA-1-like routine. Recognizing SHA-1's constants gets you close, but the message schedule differs in one instruction selection.

At `0x10000083C`:

```asm
10000083c: STRB            WZR, [X22]
100000840: LDRB            W8, [X22]
100000844: LDUR            W11, [X9,#-0xC]
100000848: LDUR            W12, [X9,#-0x20]
10000084c: CMP             W8, #0
100000850: LDUR            W13, [X9,#-0x38]
100000854: LDUR            W14, [X9,#-0x40]
100000858: EOR             W11, W12, W11
10000085c: EOR             W12, W13, W14
100000860: EOR             W11, W11, W12
100000864: EXTR            W12, W11, W11, #0x1F
100000868: CSEL            W11, W11, W12, EQ
10000086c: SUBS            X10, X10, #1
100000870: STR             W11, [X9],#4
100000874: B.NE            loc_100000844
```

When `X9` points to schedule word `W[t]`, the four loads retrieve `W[t-3]`, `W[t-8]`, `W[t-14]`, and `W[t-16]`. The displacements are in bytes, so `-0xC` means three 32-bit words back.

The three `EOR` instructions combine those words. `EXTR W12,W11,W11,#0x1F` prepares the usual one-bit left rotation. But the code has just stored zero through `X22`, loaded it into `W8`, and compared it to zero. `CSEL W11,W11,W12,EQ` selects the unrotated value.

The schedule loses the rotation:

```text
SHA-1: W[t] = ROTL1(W[t-3] ^ W[t-8] ^ W[t-14] ^ W[t-16])
Here:  W[t] =       W[t-3] ^ W[t-8] ^ W[t-14] ^ W[t-16]
```

I'd recognize the SHA-1 constants and reach for `hashlib.sha1(b"totally_fake_flag")`. That gives the wrong digest. One missing rotation is enough.

Sol's reconstruction reads the initial message words and mask from the extracted binary, using the `click_me` extracted earlier:

```python collapsed
from hashlib import md5, sha1, sha256
from pathlib import Path
from struct import unpack

EXPECTED_INPUT_SHA256 = (
    "c1df0f6bfdc367097a8fc2f904da0bdc1576fc0744e2fbbad27e205635cc92f9"
)
EXPECTED_CLUE_MD5 = "9fc1de183e2761585dfce907afa249dc"
INITIAL = (0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0)
MASK32 = 0xFFFFFFFF

def derive(click: bytes) -> tuple[str, bytes]:
    base = 0x4000
    block = (
        click[base + 0x1270 : base + 0x1280]
        + click[base + 0x1260 : base + 0x1270]
        + bytes(16)
        + click[base + 0x1250 : base + 0x1260]
    )
    words = list(unpack("<16I", block))
    if (
        b"".join(word.to_bytes(4, "big") for word in words[:4]) + b"g"
        != b"totally_fake_flag"
    ):
        raise ValueError("unexpected slice-zero message layout")

    for turn in range(16, 80):
        words.append(
            words[turn - 16] ^ words[turn - 14]
            ^ words[turn - 8] ^ words[turn - 3]
        )

    a, b, c, d, e = INITIAL
    for turn in range(80):
        if turn < 20:
            f, k = (b & c) | (~b & d), 0x5A827999
        elif turn < 40:
            f, k = b ^ c ^ d, 0x6ED9EBA1
        elif turn < 60:
            f, k = (b & c) | (b & d) | (c & d), 0x8F1BBCDC
        else:
            f, k = b ^ c ^ d, 0xCA62C1D6

        step = (((a << 5) | (a >> 27)) + f + e + k + words[turn]) & MASK32
        a, b, c, d, e = step, a, ((b << 30) | (b >> 2)) & MASK32, c, d

    digest_hex = "".join(
        f"{(value + iv) & MASK32:08x}"
        for value, iv in zip((a, b, c, d, e), INITIAL)
    )
    stored = click[base + 0x1280 : base + 0x1290]
    clue = bytes(
        ord(character) ^ mask
        for character, mask in zip(digest_hex[:16], stored)
    )
    clue += bytes(
        ord(digest_hex[16 + i]) ^ mask
        for i, mask in enumerate((0x50, 0x4A, 0x07))
    )
    if md5(clue).hexdigest() != EXPECTED_CLUE_MD5:
        raise ValueError("small-slice phrase does not pass the sixth MD5 gate")
    return digest_hex, clue

content = Path("re-analysis/reader-03/click_me").read_bytes()
assert sha256(content).hexdigest() == EXPECTED_INPUT_SHA256
digest_hex, clue = derive(content)
print("small_slice_digest=" + digest_hex)
print(
    "standard_sha1_is_different="
    + str(digest_hex != sha1(b"totally_fake_flag").hexdigest())
)
print("clue_utf8_hex=" + clue.hex())
print("clue_md5=" + md5(clue).hexdigest())
print(clue.decode("utf-8"))
```

It produces:

```text
small_slice_digest=3e071c64234f1b9dd840e66a8bdf1608f1cf5be6
standard_sha1_is_different=True
clue_utf8_hex=c39864316e5f333733726e346c5f666c347233
clue_md5=9fc1de183e2761585dfce907afa249dc
Ød1n_373rn4l_fl4r3
```

The mask is XORed with the ASCII bytes of the digest's hexadecimal text, rather than the 20 binary digest bytes. The first 16 mask bytes live at small-slice offset `0x1280`; three immediate values, `0x50`, `0x4A`, and `0x07`, finish the output.

Then decode the result as UTF-8. The initial bytes `c3 98` form `Ø`, giving `Ød1n_373rn4l_fl4r3`. Replacing that character with an ASCII `O` fails the sixth MD5 check.

## Six MD5 checks, one RC4 key

The larger slice supplies the ordering and the final operation. It checks the six phrases against the nibble-encoded MD5 records, hashes each phrase with SHA-256, and XORs the six 32-byte digests together position by position.

After all that file-format archaeology, I'm happy to see a short XOR loop. Hash each phrase separately, though: concatenating them and hashing the result would produce a different key.

The ciphertext follows the digest records at document offsets `0xF9130` through `0xF917F`. It uses the same low-nibble encoding, so 80 stored bytes become 40 ciphertext bytes. The first encoded pair is `86 84`:

```text
((0x86 & 0x0f) << 4) | (0x84 & 0x0f) = 0x64
```

Those bytes map to slice-1 offsets `0x35EF0` through `0x35F3F`. The original code begins loading them at VA `0x10000191C`.

The RC4 key-scheduling loop is at `0x100003530`. It adds a permutation entry and `key[i % key_len]`, wraps the index with `AND #0xFF`, swaps two entries, and repeats until `i` reaches `0x100`. The following loop, at `0x100003598` through `0x1000035F0`, generates the keystream and XORs it with the ciphertext.

The complete decoder can operate directly on the original document. It checks each recovered phrase against its stored MD5 before attempting the final decryption:

```python collapsed
from hashlib import md5, sha256
from pathlib import Path

phrases = [
    "FLARE-STANDARD-ANTIVIRUS-TEST-FILE!",
    "mainframe_ebcdic_ghost",
    "jbig2_fax_geometry",
    "udf_tagged_descriptor",
    "reduce_not_deflate",
    "Ød1n_373rn4l_fl4r3",
]
raw = Path("flareon13.doc").read_bytes()

def low_nibble_pairs(encoded):
    if len(encoded) % 2:
        raise ValueError("odd nibble-encoded length")
    return bytes(
        ((hi & 15) << 4) | (lo & 15)
        for hi, lo in zip(encoded[::2], encoded[1::2])
    )

for n, phrase in enumerate(phrases):
    stored = low_nibble_pairs(
        raw[0xF9070 + 32*n : 0xF9070 + 32*(n+1)]
    )
    actual = md5(phrase.encode("utf-8")).digest()
    print(f"MD5 gate {n+1}:", actual.hex(), "match:", stored == actual)
    assert stored == actual

digests = [sha256(s.encode("utf-8")).digest() for s in phrases]
key = bytes(
    a ^ b ^ c ^ d ^ e ^ f
    for a, b, c, d, e, f in zip(*digests)
)
print("RC4 key:", key.hex())
assert key.hex() == (
    "5517bf5185094a81c64837a1387c8c2d755a2b26cbe342b34752ef62da43f473"
)

cipher = low_nibble_pairs(raw[0xF9130:0xF9180])
print("ciphertext:", cipher.hex())
assert cipher.hex() == (
    "645128013769750e50451f917558f493e3aeed5a51d0cbfae98eed185e1b00b042a8f813a9d5551c"
)

s = list(range(256))
j = 0
for i in range(256):
    j = (j + s[i] + key[i % len(key)]) & 255
    s[i], s[j] = s[j], s[i]

i = j = 0
plain = bytearray()
for c in cipher:
    i = (i + 1) & 255
    j = (j + s[i]) & 255
    s[i], s[j] = s[j], s[i]
    plain.append(c ^ s[(s[i] + s[j]) & 255])

print("decoded:", plain.decode("ascii"))
```

The decoder prints six `match: True` lines and a 40-byte decrypted email. "Just a little treasure hunt." I'd call six overlapping formats a pretty generous definition of little.

CTFd accepted >!`Ju$7_4_l177l3_7r34$ur3_HUN7@flare-on.com`!<
