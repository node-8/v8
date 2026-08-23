// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function bytes(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

for (const value of ['', 'ascii', '\u00e9', '\u4e2d', '\u{1f600}']) {
  assertTrue(value.isWellFormed());
  assertEquals(value, value.toWellFormed());
}

const surrogate = String.fromCodePoint(0xd800);
assertFalse(surrogate.isWellFormed());
assertEquals([0xef, 0xbf, 0xbd], bytes(surrogate.toWellFormed()));

const rawLatin1 = '\xE9';
assertFalse(rawLatin1.isWellFormed());
assertEquals([0xef, 0xbf, 0xbd], bytes(rawLatin1.toWellFormed()));

const malformed = String.fromCharCode(0xe2, 0x28, 0xa1, 0xe2, 0x82);
assertFalse(malformed.isWellFormed());
const repaired = malformed.toWellFormed();
assertEquals([
  0xef, 0xbf, 0xbd,
  0x28,
  0xef, 0xbf, 0xbd,
  0xef, 0xbf, 0xbd,
], bytes(repaired));
assertTrue(repaired.isWellFormed());

const rope = ('prefix-' + malformed + '-suffix')
                 .slice(7, 7 + malformed.length);
assertEquals(bytes(repaired), bytes(rope.toWellFormed()));
