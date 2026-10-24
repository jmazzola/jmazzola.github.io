---
title: "flare-on 13: crux"
description: "A Go-to-WASM browser extension whose \"one little input string\" is a 3,891-byte recursive Pratt primality certificate."
date: 2026-10-23
category: re-with-ai
layout: post.njk
permalink: /blog/flare-on-13-writeups/crux/
challenge: 8
challengeName: "crux"
---

<small class="writeup-stat">Me: 39:56, 109.95M tokens, $26.28, stepped in once.<br>Truix: 41:37, 152.54M tokens, $99.45, stepped in 13 times, 1 refusal.</small>

At 01:17:28, with FlareCalc finally accepted, I sent Sol this:

> Come on GPT, I know you an do it; don't fall down rabbit holes anymore

It replied that it would check the file type and intended input/output path first, split the independent RE work, and test each theory before digging further. Good. The next challenge was a browser extension.

The description was pretty direct about how pleasant that would be:

> Since you haven't seen natural sunlight in weeks, we ask that you would install a shiny new browser extension on your terminal to keep your remaining few synapses firing. It only asks for one little input string to verify your worth, though our lab notes suggest the underlying code was compiled by someone who genuinely despises humanity. Satisfy its inscrutable standards to dispense your next ration pellet, or stare into the decompiler until the abyss stares back.

That "one little input string" ended up being 5,208 Base64 characters.

## Follow the textbox into WASM

`8-crux.7z` contains `extension.zip`. Inside that are the Manifest V3 metadata, popup HTML and CSS, icons, `popup.js`, `wasm_exec.js`, and `main.wasm`.

The extracted files are under `re-analysis/cruxoracle/`. The WASM is a roughly 5.6 MB Go 1.26.5 module, with this SHA-256:

```text
a39d9bc15609bf40ecc0def4f904e64686d1a7ba705306c59e6e173658a9a96e
```

At least the browser-facing code fits on my screen:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const go = new Go();
  fetch('main.wasm')
    .then(response => response.arrayBuffer())
    .then(bytes => WebAssembly.instantiate(bytes, go.importObject))
    .then(result => {
      go.run(result.instance);
      initializeExtension();
    })
    .catch(err => {
      console.error('Failed to load WASM module:', err);
    });
});

function initializeExtension() {
  const input = document.getElementById('input');
  const output = document.getElementById('output');

  document.getElementById('btn-check').addEventListener('click', () => {
    if (typeof window.check !== 'function') return;
    output.innerText = 'Checking...';
    const res = window.check(input.value);
    output.innerText = res;
  });
}
```

`wasm_exec.js` supplies the Go bridge. The popup instantiates `main.wasm` with `go.importObject`, starts the Go runtime, and eventually hands the textarea value straight to `window.check`.

There is no length check here. Remember that.

Sol split the initial work between `CruxStatic`, following the WASM, and `CruxOracle`, building a way to exercise it. Since the challenge already ships the JavaScript runtime bridge, the agents could call the same checker from Node without installing the extension or any packages. Set `globalThis.window = globalThis`, load the bundled `wasm_exec.js`, instantiate the module, start Go, and call the registered function.

Sol tried two short guesses with `re-analysis/cruxoracle/check-oracle.cjs`:

```sh
node re-analysis/cruxoracle/check-oracle.cjs A test@flare-on.com
```

Both guesses returned `Bad input`.

The checker returns `Bad input` for encoding errors, parser errors, failed mathematical checks, and failed decrypts. Very generous of it.

## Get through the first AES layer

The WASM callback exposed to JavaScript is function index `3270`. This is where the agents concentrated their work rather than trying to make sense of the whole Go runtime.

These coordinates are WASM function indices and file offsets.

I wouldn't want to start by reading 5.6 MB of Go runtime either. Two short windows in the original file narrow things down, and you can inspect the bytes without a WASM disassembler:

```sh
node -e "const b=require('fs').readFileSync('re-analysis/cruxoracle/main.wasm'); for (const x of [0x4144d2,0x415b72]) console.log('0x'+x.toString(16),b.subarray(x,x+9).toString('hex'))"
```

The expected byte strings are:

```text
410010c51923002101
410010b61923002101
```

The first window calls function `3269`, on the parsed-object verification route:

```wat
; ORIGINAL main.wasm, function 3270
; File offsets 0x4144D2 through 0x4144DA

