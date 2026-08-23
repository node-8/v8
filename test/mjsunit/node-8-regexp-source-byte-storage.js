// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --expose-externalize-string --expose-gc

function byteValues(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

const expected = '中😀[é]';
const literal = /中😀[é]/u;
assertEquals(expected, literal.source);
assertEquals(byteValues(expected), byteValues(literal.source));
assertTrue(isOneByteString(literal.source));

const subject = 'x中y';
const match = /中/u.exec(subject);
assertNotNull(match);
assertEquals(1, match.index);
assertSame(match[0], subject.slice(match.index, match.index + match[0].length));

const escapedSlash = new RegExp('中/😀', 'u');
assertEquals('中\\/😀', escapedSlash.source);
assertTrue(isOneByteString(escapedSlash.source));

function cachedLiteral() {
  return /é中😀/u;
}
cachedLiteral();
cachedLiteral();
const cached = cachedLiteral();
const evaluated = eval('/é中😀/u');
assertEquals('é中😀', cached.source);
assertEquals('é中😀', evaluated.source);
assertTrue(isOneByteString(cached.source));
assertTrue(isOneByteString(evaluated.source));

const escapedSyntax = /\u4e2d\xE9/u;
assertEquals('\\u4e2d\\xE9', escapedSyntax.source);
assertTrue(isOneByteString(escapedSyntax.source));

const retained = [literal.source, escapedSlash.source, cached.source,
                  evaluated.source, escapedSyntax.source];
gc();
gc();
for (const source of retained) assertTrue(isOneByteString(source));
