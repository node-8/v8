// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function bytes(value) {
  return Array.from(
      {length: value.length}, (_, index) => value.charCodeAt(index));
}

const identityReplacer = (key, value) => value;
for (const replacer of [undefined, identityReplacer]) {
  assertEquals('"\u00e9"', JSON.stringify('\u00e9', replacer));
  assertEquals('"\u4e2d\u6587"', JSON.stringify('\u4e2d\u6587', replacer));
  assertEquals('"\ud83d\ude00"', JSON.stringify('\ud83d\ude00', replacer));

  const surrogate = String.fromCodePoint(0xd800);
  assertEquals('"\\ud800"', JSON.stringify(surrogate, replacer));

  for (const malformedBytes
           of [[0x80],
               [0xe2, 0x28, 0xa1],
               [0xe2, 0x82],
               [0xf4, 0x90, 0x80, 0x80],
  ]) {
    const malformed = String.fromCharCode(...malformedBytes);
    assertEquals('"' + malformed + '"', JSON.stringify(malformed, replacer));
  }
}

const parsedSurrogate = JSON.parse('"\\ud800"');
assertEquals([0xed, 0xa0, 0x80], bytes(parsedSurrogate));
assertEquals([0xf0, 0x9f, 0x98, 0x80], bytes(JSON.parse('"\\ud83d\\ude00"')));

const escapedKey = JSON.parse('{"\\u00e9":1}');
assertEquals(1, escapedKey['\u00e9']);
const duplicateKey = JSON.parse('{"\\u00e9":1,"\u00e9":2}');
assertEquals(['\u00e9'], Object.keys(duplicateKey));
assertEquals(2, duplicateKey['\u00e9']);

const rawMalformedJson =
    String.fromCharCode('"'.charCodeAt(0), 0x80, '"'.charCodeAt(0));
const rawMalformedValue = JSON.parse(rawMalformedJson);
assertEquals([0x80], bytes(rawMalformedValue));
assertEquals(rawMalformedJson, JSON.stringify(rawMalformedValue));

const value = {
  latin: '\u00e9',
  cjk: '\u4e2d\u6587',
  emoji: '\ud83d\ude00'
};
assertEquals(value, JSON.parse(JSON.stringify(value)));

const surrogateKey = String.fromCodePoint(0xd800);
const keyed = {
  [surrogateKey]: 1
};
assertEquals('{"\\ud800":1}', JSON.stringify(keyed));
