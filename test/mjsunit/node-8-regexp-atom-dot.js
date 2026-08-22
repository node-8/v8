// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --allow-natives-syntax --utf8-string-semantics

function units(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

function matches(regexp, subject) {
  return Array.from(subject.matchAll(regexp), match => ({
    index: match.index,
    length: match[0].length,
    units: units(match[0]),
  }));
}

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const emoji = String.fromCodePoint(0x1f600);
const surrogate = String.fromCodePoint(0xd83d);

{
  const subject = eAcute + cjk + emoji;
  const cjkMatch = /中/.exec(subject);
  assertNotNull(cjkMatch);
  assertEquals(2, cjkMatch.index);
  assertEquals(3, cjkMatch[0].length);
  assertSame(cjkMatch[0], subject.slice(
      cjkMatch.index, cjkMatch.index + cjkMatch[0].length));

  assertEquals(2, new RegExp('\\u4e2d').exec(subject).index);
  assertEquals(0, new RegExp('\\xE9').exec(eAcute).index);
  assertEquals(5, /😀/.exec(subject).index);
  assertEquals(0, new RegExp(surrogate).exec(surrogate).index);

  const raw = String.fromCharCode(0xff);
  const rawMatch = new RegExp(raw).exec('a' + raw);
  assertNotNull(rawMatch);
  assertEquals(1, rawMatch.index);
  assertEquals([0xff], units(rawMatch[0]));
}

assertEquals([{index: 0, length: 1, units: [0x61]}], matches(/./g, 'a'));
assertEquals(
    [{index: 0, length: 2, units: [0xc3, 0xa9]}], matches(/./g, eAcute));
assertEquals(
    [{index: 0, length: 3, units: [0xe4, 0xb8, 0xad]}],
    matches(/./g, cjk));
assertEquals(
    [{index: 0, length: 4, units: [0xf0, 0x9f, 0x98, 0x80]}],
    matches(/./g, emoji));
assertEquals(
    [{index: 0, length: 3, units: [0xed, 0xa0, 0xbd]}],
    matches(/./g, surrogate));

{
  const malformed = String.fromCharCode(0xe2, 0x28, 0xa1);
  assertEquals([
    {index: 0, length: 1, units: [0xe2]},
    {index: 1, length: 1, units: [0x28]},
    {index: 2, length: 1, units: [0xa1]},
  ], matches(/./g, malformed));

  const truncated = String.fromCharCode(0xe2, 0x82);
  assertEquals(
      [{index: 0, length: 2, units: [0xe2, 0x82]}],
      matches(/./g, truncated));

  const exactContinuation = /./gy;
  exactContinuation.lastIndex = 1;
  const continuationMatch = exactContinuation.exec(eAcute);
  assertNotNull(continuationMatch);
  assertEquals(1, continuationMatch.index);
  assertEquals([0xa9], units(continuationMatch[0]));
  assertEquals(2, exactContinuation.lastIndex);
}

{
  const subject = 'a\n\r\u2028\u2029b';
  assertEquals([
    {index: 0, length: 1, units: [0x61]},
    {index: 9, length: 1, units: [0x62]},
  ], matches(/./g, subject));
  assertEquals([
    {index: 0, length: 1, units: [0x61]},
    {index: 1, length: 1, units: [0x0a]},
    {index: 2, length: 1, units: [0x0d]},
    {index: 3, length: 3, units: [0xe2, 0x80, 0xa8]},
    {index: 6, length: 3, units: [0xe2, 0x80, 0xa9]},
    {index: 9, length: 1, units: [0x62]},
  ], matches(/./gs, subject));

  const sticky = /./y;
  sticky.lastIndex = 1;
  assertNull(sticky.exec(subject));
  assertEquals(0, sticky.lastIndex);
  const stickyAll = /./sy;
  stickyAll.lastIndex = 3;
  const lineMatch = stickyAll.exec(subject);
  assertNotNull(lineMatch);
  assertEquals(3, lineMatch.index);
  assertEquals(3, lineMatch[0].length);
  assertEquals(6, stickyAll.lastIndex);
}

{
  const repeated = (eAcute + emoji).repeat(64);
  const repeatedMatches = matches(/./g, repeated);
  assertEquals(128, repeatedMatches.length);
  assertEquals(0, repeatedMatches[0].index);
  assertEquals(2, repeatedMatches[1].index);
  assertEquals(repeated.length - 4, repeatedMatches[127].index);

  const sliced = ('x' + emoji + 'y').slice(1, 5);
  assertEquals(
      [{index: 0, length: 4, units: [0xf0, 0x9f, 0x98, 0x80]}],
      matches(/./g, sliced));
}

%SetForceSlowPath(true);
assertEquals(
    [{index: 0, length: 4, units: [0xf0, 0x9f, 0x98, 0x80]}],
    matches(/./g, emoji));
assertEquals(2, /中/.exec(eAcute + cjk).index);
%SetForceSlowPath(false);
