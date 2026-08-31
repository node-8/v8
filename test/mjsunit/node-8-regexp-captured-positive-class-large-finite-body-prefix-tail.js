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
const emoji = String.fromCodePoint(0x1f600);

function assertMatchIndices(expected, regexp, subject) {
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

assertMatchIndices(
    [[0, 6], [2, 4]], /([A-C\u00e9-\u00eb]){1,20}xy/du,
    eAcute + eCircumflex + 'xy');
assertMatchIndices(
    [[0, 6], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){1,20})xy/du,
    eAcute + eCircumflex + 'xy');
assertMatchIndices(
    [[0, 6], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){1,20}?)xy/du,
    eAcute + eCircumflex + 'xy');

const nineScalars = 'A' + eAcute + 'BC' + eCircumflex + 'ABCA';
assertMatchIndices(
    [[0, 14], [2, 13], [12, 13]], /p=(([A-C\u00e9-\u00eb]){9,20})z/du,
    'p=' + nineScalars + 'z');
assertMatchIndices(
    [[0, 26], [0, 24], [22, 24]], /(([A-C\u00e9-\u00eb]){1,100})xy/du,
    (eAcute + eCircumflex).repeat(6) + 'xy');

const prefix = 'prefix-123456789';
const tail = '1234567890abcdef';
assertMatchIndices(
    [[0, 36], [16, 20], [18, 20]],
    /prefix-123456789(([A-C\u00e9-\u00eb]){1,20})1234567890abcdef/du,
    prefix + eAcute + eCircumflex + tail);

const named = assertMatchIndices(
    [[0, 11], [4, 8], [4, 8], [6, 8]],
    /key=(?<field>((?<part>[A-C\u00e9-\u00eb]){1,20}))END/du,
    'key=' + eAcute + eCircumflex + 'END');
assertEquals(bytes(named[1]), bytes(named.groups.field));
assertEquals(bytes(named[3]), bytes(named.groups.part));
assertEquals(named.indices[1], named.indices.groups.field);
assertEquals(named.indices[3], named.indices.groups.part);

// Greedy backtracking must leave the overlapping ASCII bytes for the tail.
assertMatchIndices(
    [[0, 12], [0, 3], [2, 3]], /(([A-C1\u00e9]){1,20})123456789/du,
    eAcute + '1' +
        '123456789');
assertNull(
    /(([A-C\u00e9-\u00eb]){9,20})xy/du.exec(eAcute + eCircumflex + 'xy'));

const malformedSubject =
    raw(0x80, 0x6b, 0x65, 0x79, 0x3d, 0xc3, 0xa9, 0x45, 0x4e, 0x44);
const malformed = /key=([A-C\u00e9-\u00eb]){1,20}END/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assertNotNull(malformedMatch);
assertEquals([[1, 10], [5, 7]], Array.from(malformedMatch.indices));
assertEquals(10, malformed.lastIndex);

const chunk = 'key=A' + eAcute + 'BEND';
const all = Array.from(
    chunk.repeat(100).matchAll(/key=(([A-C\u00e9-\u00eb]){1,20})END/dgu));
assertEquals(100, all.length);
for (let index = 0; index < all.length; ++index) {
  const start = index * chunk.length;
  assertEquals(
      [[start, start + 11], [start + 4, start + 8], [start + 7, start + 8]],
      Array.from(all[index].indices));
}

assertEquals(
    'Y',
    ('key=' + eAcute + eCircumflex + 'END')
        .replace(
            /key=(([A-C\u00e9-\u00eb]){1,20})END/gu,
            (match, field, part, offset) => {
              assertEquals(0, offset);
              assertEquals(bytes(eAcute + eCircumflex), bytes(field));
              assertEquals(bytes(eCircumflex), bytes(part));
              return 'Y';
            }));

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

const oraclePrefix = bytes('key=');
const oracleTail = bytes('END');

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
    while (position < input.length && ends.length <= 20) {
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
  bytes('key=a' + eAcute + 'xEND'),
  [0x80, ...bytes('key=a' + eAcute + 'END')],
  [0xe2, 0x82, ...bytes('key=abEND')],
  [0xed, 0xa0, 0x80, ...bytes('key=abEND')],
  [0xe0, 0x80, ...bytes('key=abEND')],
  [0xf0, 0x80, ...bytes('key=abEND')],
  [0xef, 0xbf, 0xbd, ...bytes('key=abEND')],
  bytes('key=' + emoji + 'aEND'),
];
let randomState = 0x9f32a76d;
for (let sample = 0; sample < 200; ++sample) {
  const input = [];
  const length = 4 + (sample % 21);
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input.push(...bytes('key=a' + eAcute + 'bEND'));
  corpora.push(input);
}

const oracle = /key=(([a-cx\u00e9-\u00eb\u{1f600}-\u{1f601}]){1,20})END/dug;
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

// Existing selectors remain unchanged; the long-ASCII extension now admits
// the former 17-byte control.
assertMatchIndices(
    [[0, 6], [0, 4], [2, 4]], /(([A-C\u00e9-\u00eb]){1,8})xy/du,
    eAcute + eCircumflex + 'xy');
assertNull(
    /(([A-C\u00e9-\u00eb]{1,20}))xy/du.exec(eAcute + eCircumflex + 'xy'));
assertNull(
    /(([A-C\u00e9-\u00eb]){20})xy/du.exec(
        (eAcute + eCircumflex).repeat(10) + 'xy'));
assertMatchIndices(
    [[0, 21], [0, 4], [2, 4]],
    /(([A-C\u00e9-\u00eb]){1,20})1234567890abcdefg/du,
    eAcute + eCircumflex + '1234567890abcdefg');
assertNull(
    /(([A-C\u00e9-\u00eb]){1,20})\u4e2d/du.exec(eAcute + eCircumflex + cjk));
assertNull(
    /(([A-C\u00e9-\u00eb]){1,20})xy/duy.exec(eAcute + eCircumflex + 'xy'));
assertNull(
    /(([a-c\u00e9-\u00eb]){1,20})xy/dui.exec(eAcute + eCircumflex + 'xy'));
