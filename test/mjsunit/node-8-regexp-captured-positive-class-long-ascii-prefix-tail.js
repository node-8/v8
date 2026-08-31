// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const grin = String.fromCodePoint(0x1f600);

const tail16 = 'tail-12345678901';
const tail17 = 'tail-123456789012';
const tail24 = 'tail-1234567890123456789';
const tail32 = 'tail-123456789012345678901234567';
const tail33 = 'tail-1234567890123456789012345678';
const prefix17 = 'prefix-1234567890';
const prefix24 = 'prefix-12345678901234567';
const prefix32 = 'prefix-1234567890123456789012345';
const prefix33 = 'prefix-12345678901234567890123456';

assertEquals(
    [16, 17, 24, 32, 33],
    [tail16, tail17, tail24, tail32, tail33].map(v => v.length));
assertEquals(
    [17, 24, 32, 33],
    [prefix17, prefix24, prefix32, prefix33].map(v => v.length));

const classSource = '[A-C\u00e9-\u00eb]';
const mixedSource = '((' + classSource + '){1,20})';
const field = eAcute + eCircumflex;

function regexp(prefix, body, tail, flags = 'du') {
  return new RegExp(prefix + body + tail, flags);
}

function assertMatchIndices(expected, expression, subject) {
  const match = expression.exec(subject);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

// The old boundary and every new boundary use the existing mixed-capture tree.
for (const tail of [tail16, tail17, tail24, tail32]) {
  assertMatchIndices(
      [[0, 4 + tail.length], [0, 4], [2, 4]], regexp('', mixedSource, tail),
      field + tail);
}
for (const prefix of [prefix17, prefix24, prefix32]) {
  const end = prefix.length + 4 + tail24.length;
  assertMatchIndices(
      [
        [0, end], [prefix.length, prefix.length + 4],
        [prefix.length + 2, prefix.length + 4]
      ],
      regexp(prefix, mixedSource, tail24), prefix + field + tail24);
}

// Exact, large finite, unbounded, and lazy body/mixed forms reuse their
// established construction paths.
assertMatchIndices(
    [[0, 4 + tail17.length], [2, 4]],
    regexp('', '(' + classSource + '){2}', tail17), field + tail17);
assertMatchIndices(
    [[0, 4 + tail24.length], [2, 4]],
    regexp('', '(' + classSource + '){1,100}', tail24), field + tail24);
assertMatchIndices(
    [[0, 4 + tail32.length], [2, 4]],
    regexp('', '(' + classSource + ')+', tail32), field + tail32);
assertMatchIndices(
    [
      [0, prefix17.length + 4 + tail32.length],
      [prefix17.length, prefix17.length + 4],
      [prefix17.length + 2, prefix17.length + 4]
    ],
    regexp(prefix17, '((' + classSource + '){1,20}?)', tail32),
    prefix17 + field + tail32);

// Greedy matching must backtrack across an overlapping byte for the long tail.
const overlapTail = 'A' + tail24.slice(1);
assertMatchIndices(
    [[0, 2 + overlapTail.length], [0, 2], [0, 2]],
    regexp('', '(([A-C\u00e9-\u00eb]){1,20})', overlapTail),
    eAcute + overlapTail);

// Search, global, replacement, and malformed-prefix behavior retain byte
// offsets and capture values.
const searched = 'xx' + prefix17 + field + tail17;
assertMatchIndices(
    [
      [2, searched.length], [2 + prefix17.length, 6 + prefix17.length],
      [4 + prefix17.length, 6 + prefix17.length]
    ],
    regexp(prefix17, mixedSource, tail17), searched);

const chunk = prefix17 + field + tail17;
const global = Array.from(
    chunk.repeat(50).matchAll(regexp(prefix17, mixedSource, tail17, 'dgu')));
assertEquals(50, global.length);
for (let i = 0; i < global.length; ++i) {
  const start = i * chunk.length;
  assertEquals(
      [
        [start, start + chunk.length],
        [start + prefix17.length, start + prefix17.length + 4],
        [start + prefix17.length + 2, start + prefix17.length + 4]
      ],
      Array.from(global[i].indices));
}

const calls = [];
assertEquals(
    'Y',
    chunk.replace(
        regexp(prefix17, mixedSource, tail17, 'gu'),
        (match, outer, part, offset) => {
          calls.push([bytes(match), bytes(outer), bytes(part), offset]);
          return 'Y';
        }));
assertEquals([[bytes(chunk), bytes(field), bytes(eCircumflex), 0]], calls);

const malformedSubject =
    raw(0x80, ...bytes(prefix17), 0xc3, 0xa9, ...bytes(tail17));
const malformed = regexp(prefix17, mixedSource, tail17, 'dgu');
malformed.lastIndex = 1;
assertMatchIndices([[1, 37], [18, 20], [18, 20]], malformed, malformedSubject);
assertEquals(37, malformed.lastIndex);

// Small explicit scalar oracle: ASCII, two-byte, four-byte, and mixed fields
// have byte intervals independent of the literal delimiter length.
const scalarSource = '[A-C\u00e9-\u00eb\u{1f600}]';
const oracleCases = [
  {prefix: prefix17, tail: tail17, field: 'A', last: [17, 18]},
  {prefix: prefix24, tail: tail24, field: eAcute, last: [24, 26]},
  {prefix: prefix32, tail: tail32, field: grin, last: [32, 36]},
  {
    prefix: prefix17,
    tail: tail32,
    field: 'A' + eAcute + grin,
    last: [20, 24],
  },
];
for (const sample of oracleCases) {
  const start = sample.prefix.length;
  const end = start + sample.field.length;
  assertMatchIndices(
      [[0, end + sample.tail.length], [start, end], sample.last],
      regexp(sample.prefix, '((' + scalarSource + '){1,8})', sample.tail),
      sample.prefix + sample.field + sample.tail);
}

// Adjacent unsupported selectors stay unchanged.
assertNull(regexp('', mixedSource, tail33).exec(field + tail33));
assertNull(
    regexp(prefix33, mixedSource, tail17).exec(prefix33 + field + tail17));
assertNull(regexp('', '((' + classSource + '+))', tail17).exec(field + tail17));
assertNull(regexp('', mixedSource, String.fromCodePoint(0x4e2d))
               .exec(field + String.fromCodePoint(0x4e2d)));
assertNull(regexp('', mixedSource, tail17, 'duy').exec(field + tail17));
assertNull(regexp('', mixedSource, tail17, 'dui').exec(field + tail17));
