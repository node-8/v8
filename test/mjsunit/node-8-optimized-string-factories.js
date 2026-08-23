// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --allow-natives-syntax
// Flags: --expose-externalize-string --expose-gc

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

function fromCharCode(value) {
  return String.fromCharCode(value);
}

function fromCodePoint(value) {
  return String.fromCodePoint(value);
}

function fromCharCodeMaglev(value) {
  return String.fromCharCode(value);
}

function fromCodePointMaglev(value) {
  return String.fromCodePoint(value);
}

const retainedStrings = [];

%PrepareFunctionForOptimization(fromCharCode);
%PrepareFunctionForOptimization(fromCodePoint);
fromCharCode(0x41);
fromCodePoint(0x41);
%OptimizeFunctionOnNextCall(fromCharCode);
%OptimizeFunctionOnNextCall(fromCodePoint);

assertEquals([0x2D], byteValues(fromCharCode(0x4E2D)));
assertEquals([0xFF], byteValues(fromCharCode(-1)));
assertEquals([0x00], byteValues(fromCharCode(0x100)));
assertOptimized(fromCharCode);
retainedStrings.push(fromCharCode(0x4E2D));

const codePointCases = [
  [0x7F, [0x7F]],
  [0x80, [0xC2, 0x80]],
  [0x7FF, [0xDF, 0xBF]],
  [0x800, [0xE0, 0xA0, 0x80]],
  [0xD800, [0xED, 0xA0, 0x80]],
  [0xFFFF, [0xEF, 0xBF, 0xBF]],
  [0x10000, [0xF0, 0x90, 0x80, 0x80]],
  [0x1F600, [0xF0, 0x9F, 0x98, 0x80]],
  [0x10FFFF, [0xF4, 0x8F, 0xBF, 0xBF]],
];

for (const [codePoint, expected] of codePointCases) {
  const result = fromCodePoint(codePoint);
  assertEquals(expected, byteValues(result));
  assertTrue(isOneByteString(result));
  retainedStrings.push(result);
}
assertOptimized(fromCodePoint);

%PrepareFunctionForOptimization(fromCharCodeMaglev);
%PrepareFunctionForOptimization(fromCodePointMaglev);
fromCharCodeMaglev(0x41);
fromCodePointMaglev(0x41);
%OptimizeMaglevOnNextCall(fromCharCodeMaglev);
%OptimizeMaglevOnNextCall(fromCodePointMaglev);

assertEquals([0x2D], byteValues(fromCharCodeMaglev(0x4E2D)));
assertEquals([0xFF], byteValues(fromCharCodeMaglev(-1)));
assertEquals([0x00], byteValues(fromCharCodeMaglev(0x100)));
assertOptimized(fromCharCodeMaglev);
retainedStrings.push(fromCharCodeMaglev(0x4E2D));

for (const [codePoint, expected] of codePointCases) {
  const result = fromCodePointMaglev(codePoint);
  assertEquals(expected, byteValues(result));
  assertTrue(isOneByteString(result));
  retainedStrings.push(result);
}
assertOptimized(fromCodePointMaglev);

gc();
gc();
for (const string of retainedStrings) {
  assertTrue(isOneByteString(string));
}
