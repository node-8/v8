// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value => value === undefined ? undefined :
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + emoji + 'a' + eCircumflex;

const ordinary = /(([^\n]){2,5})/du.exec(subject);
assertNotNull(ordinary);
assertEquals(bytes(subject), bytes(ordinary[0]));
assertEquals(bytes(subject), bytes(ordinary[1]));
assertEquals(bytes(eCircumflex), bytes(ordinary[2]));
assertEquals([[0, 12], [0, 12], [10, 12]],
             Array.from(ordinary.indices));

const named = Array.from(
    subject.matchAll(/(?<run>(?<part>[^\n]){1,2})/dgu));
assertEquals([[0, 5], [5, 10], [10, 12]],
             named.map(match => match.indices.groups.run));
assertEquals([[2, 5], [9, 10], [10, 12]],
             named.map(match => match.indices.groups.part));
assertEquals(named.map(match => bytes(match[0])),
             named.map(match => bytes(match.groups.run)));
assertEquals([bytes(cjk), bytes('a'), bytes(eCircumflex)],
             named.map(match => bytes(match.groups.part)));

const zeroSubject = eAcute + cjk + '\n' + emoji;
const nested = Array.from(
    zeroSubject.matchAll(/(((?<part>[^\n])){0,3})/dgu));
assertEquals([[0, 5], [5, 5], [6, 10], [10, 10]],
             nested.map(match => match.indices[0]));
assertEquals(nested.map(match => match.indices[0]),
             nested.map(match => match.indices[1]));
for (let capture = 2; capture <= 3; ++capture) {
  assertEquals([[2, 5], undefined, [6, 10], undefined],
               nested.map(match => match.indices[capture]));
}
assertEquals(nested.map(match => match.indices[3]),
             nested.map(match => match.indices.groups.part));

const replacementCalls = [];
assertEquals('X', subject.replace(/(([^\n]){2,5})/gu,
    (match, outer, inner, offset) => {
      replacementCalls.push(
          [offset, bytes(match), bytes(outer), bytes(inner)]);
      return 'X';
    }));
assertEquals([[0, bytes(subject), bytes(subject), bytes(eCircumflex)]],
             replacementCalls);

const sticky = /(([^\n]){2,5})/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assertNotNull(continuation);
assertEquals([0xa9, 0xe4, 0xb8, 0xad, 0x61], bytes(continuation[0]));
assertEquals(bytes(continuation[0]), bytes(continuation[1]));
assertEquals(bytes('a'), bytes(continuation[2]));
assertEquals([[1, 6], [1, 6], [5, 6]],
             Array.from(continuation.indices));
assertEquals(6, sticky.lastIndex);

sticky.lastIndex = 5;
assertNull(sticky.exec(eAcute + cjk + '\n'));
assertEquals(0, sticky.lastIndex);

const malformed = /((([^\n]){2,3}))/du.exec(
    raw(0x61, 0xe2, 0x82, 0x62));
assertNotNull(malformed);
assertEquals([0x61, 0xe2, 0x82, 0x62], bytes(malformed[0]));
assertEquals(bytes(malformed[0]), bytes(malformed[1]));
assertEquals(bytes(malformed[0]), bytes(malformed[2]));
assertEquals([0x62], bytes(malformed[3]));
assertEquals([[0, 4], [0, 4], [0, 4], [3, 4]],
             Array.from(malformed.indices));

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

function expectedBound(input, start, min, max) {
  let position = start;
  let count = 0;
  let captureStart = start;
  while (position < input.length && input[position] !== 0x0a && count < max) {
    captureStart = position;
    position += scalarWidth(input, position);
    count++;
  }
  if (count < min) return null;
  return {
    full: input.slice(start, position),
    capture: count === 0 ? undefined : input.slice(captureStart, position),
    captureStart,
  };
}

const corpora = [
  [0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0x61, 0x62],
  [0xf0, 0x9f, 0x98, 0x80, 0xe4, 0xb8, 0xad, 0x61, 0x62],
  [0xed, 0xa0, 0x80, 0x61, 0x62],
  [0xe2, 0x82, 0x62, 0x61],
  [0x80, 0xff, 0x61, 0x62],
  [0xe0, 0x80, 0x62, 0x61],
  [0xf0, 0x80, 0x62, 0x61],
  [0xe2, 0x82, 0x0a, 0x61],
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
  if (sample % 5 === 0) input[Math.floor(length / 2)] = 0x61;
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x0a;
  corpora.push(input);
}

const boundPatterns = [
  {
    regexp: /(([^\n]){2,5})/duy,
    min: 2,
    max: 5,
    outer: [1],
    inner: [2],
  },
  {
    regexp: /(?<run>(?<part>[^\n]){1,2})/duy,
    min: 1,
    max: 2,
    outer: [1],
    inner: [2],
    names: {run: 1, part: 2},
  },
  {
    regexp: /(((?<part>[^\n])){0,3})/duy,
    min: 0,
    max: 3,
    outer: [1],
    inner: [2, 3],
    names: {part: 3},
  },
];
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {regexp, min, max, outer, inner, names} of boundPatterns) {
      const expected = expectedBound(input, start, min, max);
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
      const fullIndices = [start, start + expected.full.length];
      assertEquals(fullIndices, match.indices[0]);
      for (const capture of outer) {
        assertEquals(expected.full, bytes(match[capture]));
        assertEquals(fullIndices, match.indices[capture]);
      }
      for (const capture of inner) {
        assertEquals(expected.capture, bytes(match[capture]));
        const expectedIndices = expected.capture === undefined ? undefined :
            [expected.captureStart,
             expected.captureStart + expected.capture.length];
        assertEquals(expectedIndices, match.indices[capture]);
      }
      if (names !== undefined) {
        for (const name of Object.keys(names)) {
          assertEquals(bytes(match[names[name]]), bytes(match.groups[name]));
          assertEquals(match.indices[names[name]], match.indices.groups[name]);
        }
      }
      assertEquals(start + expected.full.length, regexp.lastIndex);
    }
  }
}