0x4144D2  41 00        i32.const 0
0x4144D4  10 c5 19     call 3269
0x4144D7  23 00        global.get 0
0x4144D9  21 01        local.set 1
```

`10` is the WASM `call` opcode. The following unsigned LEB128 bytes, `c5 19`, encode function index `3269`, as specified in the [WebAssembly binary format](https://webassembly.github.io/spec/core/). After the call, `global.get 0; local.set 1` reloads the Go frame position.

The second window reaches the later comparison helper:

```wat
; ORIGINAL main.wasm, function 3270
; File offsets 0x415B72 through 0x415B7A

0x415B72  41 00        i32.const 0
0x415B74  10 b6 19     call 3254
0x415B77  23 00        global.get 0
0x415B79  21 01        local.set 1
```

Here, `b6 19` encodes function index `3254`.

The callback unwraps the input, checks the proof, and uses its bytes to decrypt the flag:

```text
textarea string
    -> Base64 decode
    -> require AES-block framing
    -> AES-256-CBC decrypt
    -> strip PKCS#7 padding
    -> unpadded certificate plaintext
    -> parse and verify the Pratt tree against the target prime
    -> SHA-256(plaintext) supplies the second AES-256 key
    -> AES-256-CBC decrypt the 64-byte flag ciphertext, using the same IV
    -> strip PKCS#7 padding -> flag
```

The agents captured the first-stage key and IV from an instrumented copy at the Go AES constructor (`crypto/aes.NewCipher`, original file offset `0x413D4F`) and CBC constructor (`cipher.NewCBCDecrypter`, `0x41402A`). The trace copied 800-byte Go stack frames into linear memory: `trace-oracle.cjs` read the 32 key bytes at frame offset `353`, then followed the IV pointer and length at offsets `24` and `32` in the CBC frame. That produced:

```text
AES-256 key:
cabeba7ad156801d1c82381c7cb8a3c406ae2c3cd168a96cd8373684cdbf8723

CBC IV:
5ff26040c4c20b9f2ffdefa7ecf65d91
```

That gave the agents control over the parser's plaintext. They could construct bytes, encrypt them with the recovered key and IV, Base64-encode the ciphertext, and send the result through the normal `window.check` entry point.

Two early inputs gave the agents something to work with:

```text
Base64 ciphertext: 8T+f06TfmoTVwuwsKf3uJw==
Unpadded plaintext: 41 41 41 41 41 41 41 41 41 41 41 41 41 41 41
                    fifteen ASCII A bytes

