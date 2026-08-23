// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function bytes(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

assertEquals([0x65, 0xcc, 0x81], bytes('\u00e9'.normalize('NFD')));
assertEquals([0xc3, 0xa9], bytes('e\u0301'.normalize('NFC')));
assertEquals([0x41, 0xcc, 0x8a], bytes('\u212b'.normalize('NFKD')));
assertEquals([0xf0, 0x9f, 0x98, 0x80], bytes('\u{1f600}'.normalize()));

const surrogate = String.fromCodePoint(0xd800);
assertEquals([0xef, 0xbf, 0xbd], bytes(surrogate.normalize()));

const malformed = String.fromCharCode(0xe2, 0x28, 0xa1, 0xe2, 0x82);
assertEquals([
  0xef, 0xbf, 0xbd,
  0x28,
  0xef, 0xbf, 0xbd,
  0xef, 0xbf, 0xbd,
], bytes(malformed.normalize()));

const malformedCases = [
  [0x80],
  [0xc0, 0x80],
  [0xe0, 0x80, 0x80],
  [0xe2, 0x28, 0xa1],
  [0xe2, 0x82],
  [0xed, 0xa0, 0x80],
  [0xf4, 0x90, 0x80, 0x80],
  [0x65, 0xcc, 0x81, 0x80, 0xcc, 0x81],
];
for (const inputBytes of malformedCases) {
  const input = String.fromCharCode(...inputBytes);
  for (const form of ['NFC', 'NFD', 'NFKC', 'NFKD']) {
    assertEquals(
        bytes(input.toWellFormed().normalize(form)),
        bytes(input.normalize(form)));
  }
}

assertThrows(() => 'text'.normalize('invalid'), RangeError);
