// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);

const ordinary = Array.from((eAcute + cjk + emoji).matchAll(/([^\n]+?)/gu));
assertEquals([0, 2, 5], ordinary.map(match => match.index));
assertEquals([bytes(eAcute), bytes(cjk), bytes(emoji)],
             ordinary.map(match => bytes(match[0])));
assertEquals(ordinary.map(match => bytes(match[0])),
             ordinary.map(match => bytes(match[1])));

const named = Array.from(
    (eAcute + cjk + emoji).matchAll(/(?<part>[^\n]+?)/dgu));
for (const match of named) {
  assertEquals(bytes(match[0]), bytes(match.groups.part));
  assertEquals(match.indices[0], match.indices[1]);
  assertEquals(match.indices[0], match.indices.groups.part);
}

const nested = /(([^\n]{2,5}?))/du.exec(cjk + emoji + 'a');
assertNotNull(nested);
assertEquals(bytes(cjk + emoji), bytes(nested[0]));
assertEquals(bytes(nested[0]), bytes(nested[1]));
assertEquals(bytes(nested[0]), bytes(nested[2]));
assertEquals([0, 7], nested.indices[0]);
assertEquals(nested.indices[0], nested.indices[1]);
assertEquals(nested.indices[0], nested.indices[2]);

const continuation = /([^\n]+?)/duy;
continuation.lastIndex = 1;
const continuationMatch = continuation.exec(eAcute + 'a');
assertNotNull(continuationMatch);
assertEquals([0xa9], bytes(continuationMatch[0]));
assertEquals([0xa9], bytes(continuationMatch[1]));
assertEquals([1, 2], continuationMatch.indices[0]);
assertEquals([1, 2], continuationMatch.indices[1]);
assertEquals(2, continuation.lastIndex);

const truncated = /(?<part>[^\n]+?)/du.exec(raw(0xe2, 0x82, 0x62));
assertNotNull(truncated);
assertEquals([0xe2, 0x82], bytes(truncated[0]));
assertEquals(bytes(truncated[0]), bytes(truncated.groups.part));
assertEquals([0, 2], truncated.indices[0]);
assertEquals([0, 2], truncated.indices.groups.part);

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
    if (position >= input.length || input[position] === 0x0a) return null;
    position += scalarWidth(input, position);
  }
  return input.slice(start, position);
}

const capturedPatterns = [
  {min: 0, regexp: /([^\n]{0,3}?)/duy, captures: [1]},
  {min: 0, regexp: /([^\n]??)/duy, captures: [1]},
  {min: 1, regexp: /([^\n]+?)/duy, captures: [1]},
  {min: 1, regexp: /(?<part>[^\n]{1,}?)/duy, captures: [1], name: 'part'},
  {min: 2, regexp: /(([^\n]{2,5}?))/duy, captures: [1, 2]},
  {min: 2, regexp: /([^\n]{2}?)/duy, captures: [1]},
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

let randomState = 0x6d2b79f5;
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
    for (const {min, regexp, captures, name} of capturedPatterns) {
      const expected = expectedLazy(input, start, min);
      regexp.lastIndex = start;
      const match = regexp.exec(subject);
      if (expected === null) {
        assertNull(match);
        assertEquals(0, regexp.lastIndex);
        continue;
      }

      assertNotNull(match);
      assertEquals(start, match.index);
      assertEquals(expected, bytes(match[0]));
      assertEquals([start, start + expected.length], match.indices[0]);
      assertEquals(start + expected.length, regexp.lastIndex);
      for (const capture of captures) {
        assertEquals(expected, bytes(match[capture]));
        assertEquals(match.indices[0], match.indices[capture]);
      }
      if (name !== undefined) {
        assertEquals(expected, bytes(match.groups[name]));
        assertEquals(match.indices[0], match.indices.groups[name]);
      }
      assertEquals(expected,
                   bytes(subject.slice(match.index,
                                       match.index + match[0].length)));
    }
  }
}
