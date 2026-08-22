// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

assertEquals(
    [0xc3, 0x89, 0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80],
    byteValues('É中😀'));
assertEquals([0xe9], byteValues('\xE9'));
assertEquals([0xc3, 0xa9], byteValues('\u00E9'));
assertEquals([0xf0, 0x9f, 0x98, 0x80], byteValues('\u{1F600}'));
assertEquals([0xf0, 0x9f, 0x98, 0x80], byteValues('\uD83D\uDE00'));
assertEquals([0xed, 0xa0, 0xbd], byteValues('\uD83D'));
assertEquals(
    [0xed, 0xa0, 0xbd, 0x41, 0xed, 0xb8, 0x80],
    byteValues('\uD83D\x41\uDE00'));

assertEquals([0xc3, 0xa9], byteValues(`\u00E9`));
assertEquals(
    [0x5c, 0x75, 0x30, 0x30, 0x45, 0x39],
    byteValues(String.raw`\u00E9`));

assertNotEquals('\xE9', '\u00E9');
assertSame('é', 'é');

// Temporary compatibility boundary: the legacy RegExp parser decodes a
// non-ASCII byte pattern once without creating a UTF-16 heap String.
assertDoesNotThrow(() => new RegExp('\u00E9'));
assertDoesNotThrow(() => new RegExp('[ªµºÀ-ÖØ-öø-ÿ]'));
assertDoesNotThrow(
    () => new RegExp('[\xAA\xB5\xBA\xC0-\xD6\u02C1]'));

const subject = 'é中文Z';
const needle = '中文';
const index = subject.indexOf(needle);
assertEquals(2, index);
assertEquals(6, needle.length);
assertEquals(needle, subject.slice(index, index + needle.length));