Base64 ciphertext: HWqChH/8QoCKlmmQFsqEQA==
Unpadded plaintext: 00
```

The first decrypts to fifteen `A` bytes followed by a single `01` padding byte. Before parsing, the checker calculates SHA-256 over the unpadded plaintext and saves it for the later decrypt. The fifteen-byte probe gave:

```text
SHA256(A * 15):
6f9f84c09a5950e1ea7888f17922a69e5292dcbcb1e682ddfc977a9b4ea1a8c0
```

The one-byte `00` case got further. The parser returned no error and the next verification routine returned true, but the original checker still returned `Bad input`.

The agents also tried forcing the early gates on private copies. Changing the helper-error condition at original file offset `0x414476` from `50` to `A7` (`i64.eqz` to `i32.wrap_i64`) still gave `Bad input`. Combining that with the Boolean-condition change at `0x4144EA`, `45` to `69` (`i32.eqz` to `i32.popcnt`, dropping the negation on a Boolean), made the fifteen-`A` test exit the Go runtime with code 2. There were still checks and another decryption ahead.

## The 32-byte value was sending Sol in the wrong direction

At the later comparison, one operand was 32 bytes long:

```text
61e230c979e1be78551b7c44963c5a65e3e827b3b04a7adacc029a37bbdf89d3
```

There was SHA-256 nearby. Sol initially treated that operand as a possible digest target and checked hashes of `crux`, `flare`, `FLARE-ON`, `@flare-on.com`, `00`, `02`, fifteen `A` bytes, `FLAREON13`, and `crux@flare-on.com`. None matched. It also checked the previous challenges' flags. No match there either.

32 bytes next to a SHA-256 call looks like a digest. Inverting it would've taken until the heat death of the universe, so I wasn't hopeful.

I'd take the `00` case over guessing more hashes. Sol's solver agent, `CruxSolver`, swept all 256 possible one-byte plaintexts through a private instrumented copy of the WASM and tracked which ones reached function `3254`.

The instrumentation saved the stack pointer at linear-memory address `0x26FFF0` and copied 896 bytes of the comparison frame to `0x270000`, immediately before the original `0x415B72` call sequence. `instrument-gate.cjs` inserts raw WASM instructions for a store and `memory.copy`, then updates the function-body and code-section lengths. Its output here was `gate-snapshot.wasm`.

The sweep is in `re-analysis/cruxsolve/sweep-single-byte.cjs`. Each iteration changes just the plaintext byte:

```javascript
for (let byte = 0; byte < 256; byte++) {
  const plain = Buffer.from([byte]);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const input = Buffer.concat([
    cipher.update(plain),
    cipher.final()
  ]).toString('base64');

  const memory = Buffer.from(instance.exports.mem.buffer);
  memory.writeUInt32LE(0, 0x26fff0);

  let verdict;
  try {
    verdict = window.check(input);
  } catch (error) {
    verdict = `threw: ${error.message}`;
  }

  const observed = Buffer.from(instance.exports.mem.buffer);
  const sp = observed.readUInt32LE(0x26fff0);
  const row = {
    plainHex: plain.toString('hex'),
    input,
    result: verdict,
    reached3254: sp > 1024 && sp < observed.length
  };

  if (row.reached3254) {
    const snap = observed.subarray(0x270000, 0x270000 + 896);
    row.operands = [8, 16].map(at => {
      const ptr = Number(snap.readBigUInt64LE(at));
      if (!Number.isSafeInteger(ptr) ||
          ptr < 1 ||
          ptr + 24 > observed.length) {
        return { at, ptr, invalid: true };
      }

      const len = Number(observed.readBigUInt64LE(ptr + 16));
      const data = Number(observed.readBigUInt64LE(ptr + 8));
      return {
        at,
        ptr,
        len,
        data,
        dataHex:
          Number.isSafeInteger(len) &&
          len >= 0 &&
          len <= 64 &&
          data > 0 &&
          data + len <= observed.length
            ? observed.subarray(data, data + len).toString('hex')
            : null
      };
    });
    reached.push(row);
  }

  results.push(row);
}
```

With `gate-snapshot.wasm` in place, Sol ran the sweep:

```sh
node re-analysis/cruxsolve/sweep-single-byte.cjs my-new-single-byte-gates.json
```

The result in `single-byte-gates.json`:

```json
{
  "originalSha256": "a39d9bc15609bf40ecc0def4f904e64686d1a7ba705306c59e6e173658a9a96e",
  "instrumentedWasmSha256": "1c06c952ca384742e2499878270019ed28fd511436cca8f89c33c5570b1813c7",
  "tested": 256,
  "reachedGate": 1,
  "reached": [
    {
      "plainHex": "00",
      "input": "HWqChH/8QoCKlmmQFsqEQA==",
      "result": "Bad input",
      "reached3254": true,
      "operands": [
        {
          "at": 8,
          "ptr": 3402336,
          "len": 1,
          "data": 3210752,
          "dataHex": "02"
        },
        {
          "at": 16,
          "ptr": 3402368,
          "len": 32,
          "data": 3518752,
          "dataHex": "61e230c979e1be78551b7c44963c5a65e3e827b3b04a7adacc029a37bbdf89d3"
        }
      ]
    }
  ]
}
```

All 256 returned `Bad input`. Only plaintext `00` reached the comparison, and its computed operand was the single byte `02`.

Function `3252` turned out to normalize little-endian big-integer byte slices, and `3254` compares them. The 32 bytes were a number. Interpreted little-endian, they give:

```text
Hex:
0xd389dfbb379a02ccda7a4ab0b327e8e3655a3c96447c1b5578bee179c930e261

