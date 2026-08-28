// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value => Array.from(
    {length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const iGrave = String.fromCodePoint(0xec);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const emojiOne = String.fromCodePoint(0x1f601);

const greedy = /[\u00e9-\u00eb]{1,3}/du.exec(
    eAcute + eCircumflex + 'x');
assertNotNull(greedy);
assertEquals(bytes(eAcute + eCircumflex), bytes(greedy[0]));
assertEquals([0, 4], greedy.indices[0]);

assertNull(/[\u00e9-\u00eb]{3,5}/du.exec(eAcute + eCircumflex));

const lazyPlus = /[\u00e9-\u00eb]+?/du.exec(eAcute + eCircumflex);
assertNotNull(lazyPlus);
assertEquals(bytes(eAcute), bytes(lazyPlus[0]));
assertEquals([0, 2], lazyPlus.indices[0]);

const lazyBounded = /[\u00e9-\u00eb]{1,2}?/du.exec(
    eAcute + eCircumflex);
assertNotNull(lazyBounded);
assertEquals(bytes(eAcute), bytes(lazyBounded[0]));
assertEquals([0, 2], lazyBounded.indices[0]);

const lazyMinimum = /[\u00e9-\u00eb]{2,}?/du.exec(
    eAcute + eCircumflex + eDiaeresis);
assertNotNull(lazyMinimum);
assertEquals(bytes(eAcute + eCircumflex), bytes(lazyMinimum[0]));
assertEquals([0, 4], lazyMinimum.indices[0]);

const lazyExact = /[\u00e9-\u00eb]{2}?/du.exec(
    eAcute + eCircumflex + eDiaeresis);
assertNotNull(lazyExact);
assertEquals(bytes(eAcute + eCircumflex), bytes(lazyExact[0]));
assertEquals([0, 4], lazyExact.indices[0]);

const edgeSubject =
    'AD' + eAcute + eDiaeresis + iGrave + cjk + emoji + emojiOne + 'x';
const edgeMatches = Array.from(edgeSubject.matchAll(
    /[A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}]{1,2}/dgu));
assertEquals([[0, 1], [2, 6], [8, 15], [15, 19]],
             edgeMatches.map(match => match.indices[0]));
assertEquals([
  bytes('A'),
  bytes(eAcute + eDiaeresis),
  bytes(cjk + emoji),
  bytes(emojiOne),
], edgeMatches.map(match => bytes(match[0])));

const surrogate = String.fromCodePoint(0xd800);
const surrogateMatch = /[\ud800]{1,2}?/du.exec(surrogate + surrogate);
assertNotNull(surrogateMatch);
assertEquals(bytes(surrogate), bytes(surrogateMatch[0]));
assertEquals([0, 3], surrogateMatch.indices[0]);

const malformedValue = raw(0x80, 0xe2, 0x82, 0x61, 0xc3, 0xa9);
const malformed = /[A-C\u00e9-\u00eb]{1,2}/du.exec(malformedValue);
assertNotNull(malformed);
assertEquals([0xc3, 0xa9], bytes(malformed[0]));
assertEquals([4, 6], malformed.indices[0]);

const continuation = /[\u00e9-\u00eb]{1,2}/dgu;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + eCircumflex);
assertNotNull(continuationMatch);
assertEquals(bytes(eCircumflex), bytes(continuationMatch[0]));
assertEquals([2, 4], continuationMatch.indices[0]);
assertEquals(4, continuation.lastIndex);

const empty = Array.from(
    (eAcute + 'x').matchAll(/[\u00e9-\u00eb]{0,2}?/dgu));
assertEquals([[0, 0], [1, 1], [2, 2], [3, 3]],
             empty.map(match => match.indices[0]));

