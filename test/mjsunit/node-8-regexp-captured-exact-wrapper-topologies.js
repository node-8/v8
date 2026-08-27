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
const subject = eAcute + cjk + emoji + 'a' + eCircumflex + 'b';

const outerPairs = Array.from(subject.matchAll(/([^^]{2})/dgu));
assertEquals([[0, 5], [5, 10], [10, 13]],
             outerPairs.map(match => match.indices[0]));
assertEquals(outerPairs.map(match => match.indices[0]),
             outerPairs.map(match => match.indices[1]));
assertEquals(outerPairs.map(match => bytes(match[0])),
             outerPairs.map(match => bytes(match[1])));

const named = /(?<run>(?<part>[^^]){3}?)/du.exec(subject);
assertNotNull(named);
assertEquals(bytes(eAcute + cjk + emoji), bytes(named[0]));
assertEquals(bytes(named[0]), bytes(named.groups.run));
assertEquals(bytes(emoji), bytes(named.groups.part));
assertEquals([0, 9], named.indices[0]);
assertEquals([0, 9], named.indices.groups.run);
assertEquals([5, 9], named.indices.groups.part);

const nested = /(((?<part>[^^])){5})/du.exec(subject);
assertNotNull(nested);
assertEquals(bytes(eAcute + cjk + emoji + 'a' + eCircumflex),
             bytes(nested[0]));
assertEquals(bytes(nested[0]), bytes(nested[1]));
for (let capture = 2; capture <= 3; ++capture) {
  assertEquals(bytes(eCircumflex), bytes(nested[capture]));
  assertEquals([10, 12], nested.indices[capture]);
}
assertEquals([0, 12], nested.indices[1]);
assertEquals(nested.indices[3], nested.indices.groups.part);

const outerNested = /((([^^]{2})))/du.exec(eAcute + cjk);
assertNotNull(outerNested);
for (let capture = 0; capture <= 3; ++capture) {
  assertEquals(bytes(eAcute + cjk), bytes(outerNested[capture]));
  assertEquals([0, 5], outerNested.indices[capture]);
}

const positive = /([é-ë]{2})/du.exec(cjk + eAcute + eCircumflex);
assertNotNull(positive);
assertEquals(bytes(eAcute + eCircumflex), bytes(positive[0]));
assertEquals(bytes(positive[0]), bytes(positive[1]));
assertEquals([[3, 7], [3, 7]], Array.from(positive.indices));

const replacementClass = /(([\uFFFD]){3})/du.exec(
    raw(0x80, 0xff, 0xc0, 0x61));
assertNotNull(replacementClass);
assertEquals([0x80, 0xff, 0xc0], bytes(replacementClass[0]));
assertEquals(bytes(replacementClass[0]), bytes(replacementClass[1]));
assertEquals([0xc0], bytes(replacementClass[2]));
assertEquals([[0, 3], [0, 3], [2, 3]],
             Array.from(replacementClass.indices));

const replacementCalls = [];
assertEquals('XXX', subject.replace(/(([^^]){2})/gu,
    (match, outer, inner, offset) => {
      replacementCalls.push(
          [offset, bytes(match), bytes(outer), bytes(inner)]);
      return 'X';
    }));
assertEquals([
  [0, bytes(eAcute + cjk), bytes(eAcute + cjk), bytes(cjk)],
  [5, bytes(emoji + 'a'), bytes(emoji + 'a'), bytes('a')],
  [10, bytes(eCircumflex + 'b'),
   bytes(eCircumflex + 'b'), bytes('b')],
], replacementCalls);

const sticky = /(([^^]){3})/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + 'a');
assertNotNull(continuation);
assertEquals([0xa9, 0xe4, 0xb8, 0xad, 0x61], bytes(continuation[0]));
assertEquals(bytes(continuation[0]), bytes(continuation[1]));
assertEquals(bytes('a'), bytes(continuation[2]));
assertEquals([[1, 6], [1, 6], [5, 6]],
             Array.from(continuation.indices));
assertEquals(6, sticky.lastIndex);

sticky.lastIndex = 2;
assertNull(sticky.exec(eAcute + '^'));
assertEquals(0, sticky.lastIndex);

const malformed = /((([^^]){3}))/du.exec(raw(0x61, 0xe2, 0x82, 0x62));
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

function expectedExact(input, start, count) {
  let position = start;
  let captureStart = start;
  for (let iteration = 0; iteration < count; ++iteration) {
    if (position >= input.length || input[position] === 0x5e) return null;
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
  [0xe2, 0x82, 0x5e, 0x61, 0x62, 0x63, 0x64],
];

let randomState = 0xa54ff53a;
for (let sample = 0; sample < 200; ++sample) {
  const length = 6 + (sample % 21);
  const input = [];
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input[length - 1] = 0x61;
  if (sample % 5 === 0) input[Math.floor(length / 2)] = 0x61;
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x5e;
  corpora.push(input);
}

const exactPatterns = [
  {regexp: /([^^]{2})/duy, count: 2, outer: [1], inner: []},
  {
    regexp: /(?<run>(?<part>[^^]){3}?)/duy,
    count: 3,
    outer: [1],
    inner: [2],
    names: {run: 1, part: 2},
  },
  {
    regexp: /(((?<part>[^^])){5})/duy,
    count: 5,
    outer: [1],
    inner: [2, 3],
    names: {part: 3},
  },
];
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {regexp, count, outer, inner, names} of exactPatterns) {
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
      const fullIndices = [start, start + expected.full.length];
      assertEquals(fullIndices, match.indices[0]);
      for (const capture of outer) {
        assertEquals(expected.full, bytes(match[capture]));
        assertEquals(fullIndices, match.indices[capture]);
      }
      const finalIndices = [expected.captureStart,
                            expected.captureStart + expected.capture.length];
      for (const capture of inner) {
        assertEquals(expected.capture, bytes(match[capture]));
        assertEquals(finalIndices, match.indices[capture]);
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
