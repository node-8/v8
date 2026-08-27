// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value => value === undefined ? undefined :
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const iGrave = String.fromCodePoint(0xec);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const emojiOne = String.fromCodePoint(0x1f601);

const ordinary = /(([\u00e9-\u00eb])+)/du.exec(eAcute + eCircumflex + 'x');
assertNotNull(ordinary);
assertEquals(bytes(eAcute + eCircumflex), bytes(ordinary[0]));
assertEquals(bytes(ordinary[0]), bytes(ordinary[1]));
assertEquals(bytes(eCircumflex), bytes(ordinary[2]));
assertEquals([[0, 4], [0, 4], [2, 4]], Array.from(ordinary.indices));

const edgeSubject =
    'A' + 'D' + eAcute + eDiaeresis + iGrave + cjk + emoji + emojiOne + 'x';
const edgeMatches = Array.from(edgeSubject.matchAll(
    /(([A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}])+)/dgu));
assertEquals([[0, 1], [2, 6], [8, 19]],
             edgeMatches.map(match => match.indices[0]));
assertEquals(edgeMatches.map(match => match.indices[0]),
             edgeMatches.map(match => match.indices[1]));
assertEquals([[0, 1], [4, 6], [15, 19]],
             edgeMatches.map(match => match.indices[2]));

const named = /(?<run>(?<part>[A-C\u00e9\u{1f600}])*)/du.exec(
    'B' + eAcute + emoji + 'x');
assertNotNull(named);
assertEquals(bytes('B' + eAcute + emoji), bytes(named[0]));
assertEquals(bytes(named[0]), bytes(named.groups.run));
assertEquals(bytes(emoji), bytes(named.groups.part));
assertEquals([0, 7], named.indices[0]);
assertEquals([0, 7], named.indices.groups.run);
assertEquals([3, 7], named.indices.groups.part);

const empty = /(?<run>(?<part>[A-C\u00e9\u{1f600}])*)/duy;
empty.lastIndex = 7;
const emptyMatch = empty.exec('B' + eAcute + emoji + 'x');
assertNotNull(emptyMatch);
assertEquals('', emptyMatch[0]);
assertEquals('', emptyMatch.groups.run);
assertEquals(undefined, emptyMatch.groups.part);
assertEquals([7, 7], emptyMatch.indices[0]);
assertEquals([7, 7], emptyMatch.indices.groups.run);
assertEquals(undefined, emptyMatch.indices.groups.part);

const broaderNegated = /(((?<part>[^\u0080-\u009f])+))/du.exec(
    eAcute + eCircumflex + String.fromCodePoint(0x80));
assertNotNull(broaderNegated);
assertEquals(bytes(eAcute + eCircumflex), bytes(broaderNegated[0]));
for (let capture = 1; capture <= 2; ++capture) {
  assertEquals(bytes(broaderNegated[0]), bytes(broaderNegated[capture]));
  assertEquals([0, 4], broaderNegated.indices[capture]);
}
assertEquals(bytes(eCircumflex), bytes(broaderNegated[3]));
assertEquals([2, 4], broaderNegated.indices[3]);

const malformedValue = raw(0x80, 0xff, 0x61, 0xe2, 0x82, 0x62);
const malformed = Array.from(
    malformedValue.matchAll(/(([\uFFFD])+)/dgu));
assertEquals([[0, 2], [3, 5]],
             malformed.map(match => match.indices[0]));
assertEquals(malformed.map(match => match.indices[0]),
             malformed.map(match => match.indices[1]));
assertEquals([[1, 2], [3, 5]],
             malformed.map(match => match.indices[2]));
assertEquals([[0x80, 0xff], [0xe2, 0x82]],
             malformed.map(match => bytes(match[0])));

const literalReplacement = /(([\uFFFD])+)/du.exec(
    String.fromCodePoint(0xfffd));
assertNotNull(literalReplacement);
for (let capture = 0; capture <= 2; ++capture) {
  assertEquals([0xef, 0xbf, 0xbd], bytes(literalReplacement[capture]));
  assertEquals([0, 3], literalReplacement.indices[capture]);
}

const replacementCalls = [];
assertEquals('XDX' + iGrave + 'Xx', edgeSubject.replace(
    /(([A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}])+)/gu,
    (match, outer, inner, offset) => {
      replacementCalls.push(
          [offset, bytes(match), bytes(outer), bytes(inner)]);
      return 'X';
    }));
