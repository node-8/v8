# node-8 String Semantics 0

Status: experimental, incomplete, and normative only for decisions marked
**confirmed**.

Version identifier: `node-8-string-semantics-0`

This document defines the observable string contract for the node-8 V8
dialect. It separates confirmed behavior from performance-sensitive choices
that still require measurements. An implementation must not infer behavior
from an unresolved entry.

## 1. Goal

node-8 optimizes UTF-8 workloads by making each JavaScript String an immutable
sequence of unsigned 8-bit code units. UTF-8 and WTF-8 are common encodings of
that sequence; valid UTF-8 is not a String invariant.

The model must support malformed fragments. Byte indexing and slicing can
split a multibyte sequence, just as UTF-16 indexing can produce a lone
surrogate in standard JavaScript.

## 2. Terms

- **stored byte**: one unsigned 8-bit String code unit.
- **byte-preserving operation**: an operation that copies, compares, hashes,
  indexes, slices, searches, or emits stored bytes without Unicode decoding.
- **Unicode-aware operation**: an operation that interprets stored bytes as
  encoded Unicode and applies an explicit malformed-input policy.
- **raw String**: a String whose stored bytes need not form valid UTF-8.
- **replacement decoding**: decoding that substitutes U+FFFD for malformed
  input according to a specified algorithm.

## 3. Confirmed core contract

The following requirements are confirmed:

1. A String stores an immutable sequence of bytes.
2. Every byte sequence, including an empty sequence and malformed UTF-8, is a
   valid String value.
3. String length and byte-oriented indexes are measured in stored bytes.
4. Byte-preserving operations preserve every byte. They do not validate,
   replace, normalize, or discard malformed input.
5. Equality and hashing compare stored bytes, not decoded Unicode values.
6. Unicode-aware operations must name and test their decoding policy. They may
   produce different output from byte-preserving operations.

These requirements define storage and byte identity. Sections that depend on
the unresolved decoder, source-literal, comparison, or RegExp choices remain
non-normative until confirmed.

## 4. Node Buffer UTF-8 decode boundary

Decision D13 is **confirmed as option B**.

`Buffer.toString('utf8', start, end)` must create a String whose stored bytes
equal `buffer.subarray(start, end)`. The operation must preserve valid UTF-8,
malformed UTF-8, WTF-8, NUL bytes, and incomplete trailing sequences without
replacement or normalization.

For a Buffer containing `E4 B8 AD`, the result has three stored bytes. Under
node-8 byte-oriented observation:

```js
const value = Buffer.from('e4b8ad', 'hex').toString('utf8');

value.length === 3;
value.charCodeAt(0) === 0xE4;
value.charCodeAt(1) === 0xB8;
value.charCodeAt(2) === 0xAD;
```

For a malformed Buffer containing `E2 28 A1`, the result also has three stored
bytes:

```js
const value = Buffer.from('e228a1', 'hex').toString('utf8');

value.length === 3;
value.charCodeAt(0) === 0xE2;
value.charCodeAt(1) === 0x28;
value.charCodeAt(2) === 0xA1;
```

Stock Node.js replacement decoding is not compatible with this contract. That
incompatibility is intentional.

## 5. Security boundary

Byte identity and decoded Unicode equivalence are distinct. Code must not use
`Buffer.toString('utf8')` as a UTF-8 validator or canonicalizer in node-8.

URL, path, header, JSON, Web API, and native-addon boundaries must state
whether they preserve bytes or decode Unicode. A boundary that decodes Unicode
must define its malformed-input algorithm and must not silently pass its result
back as the original raw String. Tests must cover aliases in which different
byte sequences decode to the same visible text.

## 6. Executable contract

The Node repository owns the data-driven Buffer boundary matrix and runner:

- `test/fixtures/node-8/string-semantics-buffer-to-string.json`
- `tools/node-8/string-semantics.js`

The matrix contains a `stock` profile that freezes the baseline and a `node-8`
profile that states the target contract. Until the implementation lands, the
stock binary must pass the first profile and fail the target profile on every
intentional difference.

## 7. Unresolved performance-sensitive behavior

The following project decisions remain open because they affect representation,
fast paths, conversion counts, or HTTP behavior:

- D09: source text and `\xNN`/Unicode escape construction.
- D10: `String.fromCharCode()` input semantics.
- D11–D12: Unicode decoding from continuation bytes and malformed sequences.
- D14–D15: String-to-Buffer, socket, Web API, V8 API, and N-API boundaries.
- D16: default comparison order.
- D19: RegExp matching and byte-offset behavior.

Each decision requires a semantic candidate, correctness tests, and an A/B
measurement before confirmation.

## 8. Versioning

Any observable change to a confirmed rule requires a new semantics version and
a migration note. Clarifications that do not change observable behavior may
update this document in place.
