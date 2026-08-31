// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);

function assertMatchIndices(expected, regexp, subject) {
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

const tail9 = '123456789';
const tail16 = '1234567890abcdef';
const tail17 = '1234567890abcdefg';
const prefix9 = 'prefix-09';
const prefix16 = 'prefix-123456789';
const prefix17 = 'prefix-1234567890';

assertEquals(9, tail9.length);
assertEquals(16, tail16.length);
assertEquals(17, tail17.length);
assertEquals(9, prefix9.length);
assertEquals(16, prefix16.length);
assertEquals(17, prefix17.length);

// Pure-outer medium-atom forms retain their preceding behavior because their
// exact and failure-heavy ASCII workloads do not pass the performance gate.
assertNull(
    /(([A-C\u00e9-\u00eb]+))123456789/du.exec(eAcute + eCircumflex + tail9));
assertNull(
    /prefix-123456789(([A-C\u00e9-\u00eb]{1,3}?))1234567890abcdef/du.exec(
        prefix16 + eAcute + eCircumflex + tail16));

// Body-only capture keeps the final scalar; mixed outer/body capture also
// keeps the complete field in its outer capture.
assertMatchIndices(
    [[0, 13], [2, 4]], /([A-C\u00e9-\u00eb])+123456789/du,
    eAcute + eCircumflex + tail9);
assertMatchIndices(
    [[0, 20], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){1,3})1234567890abcdef/du,
    eAcute + eCircumflex + tail16);
assertMatchIndices(
    [[0, 20], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){1,3}?)1234567890abcdef/du,
    eAcute + eCircumflex + tail16);
assertMatchIndices(
    [[0, 13], [2, 4]], /([A-C\u00e9-\u00eb]){2}123456789/du,
    eAcute + eCircumflex + tail9);
assertMatchIndices(
    [[0, 20], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){2})1234567890abcdef/du,
    eAcute + eCircumflex + tail16);
assertMatchIndices(
    [[0, 15], [9, 13], [11, 13]], /prefix-09(([A-C\u00e9-\u00eb])+)xy/du,
    prefix9 + eAcute + eCircumflex + 'xy');
assertMatchIndices(
    [[0, 36], [16, 20], [18, 20]],
    /prefix-123456789(([A-C\u00e9-\u00eb]){1,3}?)1234567890abcdef/du,
    prefix16 + eAcute + eCircumflex + tail16);

const named = assertMatchIndices(
    [[0, 22], [9, 13], [9, 13], [11, 13]],
    /prefix-09(?<field>((?<part>[A-C\u00e9-\u00eb]){1,3}))123456789/du,
    prefix9 + eAcute + eCircumflex + tail9);
assertEquals(bytes(named[1]), bytes(named.groups.field));
assertEquals(bytes(named[3]), bytes(named.groups.part));
assertEquals(named.indices[1], named.indices.groups.field);
assertEquals(named.indices[3], named.indices.groups.part);

// Greedy backtracking must leave the overlapping ASCII bytes for the tail.
assertMatchIndices(
    [[0, 12], [0, 3], [2, 3]], /(([A-C1\u00e9]){1,3})123456789/du,
    eAcute + '1' + tail9);

const malformedSubject =
    raw(0x80, ...bytes(prefix9), 0xc3, 0xa9, ...bytes(tail9));
const malformed = /prefix-09([A-C\u00e9-\u00eb]){1,3}123456789/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assertNotNull(malformedMatch);
assertEquals([[1, 21], [10, 12]], Array.from(malformedMatch.indices));
assertEquals(21, malformed.lastIndex);

const chunk = prefix9 + 'A' + eAcute + 'B' + tail9;
const all = Array.from(chunk.repeat(100).matchAll(
    /prefix-09(([A-C\u00e9-\u00eb]){1,3})123456789/dgu));
assertEquals(100, all.length);
for (let index = 0; index < all.length; ++index) {
  const start = index * chunk.length;
  assertEquals(
      [[start, start + 22], [start + 9, start + 13], [start + 12, start + 13]],
      Array.from(all[index].indices));
}

const replacementCalls = [];
assertEquals(
    'Y',
    (prefix9 + eAcute + eCircumflex + tail9)
        .replace(
            /prefix-09(([A-C\u00e9-\u00eb])+)123456789/gu,
            (match, field, part, offset) => {
              replacementCalls.push(
                  [offset, bytes(match), bytes(field), bytes(part)]);
              return 'Y';
            }));
assertEquals(
    [[
      0, bytes(prefix9 + eAcute + eCircumflex + tail9),
      bytes(eAcute + eCircumflex), bytes(eCircumflex)
    ]],
    replacementCalls);

