// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value => value === undefined ? undefined :
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const subject = eAcute + cjk + '^' + emoji + 'a';

const ordinary = Array.from(subject.matchAll(/(([^^])+)/dgu));
assertEquals([[0, 5], [6, 11]], ordinary.map(match => match.indices[0]));
assertEquals(ordinary.map(match => match.indices[0]),
             ordinary.map(match => match.indices[1]));
assertEquals([[2, 5], [10, 11]],
             ordinary.map(match => match.indices[2]));
assertEquals([bytes(cjk), bytes('a')],
             ordinary.map(match => bytes(match[2])));

const named = /(?<run>(?<part>[^^])*)/du.exec(eAcute + cjk + '^');
assertNotNull(named);
assertEquals(bytes(eAcute + cjk), bytes(named[0]));
assertEquals(bytes(named[0]), bytes(named.groups.run));
assertEquals(bytes(cjk), bytes(named.groups.part));
assertEquals([0, 5], named.indices[0]);
assertEquals([0, 5], named.indices.groups.run);
assertEquals([2, 5], named.indices.groups.part);

const empty = /(?<run>(?<part>[^^])*)/duy;
empty.lastIndex = 5;
const emptyMatch = empty.exec(eAcute + cjk + '^');
assertNotNull(emptyMatch);
assertEquals('', emptyMatch[0]);
assertEquals('', emptyMatch.groups.run);
assertEquals(undefined, emptyMatch.groups.part);
assertEquals([5, 5], emptyMatch.indices[0]);
assertEquals([5, 5], emptyMatch.indices.groups.run);
assertEquals(undefined, emptyMatch.indices.groups.part);
assertEquals(5, empty.lastIndex);

const nested = /(((?<part>[^^])+))/du.exec(eAcute + cjk);
assertNotNull(nested);
for (let capture = 0; capture <= 2; ++capture) {
  assertEquals(bytes(eAcute + cjk), bytes(nested[capture]));
  assertEquals([0, 5], nested.indices[capture]);
}
assertEquals(bytes(cjk), bytes(nested[3]));
assertEquals([2, 5], nested.indices[3]);
assertEquals(nested.indices[3], nested.indices.groups.part);

const replacementCalls = [];
assertEquals('X^X', subject.replace(/(([^^])+)/gu,
    (match, outer, inner, offset) => {
      replacementCalls.push([offset, bytes(match), bytes(outer), bytes(inner)]);
      return 'X';
    }));
assertEquals([
  [0, bytes(eAcute + cjk), bytes(eAcute + cjk), bytes(cjk)],
  [6, bytes(emoji + 'a'), bytes(emoji + 'a'), bytes('a')],
], replacementCalls);

const sticky = /(([^^])+)/duy;
sticky.lastIndex = 1;
const continuation = sticky.exec(eAcute + cjk + '^');
assertNotNull(continuation);
assertEquals([0xa9, 0xe4, 0xb8, 0xad], bytes(continuation[0]));
assertEquals(bytes(continuation[0]), bytes(continuation[1]));
assertEquals(bytes(cjk), bytes(continuation[2]));
assertEquals([[1, 5], [1, 5], [2, 5]],
             Array.from(continuation.indices));
assertEquals(5, sticky.lastIndex);

const malformed = /((([^^])+))/du.exec(raw(0x61, 0xe2, 0x82, 0x62, 0x5e));
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

function expectedRun(input, start, minimum) {
  let position = start;
  let captureStart = -1;
  while (position < input.length && input[position] !== 0x5e) {
    captureStart = position;
    position += scalarWidth(input, position);
  }
  if (minimum === 1 && position === start) return null;
  return {
    full: input.slice(start, position),
    capture: captureStart < 0 ? undefined : input.slice(captureStart, position),
    captureStart,
  };
}

const corpora = [
  [0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0x5e, 0x61],
  [0xf0, 0x9f, 0x98, 0x80, 0xe4, 0xb8, 0xad, 0x5e, 0x61],
  [0xed, 0xa0, 0x80, 0x61, 0x5e],
  [0xe2, 0x82, 0x62, 0x5e],
  [0x80, 0xff, 0x61, 0x5e],
  [0xe0, 0x80, 0x62, 0x5e],
  [0xf0, 0x80, 0x62, 0x5e],
  [0xe2, 0x82, 0x5e, 0x61],
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
  if (sample % 7 === 0) input[Math.floor(length / 3)] = 0x5e;
  corpora.push(input);
}

const runPatterns = [
  {regexp: /(([^^])+)/duy, minimum: 1, outer: [1], inner: [2]},
  {
    regexp: /(((?<part>[^^])+))/duy,
    minimum: 1,
    outer: [1, 2],
    inner: [3],
    names: {part: 3},
  },
  {
    regexp: /(?<run>(?<part>[^^])*)/duy,
    minimum: 0,
    outer: [1],
    inner: [2],
    names: {run: 1, part: 2},
  },
];
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {regexp, minimum, outer, inner, names} of runPatterns) {
      const expected = expectedRun(input, start, minimum);
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
      const finalIndices = expected.capture === undefined ? undefined :
          [expected.captureStart,
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
