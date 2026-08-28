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

assertNull(/([A-C\u00e9-\u00eb]{2,5})x/du.exec(eAcute + 'x'));

const bounded = /([A-C\u00e9-\u00eb]{2,5})x/du.exec(eAcute + eCircumflex + 'x');
assertNotNull(bounded);
assertEquals(bytes(eAcute + eCircumflex + 'x'), bytes(bounded[0]));
assertEquals(bytes(eAcute + eCircumflex), bytes(bounded[1]));
assertEquals([[0, 5], [0, 4]], Array.from(bounded.indices));

const backtrack = /([x\u00e9-\u00eb]{2,5})x/du.exec(eAcute + eCircumflex + 'x');
assertNotNull(backtrack);
assertEquals(bytes(eAcute + eCircumflex), bytes(backtrack[1]));
assertEquals([[0, 5], [0, 4]], Array.from(backtrack.indices));

const nested =
    /((?<run>[A-C\u00e9-\u00eb]{1,3}))x/du.exec(eAcute + eCircumflex + 'x');
assertNotNull(nested);
for (let capture = 1; capture <= 2; ++capture) {
  assertEquals(bytes(eAcute + eCircumflex), bytes(nested[capture]));
  assertEquals([0, 4], nested.indices[capture]);
}
assertEquals(bytes(nested[2]), bytes(nested.groups.run));
assertEquals(nested.indices[2], nested.indices.groups.run);

const nonAscii = /([\u4e2d\u{1f600}]{1,2})x/du.exec(cjk + emoji + 'x');
assertNotNull(nonAscii);
assertEquals(bytes(cjk + emoji), bytes(nonAscii[1]));
assertEquals([[0, 8], [0, 7]], Array.from(nonAscii.indices));

const empty = /([A-C\u00e9-\u00eb]{0,3})x/du.exec('x');
assertNotNull(empty);
assertEquals('', empty[1]);
assertEquals([[0, 1], [0, 0]], Array.from(empty.indices));

const malformedSubject = raw(0x80, 0xc3, 0xa9, 0xc3, 0xaa, 0x78);
const malformed = /([A-C\u00e9-\u00eb]{2,3})x/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assertNotNull(malformedMatch);
assertEquals([[1, 6], [1, 5]], Array.from(malformedMatch.indices));
assertEquals(6, malformed.lastIndex);

const all = Array.from(
    (eAcute + eCircumflex + 'xAAx').matchAll(/([A-C\u00e9-\u00eb]{1,3})x/dgu));
assertEquals([[0, 5], [5, 8]], all.map(match => match.indices[0]));
assertEquals([[0, 4], [5, 7]], all.map(match => match.indices[1]));

const replacementCalls = [];
assertEquals(
    'Y',
    (eAcute + eCircumflex + 'x')
        .replace(/([A-C\u00e9-\u00eb]{2,3})x/gu, (match, run, offset) => {
          replacementCalls.push([offset, bytes(match), bytes(run)]);
          return 'Y';
        }));
assertEquals(
    [[0, bytes(eAcute + eCircumflex + 'x'), bytes(eAcute + eCircumflex)]],
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

function expectedSearch(input, start, pattern) {
  for (let candidate = start; candidate < input.length; ++candidate) {
    const ends = [candidate];
    let position = candidate;
    while (position < input.length && ends.length - 1 < pattern.maximum) {
      const scalar = decodeScalar(input, position);
      if (!inRanges(scalar.codePoint, pattern.ranges)) break;
      position += scalar.width;
      ends.push(position);
    }
    for (let repeated = ends.length - 1; repeated >= pattern.minimum;
         --repeated) {
      if (ends[repeated] < input.length && input[ends[repeated]] === 0x78) {
        return {
          match: [candidate, ends[repeated] + 1],
          capture: [candidate, ends[repeated]],
        };
      }
    }
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
let randomState = 0x5be0cd19;
for (let sample = 0; sample < 200; ++sample) {
  const length = 4 + (sample % 21);
  const input = [];
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input[length - 1] = 0x78;
  if (sample % 5 === 0) input[Math.floor(length / 2)] = 0xc3;
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x80;
  corpora.push(input);
}

const patterns = [
  {
    regexp: /([A-Cx\u00e9-\u00eb\u{1f600}-\u{1f601}]{1,3})x/dug,
    ranges: [[0x41, 0x43], [0x78, 0x78], [0xe9, 0xeb], [0x1f600, 0x1f601]],
    minimum: 1,
    maximum: 3,
    captures: [1],
  },
  {
    regexp: /((?<run>[a-c\u00e9-\u00eb]{2,5}))x/dug,
    ranges: [[0x61, 0x63], [0xe9, 0xeb]],
    minimum: 2,
    maximum: 5,
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
