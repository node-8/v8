// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

function codeUnits(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

assertEquals([0xe9], codeUnits('\u00e9'));
assertEquals([0xd83d, 0xde00], codeUnits('\u{1f600}'));

assertEquals([0x4e2d], codeUnits(String.fromCharCode(0x4e2d)));
assertEquals(
    [0xffff, 0x100, 0x1ff, 0x1234],
    codeUnits(String.fromCharCode(-1, 0x100, 0x1ff, 0x1234)));
assertEquals(
    [0xe9, 0x4e2d, 0xd83d, 0xde00],
    codeUnits(String.fromCodePoint(0xe9, 0x4e2d, 0x1f600)));

assertEquals(
    String.fromCodePoint(0x1f600),
    String.fromCodePoint(0xd83d) + String.fromCodePoint(0xde00));
assertTrue('\u{10000}' < '\ue000');
assertFalse('\ue000' < '\u{10000}');
