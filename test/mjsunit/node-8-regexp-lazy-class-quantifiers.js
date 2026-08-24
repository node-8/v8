// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

function check(regexp, subject, expectedIndex, expected) {
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expectedIndex, match.index);
  assertEquals(bytes(expected), bytes(match[0]));
  assertEquals(bytes(expected),
               bytes(subject.slice(match.index, match.index + match[0].length)));
}

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const loneLeadSurrogate = String.fromCharCode(0xd800);

const scalarMatches =
    Array.from((eAcute + cjk + emoji).matchAll(/[^\n]+?/gu));
assertEquals([0, 2, 5], scalarMatches.map(match => match.index));
assertEquals([bytes(eAcute), bytes(cjk), bytes(emoji)],
             scalarMatches.map(match => bytes(match[0])));

check(/[^\n]{2,5}?/u, cjk + emoji + 'b', 0, cjk + emoji);
check(/[^\n]{2}?/u, cjk + emoji + 'b', 0, cjk + emoji);
check(/[^\n]+?/u, loneLeadSurrogate, 0, loneLeadSurrogate);

// A truncated valid prefix is one malformed maximal-subpart. Invalid leads
// and continuation-byte starts each consume one byte.
check(/[^\n]+?/u, raw(0xe2, 0x82, 0x62), 0, raw(0xe2, 0x82));
check(/[^\n]+?/u, raw(0x80, 0xff), 0, raw(0x80));

const continuationStart = /[^\n]+?/uy;
continuationStart.lastIndex = 1;
check(continuationStart, eAcute + 'a', 1, raw(0xa9));
assertEquals(2, continuationStart.lastIndex);

const emptyMatches = Array.from(cjk.matchAll(/[^\n]*?/gu));
assertEquals([0, 1, 2, 3], emptyMatches.map(match => match.index));
assertEquals([[], [], [], []], emptyMatches.map(match => bytes(match[0])));

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

function expectedLazy(input, start, min) {
  let position = start;
  for (let count = 0; count < min; ++count) {
    if (position >= input.length || input[position] === 0x0a) {
      return null;
    }
    position += scalarWidth(input, position);
  }
  return input.slice(start, position);
}

const lazyPatterns = [
  {min: 0, regexp: /[^\n]{0,3}?/uy},
  {min: 1, regexp: /[^\n]+?/uy},
  {min: 1, regexp: /[^\n]{1,}?/uy},
  {min: 2, regexp: /[^\n]{2,5}?/uy},
  {min: 2, regexp: /[^\n]{2}?/uy},
];

const corpora = [
  [0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0x61],
  [0xf0, 0x9f, 0x98, 0x80, 0xe4, 0xb8, 0xad, 0x61],
  [0xed, 0xa0, 0x80, 0x61],
  [0xe2, 0x82, 0x62, 0x61],
  [0x80, 0xff, 0x61],
  [0xe0, 0x80, 0x62, 0x61],
  [0xf0, 0x80, 0x62, 0x61],
  [0xe2, 0x82, 0x0a, 0x61],
];

let randomState = 0x1a2b3c4d;
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

for (const input of corpora) {
  const subject = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {min, regexp} of lazyPatterns) {
      const expected = expectedLazy(input, start, min);
      regexp.lastIndex = start;
      const match = regexp.exec(subject);
      if (expected === null) {
        assertNull(match);
        assertEquals(0, regexp.lastIndex);
      } else {
        assertNotNull(match);
        assertEquals(start, match.index);
        assertEquals(expected, bytes(match[0]));
        assertEquals(start + expected.length, regexp.lastIndex);
        assertEquals(expected,
                     bytes(subject.slice(match.index,
                                         match.index + match[0].length)));
      }
    }
  }
}