function decodeScalar(input, position) {
  const first = input[position];
  if (first < 0x80) return {codePoint: first, width: 1};
  if (first < 0xc2 || first > 0xf4) return {codePoint: 0xfffd, width: 1};
  let width = 2;
  let secondFrom = 0x80;
  let secondTo = 0xbf;
  if (first >= 0xe0) {
    width = 3;
    if (first === 0xe0) secondFrom = 0xa0;
  }
  if (first >= 0xf0) {
    width = 4;
    if (first === 0xf0) secondFrom = 0x90;
    if (first === 0xf4) secondTo = 0x8f;
  }
  if (position + 1 >= input.length || input[position + 1] < secondFrom ||
      input[position + 1] > secondTo) {
    return {codePoint: 0xfffd, width: 1};
  }
  for (let offset = 2; offset < width; ++offset) {
    if (position + offset >= input.length || input[position + offset] < 0x80 ||
        input[position + offset] > 0xbf) {
      return {codePoint: 0xfffd, width: offset};
    }
  }
  let codePoint;
  if (width === 2) {
    codePoint = ((first & 0x1f) << 6) | (input[position + 1] & 0x3f);
  } else if (width === 3) {
    codePoint = ((first & 0x0f) << 12) | ((input[position + 1] & 0x3f) << 6) |
        (input[position + 2] & 0x3f);
  } else {
    codePoint = ((first & 0x07) << 18) | ((input[position + 1] & 0x3f) << 12) |
        ((input[position + 2] & 0x3f) << 6) | (input[position + 3] & 0x3f);
  }
  return {codePoint, width};
}

function inRanges(codePoint) {
  return (codePoint >= 0x61 && codePoint <= 0x63) || codePoint === 0x78 ||
      (codePoint >= 0xe9 && codePoint <= 0xeb) ||
      (codePoint >= 0x1f600 && codePoint <= 0x1f601);
}

const oraclePrefix = bytes('key-name=');
const oracleTail = bytes('END-12345');

function hasBytesAt(input, position, expected) {
  if (position + expected.length > input.length) return false;
  for (let i = 0; i < expected.length; ++i) {
    if (input[position + i] !== expected[i]) return false;
  }
  return true;
}

function expectedSearch(input, start) {
  for (let candidate = start; candidate < input.length; ++candidate) {
    if (!hasBytesAt(input, candidate, oraclePrefix)) continue;
    const captureStart = candidate + oraclePrefix.length;
    const ends = [captureStart];
    let position = captureStart;
    while (position < input.length && ends.length <= 8) {
      const scalar = decodeScalar(input, position);
      if (!inRanges(scalar.codePoint)) break;
      position += scalar.width;
      ends.push(position);
    }
    for (let repeated = ends.length - 1; repeated >= 1; --repeated) {
      const end = ends[repeated];
      if (hasBytesAt(input, end, oracleTail)) {
        return {
          match: [candidate, end + oracleTail.length],
          capture: [captureStart, end],
          last: [ends[repeated - 1], end],
        };
      }
    }
  }
  return null;
}

const corpora = [
  bytes('key-name=a' + eAcute + 'xEND-12345'),
  [0x80, ...bytes('key-name=a' + eAcute + 'END-12345')],
  [0xe2, 0x82, ...bytes('key-name=abEND-12345')],
  [0xed, 0xa0, 0x80, ...bytes('key-name=abEND-12345')],
  [0xe0, 0x80, ...bytes('key-name=abEND-12345')],
  [0xf0, 0x80, ...bytes('key-name=abEND-12345')],
  [0xef, 0xbf, 0xbd, ...bytes('key-name=abEND-12345')],
  bytes('key-name=' + String.fromCodePoint(0x1f600) + 'aEND-12345'),
];
let randomState = 0x81d76c3b;
for (let sample = 0; sample < 200; ++sample) {
  const input = [];
  const length = 4 + (sample % 21);
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input.push(...bytes('key-name=a' + eAcute + 'bEND-12345'));
  corpora.push(input);
}

const oracle =
    /key-name=(([a-cx\u00e9-\u00eb\u{1f600}-\u{1f601}]){1,8})END-12345/dug;
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    const expected = expectedSearch(input, start);
    oracle.lastIndex = start;
    const match = oracle.exec(value);
    if (expected === null) {
      assertNull(match);
      assertEquals(0, oracle.lastIndex);
      continue;
    }
    assertNotNull(match);
    assertEquals(expected.match, match.indices[0]);
    assertEquals(expected.capture, match.indices[1]);
    assertEquals(expected.last, match.indices[2]);
    assertEquals(
        input.slice(expected.capture[0], expected.capture[1]), bytes(match[1]));
    assertEquals(
        input.slice(expected.last[0], expected.last[1]), bytes(match[2]));
    assertEquals(expected.match[1], oracle.lastIndex);
  }
}

// The old boundary remains accepted; 17-byte body/mixed atoms are handled by
// the long-ASCII extension.
assertMatchIndices(
    [[0, 12], [0, 4], [0, 4]], /(([A-C\u00e9-\u00eb]+))12345678/du,
    eAcute + eCircumflex + '12345678');
assertMatchIndices(
    [[0, 21], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb])+)1234567890abcdefg/du,
    eAcute + eCircumflex + tail17);
assertMatchIndices(
    [[0, 23], [17, 21], [19, 21]],
    /prefix-1234567890(([A-C\u00e9-\u00eb])+)xy/du,
    prefix17 + eAcute + eCircumflex + 'xy');
assertMatchIndices(
    [[0, 13], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){1,9})123456789/du,
    eAcute + eCircumflex + tail9);
assertNull(/(([A-C\u00e9-\u00eb])+)\u4e2d/du.exec(eAcute + eCircumflex + cjk));
assertNull(
    /(([A-C\u00e9-\u00eb])+)123456789/duy.exec(eAcute + eCircumflex + tail9));
assertNull(
    /(([a-c\u00e9-\u00eb])+)123456789/dui.exec(eAcute + eCircumflex + tail9));
