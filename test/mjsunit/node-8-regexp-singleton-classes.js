// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

function check(regexp, subject, expectedIndex, expected) {
  const source = regexp.source;
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expectedIndex, match.index);
  assertEquals(byteValues(expected), byteValues(match[0]));
  assertSame(
      match[0], subject.slice(match.index, match.index + match[0].length));
  assertSame(source, regexp.source);
}

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const surrogate = String.fromCodePoint(0xd800);

check(/[é]/, 'xéy', 1, eAcute);
check(/[中]/, 'x中y', 1, cjk);
check(/[😀]/u, 'x😀y', 1, emoji);
check(/[\uD800]/u, 'x' + surrogate + 'y', 1, surrogate);

for (const [value, flags] of
         [[eAcute, ''], [eAcute, 'u'], [cjk, ''], [cjk, 'u'],
          [emoji, 'u'], [surrogate, ''], [surrogate, 'u']]) {
  const pattern = '[' + value + ']';
  check(new RegExp(pattern, flags), 'z' + value + 'z', 1, value);
}

for (const codePoint of
         [0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdfff, 0xe000,
          0xffff, 0x10000, 0x1f600, 0x10ffff]) {
  const value = String.fromCodePoint(codePoint);
  check(new RegExp('[' + value + ']', 'u'), 'x' + value + 'y', 1, value);
}

const globalSubject = eAcute + 'x' + eAcute;
const globalMatches = Array.from(globalSubject.matchAll(/[é]/gu));
assertEquals([0, 3], globalMatches.map(match => match.index));
assertEquals([eAcute, eAcute], globalMatches.map(match => match[0]));
