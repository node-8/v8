// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...bytes) => String.fromCharCode(...bytes);
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

check(/[^a]{2,5}/, 'aaBCDEFaa', 2, 'BCDEF');
assertNull(/[^a]{2,5}/.exec('aaaaB'));
check(/[^a]{2,5}/u, cjk + emoji + 'a', 0, cjk + emoji);
check(/[^a]{2,5}/u, loneLeadSurrogate + cjk + 'a', 0,
      loneLeadSurrogate + cjk);

// A truncated valid prefix is one malformed maximal-subpart. Invalid leads
// and continuation-byte starts each consume one byte.
check(/[^\n]{2,5}/u, raw(0xe2, 0x82, 0x62, 0x0a), 0,
      raw(0xe2, 0x82, 0x62));
check(/[^\n]{2,5}/u, raw(0x80, 0xff, 0x0a), 0, raw(0x80, 0xff));
check(/[^\n]{2,5}/u, raw(0xe0, 0x80, 0x62, 0x0a), 0,
      raw(0xe0, 0x80, 0x62));
check(/[^\n]{2,5}/u, raw(0xf0, 0x80, 0x62, 0x0a), 0,
      raw(0xf0, 0x80, 0x62));

// The greedy quantifier must give back a complete scalar, not one byte, for
// the following atom.
check(/[^\n]{2,5}a/u, cjk + emoji + 'b' + 'a', 0,
      cjk + emoji + 'b' + 'a');
check(/[^\n]{2,5}a/u, raw(0xe2, 0x82, 0x62, 0x61), 0,
      raw(0xe2, 0x82, 0x62, 0x61));

const sticky = /[^a]{1,2}/uy;
sticky.lastIndex = 1;
check(sticky, eAcute + 'a', 1, raw(0xa9));
assertEquals(2, sticky.lastIndex);

const zeroMinMatches = Array.from((cjk + 'a').matchAll(/[^a]{0,3}/gu));
assertEquals([0, 3, 4], zeroMinMatches.map(match => match.index));
assertEquals([bytes(cjk), [], []],
             zeroMinMatches.map(match => bytes(match[0])));

const malformedGlobal = Array.from(
    raw(0xe2, 0x82, 0x62, 0x0a, 0x80, 0xff, 0x0a)
        .matchAll(/[^\n]{2,5}/gu));
assertEquals([0, 4], malformedGlobal.map(match => match.index));
assertEquals([[0xe2, 0x82, 0x62], [0x80, 0xff]],
             malformedGlobal.map(match => bytes(match[0])));

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

function expectedSticky(input, start, min, max) {
  let position = start;
  let count = 0;
  while (position < input.length && count < max) {
    if (input[position] === 0x0a) break;
    position += scalarWidth(input, position);
    count++;
  }
  return count >= min ? input.slice(start, position) : null;
}

const stickyBounds = [[0, 3], [1, 2], [2, 5]].map(([min, max]) => ({
  min,
  max,
  regexp: new RegExp(`[^\\n]{${min},${max}}`, 'uy'),
}));
let randomState = 0x8badf00d;
for (let sample = 0; sample < 400; ++sample) {
  const length = 1 + (sample % 23);
  const input = [];
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  const subject = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    for (const {min, max, regexp} of stickyBounds) {
      const expected = expectedSticky(input, start, min, max);
      regexp.lastIndex = start;
      const match = regexp.exec(subject);
      if (expected === null) {
        assertNull(match);
      } else {
        assertNotNull(match);
        assertEquals(start, match.index);
        assertEquals(expected, bytes(match[0]));
      }
    }
  }
}
