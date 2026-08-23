# node-8 String Semantics 0

Status: experimental and normative for the node-8 dialect. Implementation is
incomplete, but the semantic decisions in this version are confirmed.

Version identifier: `node-8-string-semantics-0`

This document defines the observable string contract for the node-8 V8
dialect. Performance experiments may change implementation strategies but must
not change this contract without a new semantics version.

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

These requirements define storage and byte identity. Position-producing and
position-consuming APIs must use the same byte coordinate system; retaining
UTF-16 positions in one member of such an API group is incompatible with this
contract.

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
- `test/fixtures/node-8/string-semantics-core.json`
- `tools/node-8/string-semantics.js`
- `tools/node-8/string-semantics-core.js`

The matrix contains a `stock` profile that freezes the baseline and a `node-8`
profile that states the target contract. Until the implementation lands, the
stock binary must pass the first profile and fail the target profile on every
intentional difference.

## 7. Construction and observation

### D09: source text and escapes

D09 is **confirmed**:

- unescaped source text is stored as its UTF-8 bytes after the parser performs
  the decoding required for syntax;
- `\xNN` constructs one raw byte;
- `\uXXXX` and `\u{...}` construct Unicode values encoded as UTF-8;
- a valid surrogate pair in one literal construction is encoded as one
  standard four-byte UTF-8 scalar;
- a lone surrogate is encoded as WTF-8.

Consequently, `"\xE9"` contains `E9`, while `"\u00E9"` contains `C3 A9`.
Concatenation never validates or canonicalizes an operand boundary. Separately
constructed high- and low-surrogate WTF-8 strings therefore remain six bytes
when concatenated.

### D10: paired byte and Unicode APIs

D10 is **confirmed**:

- `charCodeAt(i)` returns the stored byte at byte offset `i`;
- `String.fromCharCode(x)` appends `ToUint16(x) & 0xff` as one stored byte;
- `codePointAt(i)` decodes a Unicode value starting at byte offset `i`;
- `String.fromCodePoint(x)` encodes scalar values as UTF-8 and surrogate values
  as WTF-8.

This creates a byte pair (`charCodeAt`/`fromCharCode`) and a Unicode pair
(`codePointAt`/`fromCodePoint`). Unicode use of `fromCharCode` is intentionally
incompatible with stock JavaScript.

## 8. Unicode decoding

D11 and D12 are **confirmed**. Unicode-aware operations use one streaming
WTF-8 decoder starting at the exact byte offset supplied by the caller. The
decoder does not move backward from a continuation byte to find an earlier
lead byte.

The shared decoder supports three policies:

- **internal WTF-8** accepts surrogate encodings and replaces other malformed
  subsequences according to one maximal-subpart algorithm;
- **Web scalar** also replaces surrogate encodings;
- **strict** reports malformed input when an API explicitly requests failure.

An operation must combine decoding with its work in one pass. It must not
prevalidate the String. Iteration, normalization, case conversion, locale
operations, and `localeCompare` are Unicode-aware. Internal String operations
preserve WTF-8 surrogate values when the corresponding stock operation
preserves lone surrogates.

`isWellFormed()` accepts only scalar-value UTF-8. `toWellFormed()` replaces
malformed subsequences and WTF-8 surrogates and emits canonical UTF-8.

### JSON boundary

JSON syntax remains strict ASCII syntax, but JSON String payloads follow the
byte-preserving contract:

- `JSON.parse` preserves unescaped stored bytes without validation;
- JSON Unicode escapes are encoded directly as UTF-8/WTF-8, and an adjacent
  escaped surrogate pair is combined into one scalar encoding;
- `JSON.stringify` escapes JSON syntax characters and WTF-8 surrogate values,
  while preserving other stored bytes without validation or replacement.

Consequently, stringifying a raw String is not a UTF-8 validator and may emit
non-scalar JSON bytes. Code that requires interoperable scalar-value JSON must
validate or call `toWellFormed()` at that boundary. This rule avoids an
implicit full-string validation pass and preserves `parse`/`stringify` byte
closure for ordinary malformed input.

## 9. Runtime and embedding boundaries

### D14: Node output boundaries

D14 is **confirmed**. The following UTF-8 paths copy stored String bytes
without validation or transcoding:

- `Buffer.from(value, 'utf8')` and `buffer.write(value, 'utf8')`;
- `Buffer.byteLength(value, 'utf8')`, which equals `value.length`;
- filesystem, stream, socket, and HTTP body writes whose encoding is UTF-8.

The round trip

```js
Buffer.from(buffer.toString('utf8'), 'utf8')
```

must reproduce every input byte. Explicit non-UTF-8 encodings such as Latin-1
and UTF-16 retain their named conversion behavior.

### D15: V8, N-API, and Web boundaries

D15 is **confirmed**:

- byte-native V8 and N-API UTF-8 entry points preserve bytes;
- legacy Latin-1 and UTF-16 entry points remain source-compatible adapters
  that convert once to or from byte storage;
- no compatibility adapter may create or cache a UTF-16 V8 String;
- external two-byte resources cannot remain zero-copy and must use a conversion
  adapter;
- `TextEncoder` and `TextDecoder` retain Web scalar replacement and strict
  behavior, using a fused scan rather than a separate validation pass.

## 10. Comparison

D16 is **confirmed**. Equality and hashing use raw byte identity. Default
relational comparison and default String sorting use unsigned-byte
lexicographic order. For canonical valid UTF-8 this is Unicode scalar order.
`localeCompare` remains a Unicode-aware operation.

## 11. RegExp

D19 is **confirmed**. RegExp matching is Unicode code-point-oriented by default,
even without an explicit `u` flag. Explicit `u` and `v` continue to control
strict grammar, Unicode Sets behavior, and observable flags; implicit Unicode
matching must not add `u` to `regexp.flags` or make `regexp.unicode` true.

Pattern literals, classes, ranges, dot, quantifiers, advancement, and case
folding use code-point semantics. Match indexes, `lastIndex`, capture bounds,
indices, and replacement callback offsets use byte offsets. Captures are raw
byte slices.

Implementations may use direct byte matching only when correctness is proven
from the parsed RegExp, expanded ranges, flags, folding closure, and zero-length
behavior. Expected execution modes are ASCII-safe byte matching, UTF-8 byte
automata, and a streaming-decoder fallback. Execution must not decode the
whole subject into an intermediate code-point or UTF-16 array.

## 12. Representation and ASCII metadata

The final V8 implementation has one encoding-neutral byte representation. It
must not retain TwoByte String types, a OneByte/TwoByte encoding tag, UTF-16
String dispatch, or UTF-16-specific String optimizations. Sequential, cons,
sliced, thin, external, and internalized shapes may remain, but all lengths and
offsets are byte-based.

The initial representation has no ASCII/non-ASCII flag. An optional lazy
tri-state cache (unknown, ASCII, non-ASCII) requires controlled evidence of at
least five percent improvement in three Unicode-operation families and two
percent in two end-to-end Node workloads, with no String object-size increase
or regression above one percent. It must be populated during work that already
scans the bytes, never by a separate validation pass.

The current experimental runtime flag is migration scaffolding. The final
node-8 release enables this contract unconditionally and contains no UTF-16
semantic fallback.

## 13. Versioning

Any observable change to a confirmed rule requires a new semantics version and
a migration note. Clarifications that do not change observable behavior may
update this document in place.