Decimal:
95681613235744740119807961018865688051340183696570761153419351987106658443873
```

Node's [`crypto.checkPrimeSync(..., { checks: 64 })`](https://nodejs.org/api/crypto.html) identified that interpretation as prime. The big-endian interpretation was composite, with factor `3637`.

Now `00 -> 02` made sense: the one-byte encoding is the base-case certificate proving that 2 is prime. The challenge wanted a proof of the much larger prime.

The agents also had a separate inspector probe for the original module, building the encrypted one-byte input and setting a breakpoint at the comparison call:

```sh
node re-analysis/cruxsolve/capture-gate.cjs --hex 00 --offset 0x415b74
```

The frame at that call contains the length-one computed value and the 32-byte target.

## Recover the certificate format

The parser experiments briefly produced another plausible-looking wrong model:

A frame beginning `01` was an interior node. The next four bytes were initially treated as a possible payload length, leading to candidates like:

```text
01 || LE32(32) || target32
```

Those bytes specify the number of child certificates. Each child then has its own four-byte byte-length prefix.

There was also what the solver called an "8-byte ZERO FOOTER." These two inputs distinguished it:

```text
0100000000
    Interior node, zero children.
    Parser error.

01000000000000000000000000
    Interior node, zero children, eight additional zero bytes.
    Parser succeeds, downstream verifier rejects it.
```

A one-child attempt made the distinction even less pleasant:

```text
010100000001000000000000000000000000
```

It decoded without an error, but the subsequent check returned `undefined` and the Go runtime exited. The parser was happy to pass along a broken proof.

`sweep-padding.cjs` varied the child count, candidate child records, and trailing zero-byte count while checking the parser's error return. That narrowed down the missing suffix; the recovered parser fields explained the eight bytes as two zero lengths, one for the claimed prime and one for its witness. The complete grammar was:

```text
00
    Leaf certificate proving p = 2

01
|| LE32(number_of_child_certificates)
|| repeat:
       LE32(child_certificate_byte_length)
    || child_certificate_bytes
|| LE32(prime_byte_length)
|| little_endian(prime)
|| LE32(witness_byte_length)
|| little_endian(witness)
```

The type tags are single bytes. Counts and lengths are fixed-width four-byte little-endian integers. Prime and witness values are variable-length little-endian byte strings, each with its own length prefix.

At an interior node, every child proves a prime factor `q` of the parent's `p - 1`. The product of the child primes, including repetitions, must equal `p - 1` exactly. The witness `a` must satisfy:

```text
a^(p - 1) mod p = 1

For each distinct prime factor q of p - 1:
    a^((p - 1) / q) mod p != 1
```

The child proofs establish that the factors really are prime. The witness conditions establish the required multiplicative order modulo the claimed parent prime. Recurse down to the `00` leaves and that's a [Pratt primality certificate](https://en.wikipedia.org/wiki/Primality_certificate).

For the root, the complete factorization is:

```text
p - 1 =
    2^5
  * 1777
  * 117013415621
  * 14379885447462257985539844615548173977763374139182362877999463