function decodeScalar(input, position) {
  const first = input[position];
  if (first < 0x80) return {codePoint: first, width: 1};
  if (first < 0xc2 || first > 0xf4) {
    return {codePoint: 0xfffd, width: 1};
  }

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
    if (position + offset >= input.length ||
        input[position + offset] < 0x80 ||
        input[position + offset] > 0xbf) {
      return {codePoint: 0xfffd, width: offset};
    }
  }

  let codePoint;
  if (width === 2) {
    codePoint = ((first & 0x1f) << 6) | (input[position + 1] & 0x3f);
  } else if (width === 3) {
    codePoint = ((first & 0x0f) << 12) |
        ((input[position + 1] & 0x3f) << 6) |
        (input[position + 2] & 0x3f);
  } else {
    codePoint = ((first & 0x07) << 18) |
        ((input[position + 1] & 0x3f) << 12) |
        ((input[position + 2] & 0x3f) << 6) |
        (input[position + 3] & 0x3f);
  }
  return {codePoint, width};
}

function inRanges(codePoint, ranges) {
  return ranges.some(
      ([from, to]) => codePoint >= from && codePoint <= to);
}

function expectedSearch(input, start, ranges, minimum, maximum, greedy) {
  for (let candidate = start; candidate < input.length; ++candidate) {
    let position = candidate;
    let repeated = 0;
    while (position < input.length && repeated < maximum) {
      const scalar = decodeScalar(input, position);
      if (!inRanges(scalar.codePoint, ranges)) break;
      position += scalar.width;
      repeated++;
      if (!greedy && repeated === minimum) break;
    }
    if (repeated >= minimum) return [candidate, position];
  }
  return null;
}

const corpora = [
  [0x61, 0xc3, 0xa9, 0xc3, 0xab, 0x78],
  [0x42, 0xf0, 0x9f, 0x98, 0x80, 0x78],
  [0xed, 0xa0, 0x80, 0x61, 0x78],
  [0xe2, 0x82, 0x62, 0x78],
  [0x80, 0xff, 0x61, 0x78],
  [0xe0, 0x80, 0x62, 0x78],
  [0xf0, 0x80, 0x62, 0x78],
  [0xef, 0xbf, 0xbd, 0x61, 0x78],
];
let randomState = 0x3c6ef372;
for (let sample = 0; sample < 200; ++sample) {
  const length = 3 + (sample % 21);
  const input = [];
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input[length - 1] = 0x61;
  if (sample % 5 === 0) input[Math.floor(length / 2)] = 0xc3;
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x80;
  corpora.push(input);
}

const patterns = [
  {
    regexp: /[a-c\u00e9-\u00eb]{1,3}/dug,
    ranges: [[0x61, 0x63], [0xe9, 0xeb]],
    minimum: 1,
    maximum: 3,
    greedy: true,
  },
  {
    regexp: /[A-C\u00e9-\u00eb\u{1f600}-\u{1f601}]{1,2}?/dug,
    ranges: [[0x41, 0x43], [0xe9, 0xeb], [0x1f600, 0x1f601]],
    minimum: 1,
    maximum: 2,
    greedy: false,
  },
  {
    regexp: /[a-c\u00e9-\u00eb]{2,}?/dug,
    ranges: [[0x61, 0x63], [0xe9, 0xeb]],
    minimum: 2,
    maximum: Infinity,
    greedy: false,
  },
];

for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const pattern of patterns) {
      const expected = expectedSearch(
          input, start, pattern.ranges, pattern.minimum, pattern.maximum,
          pattern.greedy);
      pattern.regexp.lastIndex = start;
      const match = pattern.regexp.exec(value);
      if (expected === null) {
        assertNull(match);
        assertEquals(0, pattern.regexp.lastIndex);
      } else {
        assertNotNull(match);
        assertEquals(expected[0], match.index);
        assertEquals(expected, match.indices[0]);
        assertEquals(input.slice(expected[0], expected[1]), bytes(match[0]));
        assertEquals(expected[1], pattern.regexp.lastIndex);
      }
    }
  }
}
