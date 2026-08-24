// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --allow-natives-syntax

const whitespaceCodePoints = [
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
  0xfeff,
];

const whitespace =
    whitespaceCodePoints.map(codePoint => String.fromCodePoint(codePoint));
for (const space of whitespace) {
  assertEquals(42, Number(`${space}42${space}`));
  assertEquals(0, Number(space));
  assertEquals(0.5, Number(`${space}.5${space}`));
  assertEquals(100, Number(`${space}1e2${space}`));
  assertEquals(5, Number(`${space}0b101${space}`));
  assertEquals(8, Number(`${space}0o10${space}`));
  assertEquals(16, Number(`${space}0x10${space}`));
  assertEquals(Infinity, Number(`${space}+Infinity${space}`));
  assertEquals(-Infinity, Number(`${space}-Infinity${space}`));
  assertEquals(42, parseInt(`${space}42`, 10));
  assertEquals(16, parseInt(`${space}0x10`));
  assertEquals(42.5, parseFloat(`${space}42.5junk`));
  assertEquals(42n, BigInt(`${space}42${space}`));
  assertEquals(0n, BigInt(space));
  assertTrue(42n == `${space}42${space}`);
}

const allWhitespace = whitespace.join('');
assertEquals(42, Number(`${allWhitespace}42${allWhitespace}`));
assertEquals(0, Number(allWhitespace));
assertEquals(42, parseInt(`${allWhitespace}42`, 10));
assertEquals(42.5, parseFloat(`${allWhitespace}42.5tail`));
assertEquals(42n, BigInt(`${allWhitespace}42${allWhitespace}`));
assertEquals(0n, BigInt(allWhitespace));

for (const malformedBytes of [
       [0xa0],
       [0xc2],
       [0xc0, 0xa0],
       [0xe1, 0x9a],
       [0xe2, 0x80],
       [0xe2, 0x80, 0x8b],
       [0xed, 0xa0, 0x80],
       [0xef, 0xbb],
     ]) {
  const malformed = String.fromCharCode(...malformedBytes);
  assertTrue(Number.isNaN(Number(`${malformed}42`)));
  assertTrue(Number.isNaN(parseInt(`${malformed}42`, 10)));
  assertTrue(Number.isNaN(parseFloat(`${malformed}42`)));
  assertThrows(() => BigInt(`${malformed}42`), SyntaxError);
}

const partialBeforeAsciiSpace = String.fromCharCode(0xc2, 0x20);
assertTrue(Number.isNaN(Number(`${partialBeforeAsciiSpace}42`)));

function foldedNumber() {
  return Number('\u300042\u3000');
}

function foldedParseInt() {
  return parseInt('\u00a042', 10);
}

%PrepareFunctionForOptimization(foldedNumber);
%PrepareFunctionForOptimization(foldedParseInt);
assertEquals(42, foldedNumber());
assertEquals(42, foldedParseInt());
%OptimizeFunctionOnNextCall(foldedNumber);
%OptimizeFunctionOnNextCall(foldedParseInt);
assertEquals(42, foldedNumber());
assertEquals(42, foldedParseInt());
assertOptimized(foldedNumber);
assertOptimized(foldedParseInt);