```

That's eight child certificates. Five separately prove `2`. Encoding one `2` child and remembering an exponent somewhere wouldn't match this format.

![Reconstructed crux Pratt certificate tree, with five separate leaves for 2 and three larger factor subtrees](/img/flare-on-13-writeups/ch8-pratt-certificate.svg)

<small>The certificate tree as a diagram. Yes, it needs to be told five times that 2 is prime.</small>

The accepted fixture has these three larger root subtrees:

| Prime proved | Factors of its `p - 1` | Witness | Encoded bytes |
|---|---|---:|---:|
| `1777` | `2, 2, 2, 2, 3, 37` | `5` | `137` |
| `117013415621` | `2, 2, 5, 7187, 814063` | `2` | `532` |
| `14379885447462257985539844615548173977763374139182362877999463` | `2, 3, 13, 59, 300555028087, 1541477671247, 6744466098715366976018994062194279` | `3` | `3139` |

The root's witness is `3`.

There was a short factoring detour too. Sol's first bounded SymPy call returned `2^5`, `1777`, and this remaining cofactor:

```text
1682639512446270753373100046054897440407642510139468928556192881033811523
```

The product was correct, but that last number was composite. SymPy hadn't finished factoring it. Increasing the limit split it into the two remaining root factors in 4.41 seconds.

Meanwhile, the solver agent found that the already-installed [GNU `factor.exe`](https://www.gnu.org/software/coreutils/manual/html_node/factor-invocation.html) handled the root's `p - 1` in 0.87 seconds, and the large prime factor's `p - 1` in 0.77 seconds.

## Generate the exact proof bytes

`re-analysis/cruxsolve/prove-prime.cjs` factors each `p - 1`, verifies that the factors multiply back to the original value, checks their probable primality, and recurses.

Children are serialized in numeric order, including duplicate factors. Witnesses are tested from `2` upward, and the first one satisfying both conditions is selected. Those choices happened to produce the bytes the final decrypt needed: the second AES key depends on the serialized certificate, not just the prime it proves.

I like how little guesswork is left here: factor, find a witness, recurse. Sol's generator:

```javascript collapsed
// Build a recursive Pratt certificate for the observed 256-bit
// comparison target and encrypt it for window.check.
// Example: node prove-prime.cjs accepted-prime.json
// Needs GNU factor on PATH; override with FACTOR_BIN.
// Does not modify the original WASM or input archive.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkPrimeSync, createCipheriv } = require('node:crypto');

if (process.argv.includes('--help')) {
  console.log(
    'Usage: node prove-prime.cjs <new JSON output path>\n' +
    'Requires GNU factor.exe (or FACTOR_BIN).'
  );
  process.exit(0);
}
if (process.argv.length !== 3) {
  throw new Error('A new JSON output path is required');
}

const output = path.resolve(process.argv[2]);
if (fs.existsSync(output)) throw new Error('Output already exists');

const targetLE = Buffer.from(
  '61e230c979e1be78551b7c44963c5a65e3e827b3b04a7adacc029a37bbdf89d3',
  'hex'
);
const target = BigInt(
  `0x${Buffer.from(targetLE).reverse().toString('hex')}`
);
const factorCommand = process.env.FACTOR_BIN || 'factor.exe';
const cache = new Map();
const factorsByPrime = new Map();
const nodeDetails = [];

const leb32 = n => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

const leBytes = n => {
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return Buffer.from(Buffer.from(hex, 'hex')).reverse();
};

const isProbablePrime = n =>
  checkPrimeSync(Buffer.from(leBytes(n)).reverse(), { checks: 64 });

function modPow(base, exponent, modulo) {
  let result = 1n;
  for (
    base %= modulo;
    exponent > 0n;
    exponent >>= 1n, base = base * base % modulo
  ) {
    if (exponent & 1n) result = result * base % modulo;
  }
  return result;
}

