// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

function assertMatchIndices(expected, regexp, subject) {
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

const greedy = assertMatchIndices(
    [[0, 6], [0, 4]], /([A-C\u00e9-\u00eb]+)xy/du, eAcute + eCircumflex + 'xy');
assertEquals(bytes(eAcute + eCircumflex), bytes(greedy[1]));

assertMatchIndices(
    [[0, 6], [0, 4], [0, 4]], /(([A-C\u00e9-\u00eb]+))xy/du,
    eAcute + eCircumflex + 'xy');
assertMatchIndices(
    [[0, 9], [3, 7], [3, 7]], /id=(([A-C\u00e9-\u00eb]+?))xy/du,
    'id=' + eAcute + eCircumflex + 'xy');

const named = assertMatchIndices(
    [[0, 7], [2, 6], [2, 6], [2, 6]], /p=(?<field>(([A-C\u00e9-\u00eb]+?)))z/du,
    'p=' + eAcute + eCircumflex + 'z');
assertEquals(bytes(named[1]), bytes(named.groups.field));
assertEquals(named.indices[1], named.indices.groups.field);

assertMatchIndices(
    [[0, 2], [0, 0], [0, 0]], /(([A-C\u00e9-\u00eb]*))xy/du, 'xy');
assertMatchIndices(
    [[0, 4], [0, 2], [0, 2]], /(([A-C\u00e9-\u00eb]*?))xy/du, eAcute + 'xy');
assertMatchIndices(
    [[0, 7], [0, 5], [0, 5]], /(([A-C\u00e9-\u00eb]{2,}))xy/du,
    'A' + eAcute + eCircumflex + 'xy');

const nineScalars = 'A' + eAcute + 'BC' + eCircumflex + 'ABCA';
assertMatchIndices(
    [[0, 14], [2, 13]], /p=([A-C\u00e9-\u00eb]{9,})z/du,
    'p=' + nineScalars + 'z');
assertMatchIndices([[0, 4], [0, 2]], /([A-Cx\u00e9]+)xy/du, eAcute + 'xy');
assertMatchIndices(
    [[0, 6], [0, 4]], /([\u00e9-\u00eb]+)xy/du, eAcute + eCircumflex + 'xy');

// The fixed loop must safely exit at every ASCII/non-ASCII transition.
const transitionCases = [
  ['ABCxy', [[0, 5], [0, 3], [0, 3]]],
  [eAcute + 'ABxy', [[0, 6], [0, 4], [0, 4]]],
  ['A' + eAcute + 'Bxy', [[0, 6], [0, 4], [0, 4]]],
  ['AB' + eAcute + 'xy', [[0, 6], [0, 4], [0, 4]]],
  ['A' + eAcute + 'B' + eCircumflex + 'Cxy', [[0, 9], [0, 7], [0, 7]]],
];
for (const [subject, expected] of transitionCases) {
  assertMatchIndices(expected, /(([A-C\u00e9-\u00eb]+))xy/du, subject);
}
assertMatchIndices(
    [[0, 8], [0, 6], [0, 6]], /(([A-Cx\u00e9]+))xy/du, 'AB' + eAcute + 'xxxy');

const malformedSubject =
    raw(0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
const malformed = /k=([A-C\u00e9-\u00eb]+)xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assertNotNull(malformedMatch);
assertEquals([[1, 9], [3, 7]], Array.from(malformedMatch.indices));
assertEquals(9, malformed.lastIndex);

const chunk = 'k=A' + eAcute + 'Bxy';
const all =
    Array.from(chunk.repeat(200).matchAll(/k=(([A-C\u00e9-\u00eb]+))xy/dgu));
assertEquals(200, all.length);
for (let index = 0; index < all.length; ++index) {
  const start = index * chunk.length;
  assertEquals(
      [[start, start + 8], [start + 2, start + 6], [start + 2, start + 6]],
      Array.from(all[index].indices));
}

const replacementCalls = [];
assertEquals(
    'Y',
    ('key=' + eAcute + eCircumflex + '\r\n')
        .replace(/key=([A-C\u00e9-\u00eb]+)\r\n/gu, (match, field, offset) => {
          replacementCalls.push([offset, bytes(match), bytes(field)]);
          return 'Y';
        }));
assertEquals(
    [[
      0, bytes('key=' + eAcute + eCircumflex + '\r\n'),
      bytes(eAcute + eCircumflex)
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

function inClass(codePoint) {
  return (codePoint >= 0x61 && codePoint <= 0x63) ||
      (codePoint >= 0xe9 && codePoint <= 0xeb);
}

function expectedSearch(input, start) {
  for (let candidate = start; candidate + 3 < input.length; ++candidate) {
    if (input[candidate] !== 0x6b || input[candidate + 1] !== 0x3d) continue;
    const captureStart = candidate + 2;
    const ends = [captureStart];
    let end = captureStart;
    while (end < input.length) {
      const scalar = decodeScalar(input, end);
      if (!inClass(scalar.codePoint)) break;
      end += scalar.width;
      ends.push(end);
    }
    for (let count = ends.length - 1; count >= 1; --count) {
      end = ends[count];
      if (end + 1 < input.length && input[end] === 0x78 &&
          input[end + 1] === 0x79) {
        return {match: [candidate, end + 2], capture: [captureStart, end]};
      }
    }
  }
  return null;
}

const corpora = [
  [0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79],
  [0x80, 0x6b, 0x3d, 0x61, 0xc3, 0xa9, 0x78, 0x79],
  [0xe2, 0x82, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xff, 0x6b, 0x3d, 0xc3, 0xa9, 0x61, 0x78, 0x79],
  [0xed, 0xa0, 0x80, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xe0, 0x80, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xf0, 0x80, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xef, 0xbf, 0xbd, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
];
let randomState = 0x83fe9127;
for (let sample = 0; sample < 200; ++sample) {
  const input = [];
  const length = 4 + (sample % 21);
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input.push(0x6b, 0x3d, 0x61, 0xc3, 0xa9, 0x62, 0x78, 0x79);
  corpora.push(input);
}

const oracle = /k=([a-c\u00e9-\u00eb]+)xy/dug;
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    const expected = expectedSearch(input, start);
    oracle.lastIndex = start;
    const match = oracle.exec(value);
    if (expected === null) {
      assertNull(match);
      assertEquals(0, oracle.lastIndex);
    } else {
      assertNotNull(match);
      assertEquals(expected.match, match.indices[0]);
      assertEquals(expected.capture, match.indices[1]);
      assertEquals(
          input.slice(expected.capture[0], expected.capture[1]),
          bytes(match[1]));
      assertEquals(expected.match[1], oracle.lastIndex);
    }
  }
}

// Prior selectors remain correct, while complete pure-outer loops also use the
// new ASCII-optimistic compiler path.
const finite = assertMatchIndices(
    [[0, 6], [0, 4], [0, 4]], /(([A-C\u00e9-\u00eb]{1,3}))xy/du,
    eAcute + eCircumflex + 'xy');
assertEquals(bytes(eAcute + eCircumflex), bytes(finite[1]));
assertMatchIndices(
    [[0, 6], [2, 4]], /([A-C\u00e9-\u00eb])+xy/du, eAcute + eCircumflex + 'xy');
assertMatchIndices(
    [[0, 5], [0, 5], [0, 5]], /(([A-C\u00e9-\u00eb]+))/du,
    'A' + eAcute + eCircumflex);

// Unsupported selectors retain their preceding behavior.
assertNull(
    /([A-C\u00e9-\u00eb]+)123456789/du.exec(
        eAcute + eCircumflex + '123456789'));
assertNull(/([A-C\u00e9-\u00eb]+)xy/duy.exec(eAcute + eCircumflex + 'xy'));
assertNull(/([a-c\u00e9-\u00eb]+)xy/dui.exec(eAcute + eCircumflex + 'xy'));
