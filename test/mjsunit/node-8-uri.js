// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function bytes(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

assertEquals('%C3%A9', encodeURIComponent('\u00e9'));
assertEquals('%E4%B8%AD%E6%96%87', encodeURIComponent('\u4e2d\u6587'));
assertEquals('%F0%9F%98%80', encodeURIComponent('\ud83d\ude00'));
assertEquals('a%20b%2Fc', encodeURIComponent('a b/c'));
assertEquals('a%20b/c?x=%E4%B8%AD', encodeURI('a b/c?x=\u4e2d'));

for (const value of ['ASCII', '\u00e9', '\u4e2d\u6587', '\ud83d\ude00']) {
  assertEquals(value, decodeURI(value));
  assertEquals(value, decodeURIComponent(value));
  assertEquals(value, decodeURI(encodeURI(value)));
  assertEquals(value, decodeURIComponent(encodeURIComponent(value)));
}

assertEquals([0xc3, 0xa9], bytes(decodeURIComponent('%C3%A9')));
assertEquals([0xe4, 0xb8, 0xad], bytes(decodeURIComponent('%E4%B8%AD')));
assertEquals(
    [0xf0, 0x9f, 0x98, 0x80], bytes(decodeURIComponent('%F0%9F%98%80')));
assertEquals('%2f', decodeURI('%2f'));
assertEquals('/', decodeURIComponent('%2f'));

const surrogate = String.fromCodePoint(0xd800);
assertEquals([0xed, 0xa0, 0x80], bytes(decodeURI(surrogate)));
assertEquals([0xed, 0xa0, 0x80], bytes(decodeURIComponent(surrogate)));

for (const malformed of [
       '%',
       '%xz',
       '%80',
       '%E2%82',
       '%E2%28%A1',
       '%ED%A0%80',
       '%F4%90%80%80',
     ]) {
  assertThrows(() => decodeURIComponent(malformed), URIError);
}

for (const malformedBytes of [
       [0x80],
       [0xe2, 0x82],
       [0xed, 0xa0, 0x80],
     ]) {
  assertThrows(
      () => encodeURIComponent(String.fromCharCode(...malformedBytes)),
      URIError);
}

assertEquals('%C3%A9', escape('\u00e9'));
assertEquals('%E4%B8%AD', escape('\u4e2d'));
assertEquals('%F0%9F%98%80', escape('\ud83d\ude00'));
assertEquals([0xe4, 0xb8, 0xad], bytes(unescape('%u4E2D')));
assertEquals([0xed, 0xa0, 0x80], bytes(unescape('%uD800')));
assertEquals(
    [0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80],
    bytes(unescape('%uD83D%uDE00')));
for (const value of ['ASCII', '\u00e9', '\u4e2d\u6587', '\ud83d\ude00']) {
  assertEquals(value, unescape(escape(value)));
}
