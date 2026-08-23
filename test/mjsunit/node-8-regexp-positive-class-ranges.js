// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

function checkMatch(regexp, codePoint) {
  const value = String.fromCodePoint(codePoint);
  const match = regexp.exec(value);
  assertNotNull(match, `${regexp} should match U+${codePoint.toString(16)}`);
  assertEquals(0, match.index);
  assertEquals(byteValues(value), byteValues(match[0]));
  assertSame(value, value.slice(match.index, match.index + match[0].length));
}

function checkNoMatch(regexp, codePoint) {
  assertNull(
      regexp.exec(String.fromCodePoint(codePoint)),
      `${regexp} should not match U+${codePoint.toString(16)}`);
}

function checkRange(regexp, matches, misses) {
  const source = regexp.source;
  for (const codePoint of matches) checkMatch(regexp, codePoint);
  for (const codePoint of misses) checkNoMatch(regexp, codePoint);
  assertSame(source, regexp.source);
}

checkRange(/[é-ë]/, [0xe9, 0xea, 0xeb], [0xe8, 0xec]);
checkRange(/[é-ë]/u, [0xe9, 0xea, 0xeb], [0xe8, 0xec]);
checkRange(/[一-三]/u, [0x4e00, 0x4e01, 0x4e09],
           [0x4dff, 0x4e0a, 0x4e8c]);

for (const [from, to, matches, misses] of [
       [0x7e, 0x81, [0x7e, 0x7f, 0x80, 0x81], [0x7d, 0x82]],
       [0x7fe, 0x801, [0x7fe, 0x7ff, 0x800, 0x801], [0x7fd, 0x802]],
       [0xd7ff, 0xe000, [0xd7ff, 0xd800, 0xdfff, 0xe000],
        [0xd7fe, 0xe001]],
       [0xfffe, 0x10001, [0xfffe, 0xffff, 0x10000, 0x10001],
        [0xfffd, 0x10002]],
       [0x1f600, 0x1f601, [0x1f600, 0x1f601], [0x1f5ff, 0x1f602]],
     ]) {
  const regexp = new RegExp(
      '[' + String.fromCodePoint(from) + '-' + String.fromCodePoint(to) + ']',
      'u');
  checkRange(regexp, matches, misses);
}

checkRange(/[A-Cé-ë一-三😀-😁]/u,
           [0x41, 0x43, 0xea, 0x4e01, 0x1f600, 0x1f601],
           [0x44, 0xe8, 0x4e8c, 0x1f602]);
checkRange(/\s/, [0x20, 0xa0, 0x3000], [0x41, 0x200b]);
checkRange(/\s/u, [0x20, 0xa0, 0x3000], [0x41, 0x200b]);

const raw = (...bytes) => String.fromCharCode(...bytes);
assertFalse(/[é-ë]/u.test(raw(0x80)));
assertFalse(/[é-ë]/u.test(raw(0xc0, 0xa9)));
assertFalse(/[é-ë]/u.test(raw(0xc3, 0x28)));
assertFalse(/[\u0080-\u0081]/u.test(raw(0x80)));

const eAcute = String.fromCodePoint(0xe9);
const eDiaeresis = String.fromCodePoint(0xeb);
const globalMatches = Array.from(
    (eAcute + 'x' + eDiaeresis).matchAll(/[é-ë]/gu));
assertEquals([0, 3], globalMatches.map(match => match.index));
assertEquals([eAcute, eDiaeresis], globalMatches.map(match => match[0]));

for (let i = 0; i < 2; ++i) {
  checkMatch(new RegExp('[一-三]', 'u'), 0x4e01);
}
