// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

function check(regexp, subject, expectedIndex, expected) {
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expectedIndex, match.index);
  assertEquals(byteValues(expected), byteValues(match[0]));
  assertSame(
      match[0], subject.slice(match.index, match.index + match[0].length));
}

const cases = [
  ['中😀', 'x中😀y', 1],
  ['😀中', 'x😀中y', 1],
  ['é😀中', 'xxé😀中y', 2],
  ['😀😀', 'x😀😀y', 1],
];

for (const [pattern, subject, index] of cases) {
  check(new RegExp(pattern), subject, index, pattern);
  check(new RegExp(pattern, 'u'), subject, index, pattern);
}

check(/中😀/, 'x中😀y', 1, '中😀');
check(/中😀/u, 'x中😀y', 1, '中😀');
check(/\u4e2d\uD83D\uDE00/u, 'x中😀y', 1, '中😀');
check(/\u4e2d\u{1f600}/u, 'x中😀y', 1, '中😀');

const atoms = [
  'a',
  String.fromCodePoint(0xe9),
  String.fromCodePoint(0x4e2d),
  String.fromCodePoint(0x1f600),
  String.fromCodePoint(0xd800),
  String.fromCharCode(0xff),
];
for (const first of atoms) {
  for (const second of atoms) {
    const pattern = first + second;
    check(new RegExp(pattern), 'z' + pattern + 'z', 1, pattern);
  }
}
for (const first of atoms.slice(0, 4)) {
  for (const second of atoms.slice(0, 4)) {
    const pattern = first + second;
    check(new RegExp(pattern, 'u'), 'z' + pattern + 'z', 1, pattern);
  }
}

const globalPattern = '中😀';
const globalSubject = globalPattern + 'x' + globalPattern;
const globalMatches = Array.from(globalSubject.matchAll(/中😀/gu));
assertEquals([0, 8], globalMatches.map(match => match.index));
assertEquals(
    [globalPattern, globalPattern], globalMatches.map(match => match[0]));

function cachedLiteral() {
  return /é😀中/u;
}
cachedLiteral();
cachedLiteral();
check(cachedLiteral(), 'xé😀中y', 1, 'é😀中');
