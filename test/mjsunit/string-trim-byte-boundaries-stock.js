// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --no-utf8-string-semantics

const spaces = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000, 0xfeff,
].map(cp => String.fromCodePoint(cp));
const payloads = ['A', 'é', '中😀\u0120', '\ud800', '\udfff'];
for (const space of spaces) {
  for (const payload of payloads) {
    const input = space + payload + space;
    assertEquals(payload, input.trim());
    assertEquals(payload + space, input.trimStart());
    assertEquals(space + payload, input.trimEnd());
  }
}

// Stock 0xA0 is a complete Latin-1 NBSP, not a raw continuation byte.
assertEquals('', String.fromCharCode(0xa0).trim());
assertEquals('x', ('x' + String.fromCharCode(0xa0)).trimEnd());
for (const cp of [0, 0x85, 0x120, 0x180e, 0x200b, 0x2060, 0xd800, 0xdfff]) {
  const value = String.fromCharCode(cp);
  assertEquals(value, (' ' + value + '\t').trim());
}
assertSame(String.prototype.trimStart, String.prototype.trimLeft);
assertSame(String.prototype.trimEnd, String.prototype.trimRight);