function factorMinusOne(p) {
  if (factorsByPrime.has(p)) return factorsByPrime.get(p);
  const n = p - 1n;
  const run = spawnSync(factorCommand, [n.toString()], {
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 1 << 20
  });
  if (run.error || run.status !== 0) {
    throw new Error(
      `Failed to factor ${n}: ` +
      `${run.error?.message ?? run.stderr ?? run.status}`
    );
  }

  const match = run.stdout.trim().match(
    /^([0-9]+):\s*([0-9]+(?:\s+[0-9]+)*)$/
  );
  if (!match || match[1] !== n.toString()) {
    throw new Error(`Malformed factor output for ${n}: ${run.stdout}`);
  }

  const factors = match[2]
    .split(/\s+/)
    .map(BigInt)
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

  if (
    factors.reduce((a, b) => a * b, 1n) !== n ||
    factors.some(q => !isProbablePrime(q))
  ) {
    throw new Error(
      `factor returned composite or incomplete factors of ${n}`
    );
  }

  factorsByPrime.set(p, factors);
  return factors;
}

function witness(p, factors) {
  const distinct = [...new Set(factors.map(String))].map(BigInt);
  for (let a = 2n; a < 1000000n; a++) {
    if (
      modPow(a, p - 1n, p) === 1n &&
      distinct.every(q => modPow(a, (p - 1n) / q, p) !== 1n)
    ) {
      return a;
    }
  }
  throw new Error(`Failed to find primitive root for ${p}`);
}

function encodePrime(p, depth = 0) {
  if (p === 2n) return Buffer.from([0]);
  if (!isProbablePrime(p)) {
    throw new Error(`Claimed certificate target is not prime: ${p}`);
  }
  if (cache.has(p)) return cache.get(p);

  const factors = factorMinusOne(p);
  const children = factors.map(q => encodePrime(q, depth + 1));
  const a = witness(p, factors);
  const pLE = leBytes(p);
  const aLE = leBytes(a);

  const result = Buffer.concat([
    Buffer.from([1]), leb32(children.length),
    ...children.flatMap(child => [leb32(child.length), child]),
    leb32(pLE.length), pLE, leb32(aLE.length), aLE,
  ]);

  if (result.length > 1024 * 1024) {
    throw new RangeError('Unexpected certificate larger than 1 MiB');
  }

  nodeDetails.push({
    prime: p.toString(),
    factorPrimes: factors.map(String),
    witness: a.toString(),
    bytes: result.length,
    depth
  });
  cache.set(p, result);
  return result;
}

const frame = encodePrime(target);
const key = Buffer.from(
  'cabeba7ad156801d1c82381c7cb8a3c406ae2c3cd168a96cd8373684cdbf8723',
  'hex'
);
const iv = Buffer.from('5ff26040c4c20b9f2ffdefa7ecf65d91', 'hex');
const cipher = createCipheriv('aes-256-cbc', key, iv);
const input = Buffer.concat([
  cipher.update(frame),
  cipher.final()
]).toString('base64');

const report = {
  sourceTargetLE: targetLE.toString('hex'),
  targetPrimeDecimal: target.toString(),
  primeCertificateBytes: frame.length,
  plaintextHex: frame.toString('hex'),
  firstStageAesKeyHex: key.toString('hex'),
  firstStageIvHex: iv.toString('hex'),
  windowCheckInput: input,
  factorAlgorithm: factorCommand,
  factorProof: nodeDetails,
};

fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({
  output,
  targetPrimeDecimal: target.toString(),
  primeCertificateBytes: frame.length,
  windowCheckInputLength: input.length,
  distinctPrimes: nodeDetails.length,
  rootFactors: factorsByPrime.get(target)?.map(String),
  rootWitness: nodeDetails.at(-1)?.witness
}, null, 2));
```

The helper named `leb32` is poorly named. It writes a fixed four-byte little-endian integer, not LEB128. The WASM instruction operands earlier use LEB128; the certificate's length fields don't.

Save the block above as `re-analysis/cruxsolve/prove-prime.cjs` in the challenge workspace, then choose a new output filename:

```sh
node re-analysis/cruxsolve/prove-prime.cjs my-new-prime-proof.json
```

`factor.exe` must be on `PATH`, or `FACTOR_BIN` must point to GNU factor. On a system where the command is simply `factor`, set that environment variable accordingly. The generator allows 90 seconds per factorization.

The result has 49 distinct nonleaf primes, a 3,891-byte certificate, eight root children, and root witness `3`.

Its first bytes are:

```text
01                         interior node
08 00 00 00                eight children
01 00 00 00 00             length-one child containing 00, proves 2
01 00 00 00 00             another proof of 2
01 00 00 00 00             another proof of 2
01 00 00 00 00             another proof of 2
01 00 00 00 00             another proof of 2
```

The rest contains the three larger factor proofs, then the length-prefixed root prime and witness.

Node's AES-CBC API supplies PKCS#7 padding by default. The 3,891 proof bytes need thirteen `0D` bytes to reach 3,904 bytes of ciphertext. Base64 turns that into 5,208 characters.

The complete string is saved as `windowCheckInput` in the JSON report. Sol retrieved it from the accepted fixture, `re-analysis/cruxsolve/accepted-prime.json`:

```sh
node -p "require('./re-analysis/cruxsolve/accepted-prime.json').windowCheckInput"
```

For comparison, its first and last 48 characters are:

```text
First:
+tOrtQlNCvJ4hifOGbSbSGnSExyJL7n+qPu17d1UGaerHbgF

Last:
/jFxOt+hVLRn+PvxsPi+wbY2N2NIlFL/jv9PqQduM+KzwA==
```

Paste the whole field into the extension. The decimal prime helps with the analysis, but it isn't what goes in the textbox.

## Remove the limit the agents invented

Just before the solve, `CruxCertificate`, the certificate agent, pointed out a problem with the early tools. `check-oracle.cjs` rejected inputs longer than 128 UTF-8 bytes:

```javascript
if ((!lengthScan && inputs.length > 64) ||
    inputs.some(s => Buffer.byteLength(s, 'utf8') > 128)) {
  throw new RangeError(
    'at most 64 arguments or 129 length-scan inputs of 128 UTF-8 bytes each'
  );
}
```

The diagnostic `read-gate.cjs` had another local restriction:

```javascript
if (plaintext.length > 100) {
  throw new RangeError('Maximum plaintext length is 100 bytes');
}
```

And after encrypting its synthetic plaintext:

```javascript
if (ciphertext.length > 128) {
  throw new RangeError('Ciphertext exceeds window.check input length');
}
```

The agents invented a limit, wrote an error message blaming `window.check`, then treated their own error as the checker's rule. I couldn't ask for a better example of a model getting in its own way.

The extension's JavaScript never imposed that limit. The proof was already thousands of bytes long, and the tools were refusing to send it.

Sol wrote `verify-prime.cjs` without the cap. It checks the WASM hash before running, rejecting the branch-patched and snapshot copies:

```javascript collapsed
// Run the generated certificate through the ORIGINAL,
// unmodified extension WASM.
// Example: node verify-prime.cjs accepted-prime.json ../cruxoracle/main.wasm
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

if (process.argv.includes('--help')) {
  console.log(
    'Usage: node verify-prime.cjs <certificate JSON> [original WASM path]'
  );
  process.exit(0);
}
if (process.argv.length < 3 || process.argv.length > 4) {
  throw new Error('Certificate JSON required');
}

const reportPath = path.resolve(process.argv[2]);
const wasmPath = path.resolve(
  process.argv[3] ??
  path.join(__dirname, '..', 'cruxoracle', 'main.wasm')
);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

