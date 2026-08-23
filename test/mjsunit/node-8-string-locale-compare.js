// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function sign(value) {
  return Math.sign(value);
}

assertEquals(0, 'caf\u00e9'.localeCompare('cafe\u0301'));
assertEquals(0, new Intl.Collator().compare('\u00e9', 'e\u0301'));
assertEquals(-1, sign('a'.localeCompare('b')));
assertEquals(1, sign('b'.localeCompare('a')));

for (const malformedBytes of [
       [0x80],
       [0xe2, 0x28, 0xa1],
       [0xe2, 0x82],
       [0xf4, 0x90, 0x80, 0x80],
     ]) {
  const malformed = String.fromCharCode(...malformedBytes);
  const repaired = malformed.normalize();
  assertEquals(0, malformed.localeCompare(repaired));
  assertEquals(0, new Intl.Collator().compare(malformed, repaired));
}

const surrogate = String.fromCodePoint(0xd800);
assertEquals(-1, sign(surrogate.localeCompare('\ufffd')));
assertEquals(
    -sign(surrogate.localeCompare('\ufffd')),
    sign('\ufffd'.localeCompare(surrogate)));
