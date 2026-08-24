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
const subject = eAcute + cjk + emoji + 'a' + eCircumflex + 'b';

const greedyPairs = Array.from(subject.matchAll(/([^\n]){2}/dgu));
assertEquals([[0, 5], [5, 10], [10, 13]],
             greedyPairs.map(match => match.indices[0]));
assertEquals([[2, 5], [9, 10], [12, 13]],
             greedyPairs.map(match => match.indices[1]));

const namedTriple = /(?<part>[^\n]){3}?/du.exec(subject);
assertNotNull(namedTriple);
assertEquals(bytes(eAcute + cjk + emoji), bytes(namedTriple[0]));
assertEquals(bytes(emoji), bytes(namedTriple.groups.part));
assertEquals([0, 9], namedTriple.indices[0]);
assertEquals([5, 9], namedTriple.indices.groups.part);

const nestedFive = /((([^\n]))){5}/du.exec(subject);
assertNotNull(nestedFive);
assertEquals(bytes(eAcute + cjk + emoji + 'a' + eCircumflex),
             bytes(nestedFive[0]));
for (let capture = 1; capture <= 3; ++capture) {
  assertEquals(bytes(eCircumflex), bytes(nestedFive[capture]));
  assertEquals([10, 12], nestedFive.indices[capture]);
}

const positiveRange = /([é-ë]){3}?/du.exec(
    cjk + eAcute + eCircumflex + String.fromCodePoint(0xeb));
assertNotNull(positiveRange);
assertEquals([3, 9], positiveRange.indices[0]);
assertEquals([7, 9], positiveRange.indices[1]);

const replacementClass = /([\uFFFD]){3}/du.exec(raw(0x80, 0xff, 0xc0, 0x61));
assertNotNull(replacementClass);
assertEquals([0x80, 0xff, 0xc0], bytes(replacementClass[0]));
assertEquals([0xc0], bytes(replacementClass[1]));
assertEquals([0, 3], replacementClass.indices[0]);
assertEquals([2, 3], replacementClass.indices[1]);

const continuation = /([^\n]){3}/duy;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + cjk + 'a');
assertNotNull(continuationMatch);
assertEquals([0xa9, 0xe4, 0xb8, 0xad, 0x61], bytes(continuationMatch[0]));
assertEquals(bytes('a'), bytes(continuationMatch[1]));
assertEquals([1, 6], continuationMatch.indices[0]);
assertEquals([5, 6], continuationMatch.indices[1]);
assertEquals(6, continuation.lastIndex);

const malformed = /([^\n]){3}?/du.exec(raw(0x61, 0xe2, 0x82, 0x62));
assertNotNull(malformed);
assertEquals([0x61, 0xe2, 0x82, 0x62], bytes(malformed[0]));
assertEquals([0x62], bytes(malformed[1]));
assertEquals([0, 4], malformed.indices[0]);
assertEquals([3, 4], malformed.indices[1]);

const replacementOffsets = [];
assertEquals('XXX', subject.replace(/([^\n]){2}/gu,
    (match, capture, offset) => {
      replacementOffsets.push([offset, bytes(match), bytes(capture)]);
      return 'X';
    }));
assertEquals([
  [0, bytes(eAcute + cjk), bytes(cjk)],
  [5, bytes(emoji + 'a'), bytes('a')],
  [10, bytes(eCircumflex + 'b'), bytes('b')],
], replacementOffsets);

function scalarWidth(input, position) {
  const first = input[position];
  if (first < 0x80 || first < 0xc2 || first > 0xf4) return 1;
  if (first < 0xe0) {
    return position + 1 < input.length && input[position + 1] >= 0x80 &&
            input[position + 1] <= 0xbf ? 2 : 1;
  }

  let secondFrom = 0x80;
  let secondTo = 0xbf;
  let width = 3;
  if (first === 0xe0) secondFrom = 0xa0;
  if (first >= 0xf0) {
    width = 4;
    if (first === 0xf0) secondFrom = 0x90;
    if (first === 0xf4) secondTo = 0x8f;
  }
  if (position + 1 >= input.length || input[position + 1] < secondFrom ||
      input[position + 1] > secondTo) {
    return 1;
  }
  for (let offset = 2; offset < width; ++offset) {
    if (position + offset >= input.length ||
        input[position + offset] < 0x80 ||
        input[position + offset] > 0xbf) {
      return offset;
    }
  }
  return width;
}

function expectedExact(input, start, count) {
  let position = start;
  let captureStart = start;
  for (let iteration = 0; iteration < count; ++iteration) {
    if (position >= input.length || input[position] === 0x0a) return null;
    captureStart = position;
    position += scalarWidth(input, position);
  }
  return {
    full: input.slice(start, position),
    capture: input.slice(captureStart, position),
    captureStart,
  };
}

const corpora = [
  [0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0x61, 0x62, 0x63],
  [0xf0, 0x9f, 0x98, 0x80, 0xe4, 0xb8, 0xad, 0x61, 0x62, 0x63],
  [0xed, 0xa0, 0x80, 0x61, 0x62, 0x63, 0x64],
  [0xe2, 0x82, 0x62, 0x61, 0x63, 0x64, 0x65],
  [0x80, 0xff, 0x61, 0x62, 0x63, 0x64],
  [0xe0, 0x80, 0x62, 0x61, 0x63, 0x64, 0x65],
  [0xf0, 0x80, 0x62, 0x61, 0x63, 0x64, 0x65],
  [0xe2, 0x82, 0x0a, 0x61, 0x62, 0x63, 0x64],
];

let randomState = 0x13198a2e;
for (let sample = 0; sample < 200; ++sample) {
  const length = 6 + (sample % 21);
  const input = [];
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input[length - 1] = 0x61;
  if (sample % 5 === 0) input[Math.floor(length / 2)] = 0x61;
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x0a;
  corpora.push(input);
}

const exactPatterns = [
  {regexp: /([^\n]){2}/duy, count: 2, captures: [1]},
  {
    regexp: /(?<part>[^\n]){3}?/duy,
    count: 3,
    captures: [1],
    name: 'part',
  },
  {regexp: /((([^\n]))){5}/duy, count: 5, captures: [1, 2, 3]},
];
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {regexp, count, captures, name} of exactPatterns) {
      const expected = expectedExact(input, start, count);
      regexp.lastIndex = start;
      const match = regexp.exec(value);
      if (expected === null) {
        assertNull(match);
        assertEquals(0, regexp.lastIndex);
        continue;
      }

      assertNotNull(match);
      assertEquals(start, match.index);
      assertEquals(expected.full, bytes(match[0]));
      assertEquals([start, start + expected.full.length], match.indices[0]);
      for (const capture of captures) {
        assertEquals(expected.capture, bytes(match[capture]));
        assertEquals([expected.captureStart,
                      expected.captureStart + expected.capture.length],
                     match.indices[capture]);
      }
      if (name !== undefined) {
        assertEquals(expected.capture, bytes(match.groups[name]));
        assertEquals(match.indices[1], match.indices.groups[name]);
      }
      assertEquals(start + expected.full.length, regexp.lastIndex);
    }
  }
}