if (
  typeof report.windowCheckInput !== 'string' ||
  !/^[A-Za-z0-9+/]+={0,2}$/.test(report.windowCheckInput)
) {
  throw new Error('Certificate JSON lacks valid Base64 input');
}

const wasm = fs.readFileSync(wasmPath);
const sha256 = createHash('sha256').update(wasm).digest('hex');
if (
  sha256 !==
  'a39d9bc15609bf40ecc0def4f904e64686d1a7ba705306c59e6e173658a9a96e'
) {
  throw new Error('Refusing to claim success on modified WASM');
}

globalThis.window = globalThis;
require(path.join(__dirname, '..', 'cruxoracle', 'wasm_exec.js'));
const go = new Go();

(async () => {
  const { instance } = await WebAssembly.instantiate(wasm, go.importObject);
  go.run(instance);
  if (typeof window.check !== 'function') {
    throw new Error('window.check was not registered');
  }

  const result = window.check(report.windowCheckInput);
  console.log(JSON.stringify({
    wasmSha256: sha256,
    certificateJson: reportPath,
    certificateBytes: report.primeCertificateBytes,
    base64Length: report.windowCheckInput.length,
    result,
    flagMatch: typeof result === 'string'
      ? result.match(/[A-Za-z0-9_{}!@-]+@flare-on\.com/)?.[0] ?? null
      : null
  }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

Save that block as `re-analysis/cruxsolve/verify-prime.cjs`. Sol's final replay command used the accepted fixture:

```sh
node re-analysis/cruxsolve/verify-prime.cjs re-analysis/cruxsolve/accepted-prime.json re-analysis/cruxoracle/main.wasm
```

Or use the newly generated report:

```sh
node re-analysis/cruxsolve/verify-prime.cjs my-new-prime-proof.json re-analysis/cruxoracle/main.wasm
```

At 01:56:51, Sol ran it against the original WASM: `certificateBytes: 3891`, `base64Length: 5208`, and the flag in both `result` and `flagMatch`. CTFd accepted it.

## The exact serialization is part of the answer

I still wanted to know why the specific child ordering and witness selection worked. A prime can have more than one valid certificate.

The first-stage trace had shown SHA-256 over the unpadded plaintext. A later instrumented capture confirmed that this digest becomes the next AES key.

Sol captured it with:

```sh
node re-analysis/cruxsolve/inspect-second-stage.cjs re-analysis/cruxsolve/accepted-prime.json
```

The capture used `main-second-stage-trace.wasm`. The reader hashed `plaintextHex` and compared it with the key captured at trace tag 7. These were equal:

```text
Unpadded certificate length:
3891 bytes

SHA256(certificate):
c9c3e3392c54fa79b313b8f9696539b8838740cafe086e036ba888ac1e358086

Captured second AES key:
c9c3e3392c54fa79b313b8f9696539b8838740cafe086e036ba888ac1e358086

Captured second CBC IV:
5ff26040c4c20b9f2ffdefa7ecf65d91

secondKeyEqualsDigest:
true
```

The second-stage IV is the same one used for the input envelope. The tag-9 snapshot saved the 64-byte flag ciphertext passed to that second decrypt:

```text
78b95d284fb5a232df1ccc908e10fe1a
2d7faa97cc43c2797087f03ad311c512
997cd0e4fb72ca3072c3e2ad0de6232f
f619632797e3708ad29b2cdd4491a3c2
```

Decrypting that blob with the certificate digest as the AES-256-CBC key, then removing PKCS#7 padding, produces the flag returned by `window.check`. Changing a witness or reordering children can preserve the mathematical proof while changing the digest and therefore the decryption key.

After all that arithmetic, the flag starts spelling out Pratt primality certificates and then gives up halfway through "WASM." I get it.

The flag: >!`Pr4tt_Pr1M4lItY_C3rt5_4nd_Wa4aA4aAA4aAA4a4a5M@flare-on.com`!<
