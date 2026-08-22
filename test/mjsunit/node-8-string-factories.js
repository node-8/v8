// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

assertEquals([], byteValues(String.fromCharCode()));
assertEquals([0xe9], byteValues(String.fromCharCode(0xe9)));
assertEquals([0x2d], byteValues(String.fromCharCode(0x4e2d)));
assertEquals(
    [0xff, 0x00, 0xff, 0x34],
    byteValues(String.fromCharCode(-1, 0x100, 0x1ff, 0x1234)));

let coercions = [];
const byteA = {valueOf() { coercions.push('a'); return 0x141; }};
const byteB = {valueOf() { coercions.push('b'); return 0x242; }};
assertEquals([0x41, 0x42], byteValues(String.fromCharCode(byteA, byteB)));
assertEquals(['a', 'b'], coercions);

assertEquals([], byteValues(String.fromCodePoint()));
assertEquals(
    [0xc3, 0xa9, 0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80],
    byteValues(String.fromCodePoint(0xe9, 0x4e2d, 0x1f600)));
assertEquals([0xed, 0xa0, 0xbd], byteValues(String.fromCodePoint(0xd83d)));
assertEquals(
    [0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80],
    byteValues(String.fromCodePoint(0xd83d, 0xde00)));
assertEquals(
    String.fromCodePoint(0xd83d, 0xde00),
    String.fromCodePoint(0xd83d) + String.fromCodePoint(0xde00));

coercions = [];
const codePointA = {valueOf() { coercions.push('a'); return 0xe9; }};
const codePointB = {valueOf() { coercions.push('b'); return 0x4e2d; }};
assertEquals(
    [0xc3, 0xa9, 0xe4, 0xb8, 0xad],
    byteValues(String.fromCodePoint(codePointA, codePointB)));
assertEquals(['a', 'b'], coercions);

for (const invalid of [-1, 0x110000, 1.5, NaN, Infinity, -Infinity]) {
  assertThrows(() => String.fromCodePoint(invalid), RangeError);
}
assertThrows(() => String.fromCodePoint(Symbol()), TypeError);

coercions = [];
const invalid = {valueOf() { coercions.push('invalid'); return -1; }};
const skipped = {valueOf() { coercions.push('skipped'); return 0x41; }};
assertThrows(() => String.fromCodePoint(invalid, skipped), RangeError);
assertEquals(['invalid'], coercions);
