// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value => value === undefined ?
    undefined :
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const eDiaeresis = String.fromCodePoint(0xeb);
const iGrave = String.fromCodePoint(0xec);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const emojiOne = String.fromCodePoint(0x1f601);

const body = /([\u00e9-\u00eb]){1,3}/du.exec(eAcute + eCircumflex + 'x');
assertNotNull(body);
assertEquals(bytes(eAcute + eCircumflex), bytes(body[0]));
assertEquals(bytes(eCircumflex), bytes(body[1]));
assertEquals([[0, 4], [2, 4]], Array.from(body.indices));

const mixed = /((?<run>(?<part>[\u00e9-\u00eb]){1,3}))/du.exec(
    eAcute + eCircumflex + eDiaeresis + 'x');
assertNotNull(mixed);
for (let capture = 0; capture <= 2; ++capture) {
  assertEquals(bytes(eAcute + eCircumflex + eDiaeresis), bytes(mixed[capture]));
  assertEquals([0, 6], mixed.indices[capture]);
}
assertEquals(bytes(eDiaeresis), bytes(mixed[3]));
assertEquals([4, 6], mixed.indices[3]);
assertEquals(bytes(mixed[2]), bytes(mixed.groups.run));
assertEquals(bytes(mixed[3]), bytes(mixed.groups.part));
assertEquals(mixed.indices[2], mixed.indices.groups.run);
assertEquals(mixed.indices[3], mixed.indices.groups.part);

const lazy = /(([\u00e9-\u00eb]){1,3}?)/du.exec(eAcute + eCircumflex);
assertNotNull(lazy);
assertEquals(bytes(eAcute), bytes(lazy[0]));
assertEquals(bytes(lazy[0]), bytes(lazy[1]));
assertEquals(bytes(lazy[0]), bytes(lazy[2]));
assertEquals([[0, 2], [0, 2], [0, 2]], Array.from(lazy.indices));

const empty = /((?<part>[\u00e9-\u00eb]){0,2}?)/du.exec('x');
assertNotNull(empty);
assertEquals('', empty[0]);
assertEquals('', empty[1]);
assertEquals(undefined, empty.groups.part);
assertEquals([0, 0], empty.indices[0]);
assertEquals([0, 0], empty.indices[1]);
assertEquals(undefined, empty.indices.groups.part);

const edgeSubject =
    'AD' + eAcute + eDiaeresis + iGrave + cjk + emoji + emojiOne + 'x';
const edgeMatches = Array.from(edgeSubject.matchAll(
    /(([A-C\u00e9-\u00eb\u4e2d\u{1f600}-\u{1f601}]){1,2})/dgu));
assertEquals(
    [[0, 1], [2, 6], [8, 15], [15, 19]],
    edgeMatches.map(match => match.indices[0]));
assertEquals(
    edgeMatches.map(match => match.indices[0]),
    edgeMatches.map(match => match.indices[1]));
assertEquals(
    [[0, 1], [4, 6], [11, 15], [15, 19]],
    edgeMatches.map(match => match.indices[2]));

const malformedValue = raw(0x80, 0xc3, 0xa9, 0xc3, 0xaa, 0x78);
const malformed = /(([\u00e9-\u00eb]){1,2})/du.exec(malformedValue);
assertNotNull(malformed);
assertEquals([0xc3, 0xa9, 0xc3, 0xaa], bytes(malformed[0]));
assertEquals(bytes(malformed[0]), bytes(malformed[1]));
assertEquals([0xc3, 0xaa], bytes(malformed[2]));
assertEquals([[1, 5], [1, 5], [3, 5]], Array.from(malformed.indices));

const continuation = /(([\u00e9-\u00eb]){1,2})/dgu;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + eCircumflex + 'x');
assertNotNull(continuationMatch);
assertEquals(bytes(eCircumflex), bytes(continuationMatch[0]));
assertEquals([[2, 4], [2, 4], [2, 4]], Array.from(continuationMatch.indices));
assertEquals(4, continuation.lastIndex);

const replacementCalls = [];
assertEquals(
    'Xx',
    (eAcute + eCircumflex + 'x')
        .replace(/(([\u00e9-\u00eb]){1,2})/gu, (match, full, part, offset) => {
          replacementCalls.push(
              [offset, bytes(match), bytes(full), bytes(part)]);
          return 'X';
        }));
assertEquals(
    [[
      0, bytes(eAcute + eCircumflex), bytes(eAcute + eCircumflex),
      bytes(eCircumflex)
    ]],
    replacementCalls);

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

function inRanges(codePoint, ranges) {
  return ranges.some(([from, to]) => codePoint >= from && codePoint <= to);
}

function expectedSearch(input, start, ranges, minimum, maximum, greedy) {
  for (let candidate = start; candidate < input.length; ++candidate) {
    let position = candidate;
    let captureStart = -1;
    let repeated = 0;
    while (position < input.length && repeated < maximum) {
      const scalar = decodeScalar(input, position);
      if (!inRanges(scalar.codePoint, ranges)) break;
      captureStart = position;
      position += scalar.width;
      repeated++;
      if (!greedy && repeated === minimum) break;
    }
    if (repeated >= minimum)
      return {start: candidate, end: position, captureStart};
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
let randomState = 0xa54ff53a;
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
    regexp: /([A-C\u00e9-\u00eb\u{1f600}-\u{1f601}]){1,2}/dug,
    ranges: [[0x41, 0x43], [0xe9, 0xeb], [0x1f600, 0x1f601]],
    minimum: 1,
    maximum: 2,
    greedy: true,
    outer: [],
    inner: [1],
  },
  {
    regexp: /((?<part>[a-c\u00e9-\u00eb]){1,2}?)/dug,
    ranges: [[0x61, 0x63], [0xe9, 0xeb]],
    minimum: 1,
    maximum: 2,
    greedy: false,
    outer: [1],
    inner: [2],
    names: {part: 2},
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
        continue;
      }
      assertNotNull(match);
      const full = [expected.start, expected.end];
      const final = [expected.captureStart, expected.end];
      assertEquals(full, match.indices[0]);
      assertEquals(input.slice(expected.start, expected.end), bytes(match[0]));
      for (const capture of pattern.outer) {
        assertEquals(full, match.indices[capture]);
        assertEquals(bytes(match[0]), bytes(match[capture]));
      }
      for (const capture of pattern.inner) {
        assertEquals(final, match.indices[capture]);
        assertEquals(
            input.slice(expected.captureStart, expected.end),
            bytes(match[capture]));
      }
      if (pattern.names !== undefined) {
        for (const name of Object.keys(pattern.names)) {
          const capture = pattern.names[name];
          assertEquals(bytes(match[capture]), bytes(match.groups[name]));
          assertEquals(match.indices[capture], match.indices.groups[name]);
        }
      }
      assertEquals(expected.end, pattern.regexp.lastIndex);
    }
  }
}
