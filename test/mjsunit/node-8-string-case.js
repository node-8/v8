// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function bytes(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

assertEquals('ABC XYZ', 'abc xyz'.toUpperCase());
assertEquals('abc xyz', 'ABC XYZ'.toLowerCase());
assertEquals('\u00c9', '\u00e9'.toUpperCase());
assertEquals('\u00e9', '\u00c9'.toLowerCase());
assertEquals('STRASSE', 'stra\u00dfe'.toUpperCase());
assertEquals('i\u0307', '\u0130'.toLowerCase());
assertEquals('\u03bf\u03c2', '\u039f\u03a3'.toLowerCase());

assertEquals('\u0131i\u0069\u0131', 'I\u0130i\u0131'.toLocaleLowerCase('tr'));
assertEquals('\u0130I\u0130I', 'i\u0131\u0130I'.toLocaleUpperCase('tr'));

const surrogate = String.fromCodePoint(0xd800);
assertEquals([0xed, 0xa0, 0x80], bytes(surrogate.toLowerCase()));
assertEquals([0xed, 0xa0, 0x80], bytes(surrogate.toUpperCase()));

for (const malformedBytes of [
       [0x80],
       [0xe2, 0x28, 0xa1],
       [0xe2, 0x82],
       [0xf4, 0x90, 0x80, 0x80],
     ]) {
  const malformed = String.fromCharCode(...malformedBytes);
  assertEquals(
      bytes(malformed.normalize().toLowerCase()),
      bytes(malformed.toLowerCase()));
  assertEquals(
      bytes(malformed.normalize().toUpperCase()),
      bytes(malformed.toUpperCase()));
}
