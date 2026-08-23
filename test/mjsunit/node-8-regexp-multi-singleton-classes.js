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

check(/[é中]/, 'x中y', 1, cjk);
check(/[é中]/u, 'xéy', 1, eAcute);
check(/[xé]/u, 'aéb', 1, eAcute);
check(/[é中😀]/u, 'x😀y', 1, emoji);
check(/[\xE9\u4E2D]/u, 'x中y', 1, cjk);

for (const flags of ['', 'u']) {
  const regexp = new RegExp('[' + eAcute + cjk + ']', flags);
  check(regexp, 'z' + eAcute + 'z', 1, eAcute);
  check(regexp, 'z' + cjk + 'z', 1, cjk);
}

const globalSubject = eAcute + 'x' + cjk;
const globalMatches = Array.from(globalSubject.matchAll(/[é中]/gu));
assertEquals([0, 3], globalMatches.map(match => match.index));
assertEquals([eAcute, cjk], globalMatches.map(match => match[0]));

for (let i = 0; i < 2; ++i) {
  check(new RegExp('[é中]', 'u'), 'x中y', 1, cjk);
}
