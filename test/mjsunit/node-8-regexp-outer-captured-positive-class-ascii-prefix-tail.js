// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const greedy =
    /key=([A-C\u00e9-\u00eb]{1,3})\r\n/du.exec('key=' + eAcute + '\r\n');
assertNotNull(greedy);
assertEquals(bytes('key=' + eAcute + '\r\n'), bytes(greedy[0]));
assertEquals(bytes(eAcute), bytes(greedy[1]));
assertEquals([[0, 8], [4, 6]], Array.from(greedy.indices));

assertNull(
    /key=([A-C\u00e9-\u00eb]{2,3})\r\n/du.exec('key=' + eAcute + '\r\n'));

const overlap = /k=([x\u00e9-\u00eb]{1,3})xy/du.exec('k=' + eAcute + 'xxy');
assertNotNull(overlap);
assertEquals(bytes(eAcute + 'x'), bytes(overlap[1]));
assertEquals([[0, 7], [2, 5]], Array.from(overlap.indices));

const lazy = /k=([A-C\u00e9-\u00eb]{1,3}?)xy/du.exec('k=A' + eAcute + 'xy');
assertNotNull(lazy);
assertEquals(bytes('A' + eAcute), bytes(lazy[1]));
assertEquals([[0, 7], [2, 5]], Array.from(lazy.indices));

const nested = /id=((?<value>[A-C\u00e9-\u00eb]{1,3}?))\r\n/du.exec(
    'id=' + eAcute + '\r\n');
assertNotNull(nested);
for (let capture = 1; capture <= 2; ++capture) {
  assertEquals(bytes(eAcute), bytes(nested[capture]));
  assertEquals([3, 5], nested.indices[capture]);
}
assertEquals(bytes(nested[2]), bytes(nested.groups.value));
assertEquals(nested.indices[2], nested.indices.groups.value);

const maximumAtoms = /12345678([A-C\u00e9-\u00eb]{1,3})abcdefgh/du.exec(
    '12345678' + eAcute + 'abcdefgh');
assertNotNull(maximumAtoms);
assertEquals([[0, 18], [8, 10]], Array.from(maximumAtoms.indices));

const malformedSubject = raw(0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0x78, 0x79);
const malformed = /k=([A-C\u00e9-\u00eb]{1,3})xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assertNotNull(malformedMatch);
assertEquals([[1, 7], [3, 5]], Array.from(malformedMatch.indices));
assertEquals(7, malformed.lastIndex);

const all = Array.from(('k=' + eAcute + 'xyk=A' + eCircumflex + 'xy')
                           .matchAll(/k=([A-C\u00e9-\u00eb]{1,3}?)xy/dgu));
assertEquals([[0, 6], [6, 13]], all.map(match => match.indices[0]));
assertEquals([[2, 4], [8, 11]], all.map(match => match.indices[1]));

const replacementCalls = [];
assertEquals(
    'Y',
    ('k=A' + eAcute + 'xy')
        .replace(/k=([A-C\u00e9-\u00eb]{1,3}?)xy/gu, (match, run, offset) => {
          replacementCalls.push([offset, bytes(match), bytes(run)]);
          return 'Y';
        }));
assertEquals(
    [[0, bytes('k=A' + eAcute + 'xy'), bytes('A' + eAcute)]], replacementCalls);

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

function expectedSearch(input, start, pattern) {
  for (let candidate = start; candidate + 3 < input.length; ++candidate) {
    if (input[candidate] !== 0x6b || input[candidate + 1] !== 0x3d) continue;
    const captureStart = candidate + 2;
    const ends = [captureStart];
    let position = captureStart;
    while (position < input.length && ends.length - 1 < pattern.maximum) {
      const scalar = decodeScalar(input, position);
      if (!inRanges(scalar.codePoint, pattern.ranges)) break;
      position += scalar.width;
      ends.push(position);
    }
    const first = pattern.lazy ? pattern.minimum : ends.length - 1;
    const limit = pattern.lazy ? ends.length : pattern.minimum - 1;
    const step = pattern.lazy ? 1 : -1;
    for (let repeated = first; repeated !== limit; repeated += step) {
      if (repeated >= ends.length) break;
      const end = ends[repeated];
      if (end + 1 < input.length && input[end] === 0x78 &&
          input[end + 1] === 0x79) {
        return {
          match: [candidate, end + 2],
          capture: [captureStart, end],
        };
      }
    }
  }
  return null;
}

const corpora = [
  [0x6b, 0x3d, 0x61, 0xc3, 0xa9, 0x78, 0x79],
  [0x80, 0x6b, 0x3d, 0xf0, 0x9f, 0x98, 0x80, 0x78, 0x79],
  [0x6b, 0x3d, 0xed, 0xa0, 0x80, 0x61, 0x78, 0x79],
  [0xe2, 0x82, 0x6b, 0x3d, 0x62, 0x78, 0x79],
  [0xff, 0x6b, 0x3d, 0x61, 0x78, 0x79],
  [0xe0, 0x80, 0x6b, 0x3d, 0x62, 0x78, 0x79],
  [0xf0, 0x80, 0x6b, 0x3d, 0x62, 0x78, 0x79],
  [0xef, 0xbf, 0xbd, 0x6b, 0x3d, 0x61, 0x78, 0x79],
];
let randomState = 0x3177a145;
for (let sample = 0; sample < 200; ++sample) {
  const length = 4 + (sample % 21);
  const input = [];
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input.push(0x6b, 0x3d, 0xc3, 0xa9, 0x78, 0x79);
  if (sample % 5 === 0) input[Math.floor(length / 2)] = 0xc3;
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x80;
  corpora.push(input);
}

const patterns = [
  {
    regexp: /k=([A-Cx\u00e9-\u00eb\u{1f600}-\u{1f601}]{1,3})xy/dug,
    ranges: [[0x41, 0x43], [0x78, 0x78], [0xe9, 0xeb], [0x1f600, 0x1f601]],
    minimum: 1,
    maximum: 3,
    lazy: false,
    captures: [1],
  },
  {
    regexp: /k=((?<run>[a-c\u00e9-\u00eb]{1,3}?))xy/dug,
    ranges: [[0x61, 0x63], [0xe9, 0xeb]],
    minimum: 1,
    maximum: 3,
    lazy: true,
    captures: [1, 2],
    names: {run: 2},
  },
];

for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const pattern of patterns) {
      const expected = expectedSearch(input, start, pattern);
      pattern.regexp.lastIndex = start;
      const match = pattern.regexp.exec(value);
      if (expected === null) {
        assertNull(match);
        assertEquals(0, pattern.regexp.lastIndex);
        continue;
      }
      assertNotNull(match);
      assertEquals(expected.match, match.indices[0]);
      assertEquals(
          input.slice(expected.match[0], expected.match[1]), bytes(match[0]));
      for (const capture of pattern.captures) {
        assertEquals(expected.capture, match.indices[capture]);
        assertEquals(
            input.slice(expected.capture[0], expected.capture[1]),
            bytes(match[capture]));
      }
      if (pattern.names !== undefined) {
        for (const name of Object.keys(pattern.names)) {
          const capture = pattern.names[name];
          assertEquals(bytes(match[capture]), bytes(match.groups[name]));
          assertEquals(match.indices[capture], match.indices.groups[name]);
        }
      }
      assertEquals(expected.match[1], pattern.regexp.lastIndex);
    }
  }
}
