// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --allow-natives-syntax

const eAcute = String.fromCodePoint(0xe9);
assertEquals(0xe9, eAcute.codePointAt(0));
assertEquals(0xfffd, eAcute.codePointAt(1));
assertEquals(undefined, eAcute.codePointAt(2));
assertEquals(undefined, eAcute.codePointAt(-1));
assertEquals(0xe9, eAcute.codePointAt(NaN));

const emoji = String.fromCodePoint(0x1f600);
assertEquals(0x1f600, emoji.codePointAt(0));
assertEquals(0xfffd, emoji.codePointAt(1));
assertEquals(0xfffd, emoji.codePointAt(2));
assertEquals(0xfffd, emoji.codePointAt(3));

const surrogate = String.fromCodePoint(0xd83d);
assertEquals(0xd83d, surrogate.codePointAt(0));
assertEquals(0xfffd, surrogate.codePointAt(1));

const malformed = String.fromCharCode(0xe2, 0x28, 0xa1);
assertEquals(0xfffd, malformed.codePointAt(0));
assertEquals(0x28, malformed.codePointAt(1));
assertEquals(0xfffd, malformed.codePointAt(2));
assertEquals(0xfffd, String.fromCharCode(0xe2, 0x82).codePointAt(0));

const ropeOffset = 20;
const rope = 'x'.repeat(ropeOffset) + eAcute + 'tail';
assertEquals(0xe9, rope.codePointAt(ropeOffset));
assertEquals(0xfffd, rope.codePointAt(ropeOffset + 1));
const sliced = ('x' + eAcute + 'y').slice(1, 3);
assertEquals(0xe9, sliced.codePointAt(0));
assertEquals(0xfffd, sliced.codePointAt(1));
const truncatedSlice = emoji.slice(0, 3);
assertEquals(0xfffd, truncatedSlice.codePointAt(0));
const repeated = eAcute.repeat(512);
assertEquals(0xe9, repeated.codePointAt(0));
assertEquals(0xfffd, repeated.codePointAt(1));

const coercions = [];
const receiver = {
  toString() {
    coercions.push('receiver');
    return eAcute;
  }
};
const position = {
  valueOf() {
    coercions.push('position');
    return 0;
  }
};
assertEquals(
    0xe9, String.prototype.codePointAt.call(receiver, position));
assertEquals(['receiver', 'position'], coercions);

function readCodePoint(value, index) {
  return value.codePointAt(index);
}

%PrepareFunctionForOptimization(readCodePoint);
assertEquals(0xe9, readCodePoint(eAcute, 0));
assertEquals(0xfffd, readCodePoint(eAcute, 1));
%OptimizeFunctionOnNextCall(readCodePoint);
assertEquals(0xe9, readCodePoint(eAcute, 0));
assertEquals(0xfffd, readCodePoint(eAcute, 1));
assertEquals(0x1f600, readCodePoint(emoji, 0));
assertEquals(0xfffd, readCodePoint(emoji, 2));
assertEquals(0xd83d, readCodePoint(surrogate, 0));
assertEquals(0xfffd, readCodePoint(malformed, 0));
assertEquals(0x28, readCodePoint(malformed, 1));
assertEquals(0xe9, readCodePoint(sliced, 0));
assertEquals(0xfffd, readCodePoint(truncatedSlice, 0));
assertEquals(0xe9, readCodePoint(repeated, 0));
assertOptimized(readCodePoint);

function readCodePointMaglev(value, index) {
  return value.codePointAt(index);
}

%PrepareFunctionForOptimization(readCodePointMaglev);
assertEquals(0xe9, readCodePointMaglev(eAcute, 0));
assertEquals(0xfffd, readCodePointMaglev(eAcute, 1));
%OptimizeMaglevOnNextCall(readCodePointMaglev);
assertEquals(0xe9, readCodePointMaglev(eAcute, 0));
assertEquals(0xfffd, readCodePointMaglev(eAcute, 1));
