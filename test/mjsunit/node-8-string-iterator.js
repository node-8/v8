// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function units(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

function unitLists(values) {
  return values.map(units);
}

const text = 'aé中😀' + String.fromCodePoint(0xd83d);
const expected = [
  [0x61],
  [0xc3, 0xa9],
  [0xe4, 0xb8, 0xad],
  [0xf0, 0x9f, 0x98, 0x80],
  [0xed, 0xa0, 0xbd],
];

assertEquals(expected, unitLists([...text]));
assertEquals(expected, unitLists(Array.from(text)));

const fromForOf = [];
for (const value of text) fromForOf.push(units(value));
assertEquals(expected, fromForOf);

const malformed = String.fromCharCode(0xe2, 0x28, 0xa1, 0xe2, 0x82);
assertEquals([
  [0xef, 0xbf, 0xbd],
  [0x28],
  [0xef, 0xbf, 0xbd],
  [0xef, 0xbf, 0xbd],
], unitLists([...malformed]));

const rope = ('prefix-' + text + '-suffix').slice(7, 7 + text.length);
assertEquals(expected, unitLists([...rope]));
