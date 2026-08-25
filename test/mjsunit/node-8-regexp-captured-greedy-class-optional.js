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
const subject = eAcute + '\n' + cjk;

const ordinary = Array.from(subject.matchAll(/([^\n])?/dgu));
assertEquals([[0, 2], [2, 2], [3, 6], [6, 6]],
             ordinary.map(match => match.indices[0]));
assertEquals([[0, 2], undefined, [3, 6], undefined],
             ordinary.map(match => match.indices[1]));
assertEquals([bytes(eAcute), undefined, bytes(cjk), undefined],
             ordinary.map(match => bytes(match[1])));

const named = Array.from(subject.matchAll(/(?<part>[^\n]){0,1}/dgu));
assertEquals([[0, 2], undefined, [3, 6], undefined],
             named.map(match => match.indices.groups.part));
assertEquals([bytes(eAcute), undefined, bytes(cjk), undefined],
             named.map(match => bytes(match.groups.part)));

const nested = Array.from(subject.matchAll(/((([^\n])))?/dgu));
for (let capture = 1; capture <= 3; ++capture) {
  assertEquals([[0, 2], undefined, [3, 6], undefined],
               nested.map(match => match.indices[capture]));
  assertEquals([bytes(eAcute), undefined, bytes(cjk), undefined],
               nested.map(match => bytes(match[capture])));
}

const positiveRange = /([é-ë])?/du.exec(eAcute + eCircumflex);
assertNotNull(positiveRange);
assertEquals(bytes(eAcute), bytes(positiveRange[0]));
assertEquals(bytes(eAcute), bytes(positiveRange[1]));
assertEquals([0, 2], positiveRange.indices[0]);
assertEquals([0, 2], positiveRange.indices[1]);

const replacementClass = /([\uFFFD])?/du.exec(raw(0x80, 0xff, 0x61));
assertNotNull(replacementClass);
assertEquals([0x80], bytes(replacementClass[0]));
assertEquals([0x80], bytes(replacementClass[1]));
assertEquals([0, 1], replacementClass.indices[0]);
assertEquals([0, 1], replacementClass.indices[1]);

const continuation = /([^\n])?/duy;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + '\n');
assertNotNull(continuationMatch);
assertEquals([0xa9], bytes(continuationMatch[0]));
assertEquals([0xa9], bytes(continuationMatch[1]));
assertEquals([1, 2], continuationMatch.indices[0]);
assertEquals([1, 2], continuationMatch.indices[1]);
assertEquals(2, continuation.lastIndex);

continuation.lastIndex = 2;
const emptySticky = continuation.exec(eAcute + '\n');
assertNotNull(emptySticky);
assertEquals('', emptySticky[0]);
assertEquals(undefined, emptySticky[1]);
assertEquals([2, 2], emptySticky.indices[0]);
assertEquals(undefined, emptySticky.indices[1]);
assertEquals(2, continuation.lastIndex);

const malformed = /([^\n])?/duy;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(raw(0x61, 0xe2, 0x82, 0x0a));
assertNotNull(malformedMatch);
assertEquals([0xe2, 0x82], bytes(malformedMatch[0]));
assertEquals([0xe2, 0x82], bytes(malformedMatch[1]));
assertEquals([1, 3], malformedMatch.indices[0]);
assertEquals([1, 3], malformedMatch.indices[1]);

const replacementCalls = [];
assertEquals('XX\nXX', subject.replace(/([^\n])?/gu,
    (match, capture, offset) => {
      replacementCalls.push([offset, bytes(match), bytes(capture)]);
      return 'X';
    }));
assertEquals([
  [0, bytes(eAcute), bytes(eAcute)],
  [2, [], undefined],
  [3, bytes(cjk), bytes(cjk)],
  [6, [], undefined],
], replacementCalls);

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

function expectedOptional(input, start) {
  if (start >= input.length || input[start] === 0x0a) {
    return {full: [], capture: undefined};
  }
  const end = start + scalarWidth(input, start);
  return {full: input.slice(start, end), capture: input.slice(start, end)};
}

const corpora = [
  [0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0x0a, 0x61],
  [0xf0, 0x9f, 0x98, 0x80, 0xe4, 0xb8, 0xad, 0x0a, 0x61],
  [0xed, 0xa0, 0x80, 0x61, 0x0a],
  [0xe2, 0x82, 0x62, 0x0a],
  [0x80, 0xff, 0x61, 0x0a],
  [0xe0, 0x80, 0x62, 0x0a],
  [0xf0, 0x80, 0x62, 0x0a],
  [0xe2, 0x82, 0x0a, 0x61],
];

let randomState = 0x6a09e667;
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

const optionalPatterns = [
  {regexp: /([^\n])?/duy, captures: [1]},
  {regexp: /(?<part>[^\n]){0,1}/duy, captures: [1], name: 'part'},
  {regexp: /((([^\n])))?/duy, captures: [1, 2, 3]},
];
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {regexp, captures, name} of optionalPatterns) {
      const expected = expectedOptional(input, start);
      regexp.lastIndex = start;
      const match = regexp.exec(value);
      assertNotNull(match);
      assertEquals(start, match.index);
      assertEquals(expected.full, bytes(match[0]));
      assertEquals([start, start + expected.full.length], match.indices[0]);
      for (const capture of captures) {
        assertEquals(expected.capture, bytes(match[capture]));
        const expectedIndices = expected.capture === undefined ? undefined :
            [start, start + expected.capture.length];
        assertEquals(expectedIndices, match.indices[capture]);
      }
      if (name !== undefined) {
        assertEquals(expected.capture, bytes(match.groups[name]));
        assertEquals(match.indices[1], match.indices.groups[name]);
      }
      assertEquals(start + expected.full.length, regexp.lastIndex);
    }
  }
}