assertEquals([
  [0, bytes('A'), bytes('A'), bytes('A')],
  [2, bytes(eAcute + eDiaeresis), bytes(eAcute + eDiaeresis),
   bytes(eDiaeresis)],
  [8, bytes(cjk + emoji + emojiOne), bytes(cjk + emoji + emojiOne),
   bytes(emojiOne)],
], replacementCalls);

const stickyReplacement = /(([\uFFFD])+)/duy;
stickyReplacement.lastIndex = 1;
const continuation = stickyReplacement.exec(eAcute);
assertNotNull(continuation);
assertEquals([0xa9], bytes(continuation[0]));
assertEquals([[1, 2], [1, 2], [1, 2]],
             Array.from(continuation.indices));
assertEquals(2, stickyReplacement.lastIndex);

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

function expectedRun(input, start, ranges, negated, minimum) {
  let position = start;
  let captureStart = -1;
  while (position < input.length) {
    const scalar = decodeScalar(input, position);
    if (inRanges(scalar.codePoint, ranges) === negated) break;
    captureStart = position;
    position += scalar.width;
  }
  if (minimum === 1 && position === start) return null;
  return {
    full: input.slice(start, position),
    capture: captureStart < 0 ? undefined : input.slice(captureStart, position),
    captureStart,
  };
}

const corpora = [
  [0x61, 0xc3, 0xa9, 0xc3, 0xab, 0x78],
  [0x42, 0xf0, 0x9f, 0x98, 0x80, 0x78],
  [0xef, 0xbf, 0xbd, 0x61, 0x78],
  [0xed, 0xa0, 0x80, 0x61, 0x78],
  [0xe2, 0x82, 0x62, 0x78],
  [0x80, 0xff, 0x61, 0x78],
  [0xe0, 0x80, 0x62, 0x78],
  [0xf0, 0x80, 0x62, 0x78],
];

let randomState = 0xbb67ae85;
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
    regexp: /(([a-c\u00e9-\u00eb\uFFFD])+)/duy,
    ranges: [[0x61, 0x63], [0xe9, 0xeb], [0xfffd, 0xfffd]],
    negated: false,
    minimum: 1,
    outer: [1],
    inner: [2],
  },
  {
    regexp: /(((?<part>[A-C\u00e9-\u00eb\u{1f600}-\u{1f601}])+))/duy,
    ranges: [[0x41, 0x43], [0xe9, 0xeb], [0x1f600, 0x1f601]],
    negated: false,
    minimum: 1,
    outer: [1, 2],
    inner: [3],
    names: {part: 3},
  },
  {
    regexp: /(?<run>(?<part>[^\u0080-\u009f])*)/duy,
    ranges: [[0x80, 0x9f]],
    negated: true,
    minimum: 0,
    outer: [1],
    inner: [2],
    names: {run: 1, part: 2},
  },
];
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const pattern of patterns) {
      const expected = expectedRun(
          input, start, pattern.ranges, pattern.negated, pattern.minimum);
      pattern.regexp.lastIndex = start;
      const match = pattern.regexp.exec(value);
      if (expected === null) {
        assertNull(match);
        assertEquals(0, pattern.regexp.lastIndex);
        continue;
      }

      assertNotNull(match);
      assertEquals(start, match.index);
      assertEquals(expected.full, bytes(match[0]));
      const fullIndices = [start, start + expected.full.length];
      assertEquals(fullIndices, match.indices[0]);
      for (const capture of pattern.outer) {
        assertEquals(expected.full, bytes(match[capture]));
        assertEquals(fullIndices, match.indices[capture]);
      }
      const finalIndices = expected.capture === undefined ? undefined :
          [expected.captureStart,
           expected.captureStart + expected.capture.length];
      for (const capture of pattern.inner) {
        assertEquals(expected.capture, bytes(match[capture]));
        assertEquals(finalIndices, match.indices[capture]);
      }
      if (pattern.names !== undefined) {
        for (const name of Object.keys(pattern.names)) {
          assertEquals(bytes(match[pattern.names[name]]),
                       bytes(match.groups[name]));
          assertEquals(match.indices[pattern.names[name]],
                       match.indices.groups[name]);
        }
      }
      assertEquals(start + expected.full.length, pattern.regexp.lastIndex);
    }
  }
}
