// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --expose-externalize-string --expose-gc

d8.file.execute('test/mjsunit/wasm/wasm-module-builder.js');

const externrefFromI32 =
    makeSig([kWasmI32], [wasmRefType(kWasmExternRef)]);
const builder = new WasmModuleBuilder();
const fromCharCode = builder.addImport(
    'wasm:js-string', 'fromCharCode', externrefFromI32);
const fromCodePoint = builder.addImport(
    'wasm:js-string', 'fromCodePoint', externrefFromI32);

builder.addFunction('from_char_code', externrefFromI32)
    .exportFunc()
    .addBody([kExprLocalGet, 0, kExprCallFunction, fromCharCode]);
builder.addFunction('from_code_point', externrefFromI32)
    .exportFunc()
    .addBody([kExprLocalGet, 0, kExprCallFunction, fromCodePoint]);

const instance = builder.instantiate({}, {builtins: ['js-string']});
const retainedStrings = [];

for (const codeUnit of [0x41, 0xE9, 0x4E2D, 0xD800, 0xDC00, 0x1F600]) {
  const actual = instance.exports.from_char_code(codeUnit);
  const expected = String.fromCodePoint(codeUnit & 0xFFFF);
  assertEquals(expected, actual);
  assertTrue(isOneByteString(actual));
  retainedStrings.push(actual);
}

for (const codePoint of
         [0x41, 0xE9, 0x4E2D, 0xD800, 0xDC00, 0x1F600, 0x10FFFF]) {
  const actual = instance.exports.from_code_point(codePoint);
  const expected = String.fromCodePoint(codePoint);
  assertEquals(expected, actual);
  assertTrue(isOneByteString(actual));
  retainedStrings.push(actual);
}

for (const invalid of [-1, 0x110000]) {
  assertThrows(
      () => instance.exports.from_code_point(invalid), WebAssembly.RuntimeError);
}

gc();
gc();
for (const string of retainedStrings) {
  assertTrue(isOneByteString(string));
}
