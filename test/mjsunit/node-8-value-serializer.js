// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

function deserialize(bytes) {
  return d8.serializer.deserialize(new Uint8Array(bytes).buffer);
}

const values = [
  'ascii',
  String.fromCodePoint(0xE9),
  String.fromCodePoint(0x1F600),
  String.fromCodePoint(0xD800),
  String.fromCharCode(0x80, 0xFF),
];

for (const value of values) {
  const serialized = d8.serializer.serialize(value);
  assertEquals(0x53, new Uint8Array(serialized)[2]);
  assertEquals(value, d8.serializer.deserialize(serialized));
}

const eAcute = String.fromCodePoint(0xE9);
const emoji = String.fromCodePoint(0x1F600);
const object = {
  [eAcute]: {value: emoji}
};
const clonedObject = d8.serializer.deserialize(d8.serializer.serialize(object));
assertEquals([eAcute], Object.keys(clonedObject));
assertEquals(emoji, clonedObject[eAcute].value);

const regexp = new RegExp(`Qu${eAcute}bec`, 'i');
const clonedRegExp = d8.serializer.deserialize(d8.serializer.serialize(regexp));
assertEquals(regexp.source, clonedRegExp.source);
assertEquals(regexp.flags, clonedRegExp.flags);

// Stock one-byte strings are Latin-1 in the serialization format.
assertEquals(
    String.fromCodePoint(0xE9), deserialize([0xFF, 0x0F, 0x22, 0x01, 0xE9]));

// Stock two-byte strings use host-endian UTF-16 code units.
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const emojiBytes =
    littleEndian ? [0x3D, 0xD8, 0x00, 0xDE] : [0xD8, 0x3D, 0xDE, 0x00];
const loneSurrogateBytes = littleEndian ? [0x00, 0xD8] : [0xD8, 0x00];
assertEquals(
    String.fromCodePoint(0x1F600),
    deserialize([0xFF, 0x0F, 0x63, 0x04, ...emojiBytes]));
assertEquals(
    String.fromCodePoint(0xD800),
    deserialize([0xFF, 0x0F, 0x63, 0x02, ...loneSurrogateBytes]));

// Legacy String objects and RegExps embed strings with the same tags.
const legacyStringObject = deserialize([
  0xFF,
  0x0F,
  0x73,
  0x22,
  0x06,
  0x51,
  0x75,
  0xE9,
  0x62,
  0x65,
  0x63,
]);
assertEquals(`Qu${eAcute}bec`, legacyStringObject.valueOf());

const legacyRegExp = deserialize([
  0xFF,
  0x0F,
  0x52,
  0x22,
  0x06,
  0x51,
  0x75,
  0xE9,
  0x62,
  0x65,
  0x63,
  0x02,
]);
assertEquals(`Qu${eAcute}bec`, legacyRegExp.source);
assertEquals('i', legacyRegExp.flags);
