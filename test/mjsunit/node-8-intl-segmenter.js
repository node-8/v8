// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --expose-gc

function assertComposes(input, segments) {
  let nextIndex = 0;
  const parts = [];
  for (const part of segments) {
    assertEquals(input, part.input);
    assertEquals(nextIndex, part.index);
    assertEquals(
        part.segment,
        input.slice(part.index, part.index + part.segment.length));
    nextIndex += part.segment.length;
    parts.push(part.segment);
  }
  assertEquals(input.length, nextIndex);
  assertEquals(input, parts.join(''));
}

function assertContainingMatchesIteration(segmenter, input) {
  const segments = Array.from(segmenter.segment(input));
  assertComposes(input, segments);

  const containingSegments = segmenter.segment(input);
  let segmentIndex = 0;
  for (let index = 0; index < input.length; ++index) {
    while (index >= segments[segmentIndex].index +
               segments[segmentIndex].segment.length) {
      ++segmentIndex;
    }
    const expected = segments[segmentIndex];
    const containing = containingSegments.containing(index);
    assertEquals(expected.index, containing.index);
    assertEquals(expected.segment, containing.segment);
  }
}

const graphemeSegmenter = new Intl.Segmenter('en', {granularity: 'grapheme'});
const graphemeInput = 'Aé中😀e\u0301👨‍👩‍👧‍👦';
const graphemes = Array.from(graphemeSegmenter.segment(graphemeInput));

assertEquals(
    ['A', 'é', '中', '😀', 'e\u0301', '👨‍👩‍👧‍👦'],
    graphemes.map(({segment}) => segment));
assertEquals([0, 1, 3, 6, 10, 13], graphemes.map(({index}) => index));
assertComposes(graphemeInput, graphemes);

const expectedContaining = [
  ...Array(1).fill(0),
  ...Array(2).fill(1),
  ...Array(3).fill(3),
  ...Array(4).fill(6),
  ...Array(3).fill(10),
  ...Array(25).fill(13),
];
const containingSegments = graphemeSegmenter.segment(graphemeInput);
for (let index = 0; index < graphemeInput.length; ++index) {
  const containing = containingSegments.containing(index);
  assertEquals(expectedContaining[index], containing.index);
  assertEquals(
      containing.segment,
      graphemeInput.slice(
          containing.index, containing.index + containing.segment.length));
}
assertEquals(undefined, containingSegments.containing(-1));
assertEquals(undefined, containingSegments.containing(graphemeInput.length));

const asciiControlInput = 'a\r\nb\0c';
const asciiControlSegments =
    Array.from(graphemeSegmenter.segment(asciiControlInput));
assertEquals(
    ['a', '\r\n', 'b', '\0', 'c'],
    asciiControlSegments.map(({segment}) => segment));
assertEquals([0, 1, 3, 4, 5], asciiControlSegments.map(({index}) => index));
assertContainingMatchesIteration(graphemeSegmenter, asciiControlInput);

const asciiFastPathInput = 'abcdefgh\r\nijéx\u0301';
const asciiFastPathSegments =
    Array.from(graphemeSegmenter.segment(asciiFastPathInput));
assertEquals(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', '\r\n', 'i', 'j', 'é', 'x\u0301'],
    asciiFastPathSegments.map(({segment}) => segment));
assertEquals(
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 14],
    asciiFastPathSegments.map(({index}) => index));
assertContainingMatchesIteration(graphemeSegmenter, asciiFastPathInput);

for (const granularity of ['word', 'sentence']) {
  const input = 'café 世界. Déjà vu!';
  const segments =
      Array.from(new Intl.Segmenter('en', {granularity}).segment(input));
  assertComposes(input, segments);
}

for (const input
         of ['A' + String.fromCodePoint(0xd800) + 'B',
             String.fromCharCode(0xe2, 0x28, 0xa1, 0xe2, 0x82),
]) {
  assertContainingMatchesIteration(graphemeSegmenter, input);
}

const lifetimeInput = 'Aé中😀'.repeat(32);
const retainedIterator =
    graphemeSegmenter.segment(lifetimeInput)[Symbol.iterator]();
gc();
assertComposes(lifetimeInput, Array.from(retainedIterator));

let randomState = 0x1badf00d;
function nextByte() {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState & 0xff;
}
for (let sample = 0; sample < 512; ++sample) {
  const bytes = [];
  const length = 1 + (nextByte() & 31);
  for (let index = 0; index < length; ++index) bytes.push(nextByte());
  assertContainingMatchesIteration(
      graphemeSegmenter, String.fromCharCode(...bytes));
}
