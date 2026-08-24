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
const replacement = String.fromCodePoint(0xfffd);
const raw = (...bytes) => String.fromCharCode(...bytes);

check(/[^é]/u, eAcute + cjk, 2, cjk);
assertNull(/[^é]/u.exec(eAcute));
check(/[^é]/, eAcute + cjk, 2, cjk);
check(/[^\x00-\x7f]/u, eAcute, 0, eAcute);
check(/[^😀]/u, emoji + cjk, 4, cjk);
assertNull(/[^😀]/u.exec(emoji));

check(/[\uFFFD]/u, replacement, 0, replacement);
check(/[\uFFFD]/u, raw(0x80), 0, raw(0x80));
check(/[\uFFFD]/u, raw(0xe2, 0x82), 0, raw(0xe2, 0x82));
check(/[\uFFFD]/, raw(0x80), 0, raw(0x80));

const malformed = raw(0xe2, 0x28, 0xa1);
const malformedMatches = Array.from(malformed.matchAll(/[\uFFFD]/gu));
assertEquals([0, 2], malformedMatches.map(match => match.index));
assertEquals([[0xe2], [0xa1]],
             malformedMatches.map(match => byteValues(match[0])));
check(/[^�]/u, raw(0xe2, 0x28), 1, '(');

const globalSubject = eAcute + cjk;
const globalMatches = Array.from(globalSubject.matchAll(/[^\x00-\x7f]/gu));
assertEquals([0, 2], globalMatches.map(match => match.index));
assertEquals([eAcute, cjk], globalMatches.map(match => match[0]));

assertEquals('XX', globalSubject.replace(/[^\x00-\x7f]/gu, 'X'));
assertEquals(2, globalSubject.search(/[^é]/u));
assertEquals(['a', 'b'], ('a' + eAcute + 'b').split(/[^\x00-\x7f]/u));

const replaceIndices = [];
assertEquals('X(X', malformed.replace(/[\uFFFD]/gu, (match, index) => {
  replaceIndices.push(index);
  return 'X';
}));
assertEquals([0, 2], replaceIndices);

const stickyReplacement = /[\uFFFD]/uy;
stickyReplacement.lastIndex = 1;
check(stickyReplacement, eAcute, 1, raw(0xa9));

const stickyNegated = /[^a]/y;
stickyNegated.lastIndex = 1;
check(stickyNegated, eAcute, 1, raw(0xa9));

for (let i = 0; i < 2; ++i) {
  check(new RegExp('[^é]', 'u'), eAcute + cjk, 2, cjk);
  check(new RegExp('[\\uFFFD]', 'u'), raw(0x80), 0, raw(0x80));
}

function checkCaptures(regexp, subject, expectedIndex, expected, captures) {
  const match = regexp.exec(subject);
  assertNotNull(match);
  assertEquals(expectedIndex, match.index);
  assertEquals(byteValues(expected), byteValues(match[0]));
  assertEquals(captures.map(byteValues), match.slice(1).map(byteValues));
}

checkCaptures(/([^é])/u, eAcute + cjk, 2, cjk, [cjk]);
checkCaptures(/(([é-ë]))/u, cjk + eAcute, 3, eAcute, [eAcute, eAcute]);
const namedCapture = /(?<value>[\uFFFD])/u.exec(raw(0x80));
assertEquals(byteValues(raw(0x80)), byteValues(namedCapture.groups.value));
const unicodeNamedCapture = /(?<名字>[^a])/u.exec(cjk);
assertSame(cjk, unicodeNamedCapture.groups.名字);
assertEquals(['名字'], Object.keys(unicodeNamedCapture.groups));
const fallbackUnicodeNamedCapture = /(?<名字>[a])b/u.exec('ab');
assertSame('a', fallbackUnicodeNamedCapture.groups.名字);

const indexedCaptures = /(([^é]))/du.exec(eAcute + cjk);
assertEquals([[2, 5], [2, 5], [2, 5]], indexedCaptures.indices);
assertEquals(indexedCaptures.indices[1], indexedCaptures.indices[2]);

const captureMatches = Array.from(
    (eAcute + cjk).matchAll(/([^\x00-\x7f])/gu));
assertEquals([0, 2], captureMatches.map(match => match.index));
assertEquals([eAcute, cjk], captureMatches.map(match => match[1]));

const nestedGlobalMatches = Array.from(
    (eAcute + cjk).matchAll(/(([^\x00-\x7f]))/gu));
assertEquals([0, 2], nestedGlobalMatches.map(match => match.index));
assertEquals([eAcute, cjk], nestedGlobalMatches.map(match => match[1]));
assertEquals([eAcute, cjk], nestedGlobalMatches.map(match => match[2]));

const captureReplaceIndices = [];
assertEquals('X(X', malformed.replace(/([\uFFFD])/gu,
    (match, capture, index) => {
      assertEquals(byteValues(match), byteValues(capture));
      captureReplaceIndices.push(index);
      return 'X';
    }));
assertEquals([0, 2], captureReplaceIndices);

const plusSubject = eAcute + cjk + cjk + 'a' + eAcute + emoji + emoji + 'b';
const plusMatches = Array.from(plusSubject.matchAll(/[^é]+/gu));
assertEquals([2, 11], plusMatches.map(match => match.index));
assertEquals([cjk + cjk + 'a', emoji + emoji + 'b'],
             plusMatches.map(match => match[0]));

check(/[é]+/u, eAcute + eAcute + cjk, 0, eAcute + eAcute);
check(/[\uFFFD]+/u, raw(0x80, 0x81, 0x61), 0, raw(0x80, 0x81));

const stickyPlus = /[^é]+/uy;
stickyPlus.lastIndex = 2;
check(stickyPlus, eAcute + cjk + cjk, 2, cjk + cjk);
stickyPlus.lastIndex = 0;
assertNull(stickyPlus.exec(eAcute + cjk));
