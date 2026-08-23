// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --wasm-staging --expose-externalize-string
// Flags: --expose-gc

d8.file.execute('test/mjsunit/wasm/wasm-module-builder.js');

const records = [
  {units: [0x41], points: [0x41]},
  {units: [0xE9], points: [0xE9]},
  {units: [0x4E2D], points: [0x4E2D]},
  {units: [0xD83D, 0xDE00], points: [0x1F600]},
  {units: [0xD800], points: [0xD800]},
  {units: [0xDC00], points: [0xDC00]},
  {
    units: [0x41, 0xE9, 0xD83D, 0xDE00, 0xD800],
    points: [0x41, 0xE9, 0x1F600, 0xD800]
  },
];

const longUnits = [];
const longPoints = [];
for (let i = 0; i < 40; ++i) {
  longUnits.push(i % 2 == 0 ? 0x41 : 0xE9);
  longPoints.push(i % 2 == 0 ? 0x41 : 0xE9);
}
records.push({units: longUnits, points: longPoints});

const codeUnits = [];
for (const record of records) {
  record.start = codeUnits.length;
  codeUnits.push(...record.units);
  record.end = codeUnits.length;
}

const node8Wtf16Bytes = [];
for (const codeUnit of codeUnits) {
  node8Wtf16Bytes.push(codeUnit & 0xFF, codeUnit >> 8);
}

const builder = new WasmModuleBuilder();
builder.addMemory(1, undefined);
builder.addActiveDataSegment(0, wasmI32Const(0), node8Wtf16Bytes);

const stringSignature = makeSig([kWasmI32, kWasmI32], [kWasmStringRef]);
builder.addFunction('from_memory', stringSignature).exportFunc().addBody([
  kExprLocalGet,
  0,
  kExprLocalGet,
  1,
  ...GCInstr(kExprStringNewWtf16),
  0,
]);

const dataIndex = builder.addPassiveDataSegment(node8Wtf16Bytes);
const i16Array = builder.addArray(kWasmI16, true);
const makeArray =
    builder.addFunction('make_array', makeSig([], [wasmRefType(i16Array)]))
        .addBody([
          ...wasmI32Const(0),
          ...wasmI32Const(codeUnits.length),
          kGCPrefix,
          kExprArrayNewData,
          i16Array,
          dataIndex,
        ])
        .index;

builder.addFunction('from_array', stringSignature).exportFunc().addBody([
  kExprCallFunction,
  makeArray,
  kExprLocalGet,
  0,
  kExprLocalGet,
  1,
  ...GCInstr(kExprStringNewWtf16Array),
]);

const instance = builder.instantiate();
const retainedStrings = [];
for (const record of records) {
  const expected = String.fromCodePoint(...record.points);
  const memoryResult =
      instance.exports.from_memory(record.start * 2, record.units.length);
  const arrayResult = instance.exports.from_array(record.start, record.end);
  assertEquals(expected, memoryResult);
  assertEquals(expected, arrayResult);
  assertEquals(expected.length, memoryResult.length);
  assertEquals(expected.length, arrayResult.length);
  assertTrue(isOneByteString(memoryResult));
  assertTrue(isOneByteString(arrayResult));
  retainedStrings.push(memoryResult, arrayResult);
}

gc();
gc();
for (const string of retainedStrings) {
  assertTrue(isOneByteString(string));
}
