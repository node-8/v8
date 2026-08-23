// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --allow-natives-syntax

const ellipsis = String.fromCodePoint(0x2026);
let message;
try {
  BigInt('x'.repeat(1001));
} catch (error) {
  message = error.message;
}

const ellipsisIndex = message.indexOf(ellipsis);
assertTrue(ellipsisIndex >= 0);
assertEquals(3, ellipsis.length);
assertEquals(
    ellipsis,
    message.slice(ellipsisIndex, ellipsisIndex + ellipsis.length));

const emoji = %WasmStringFromCodePoint(0x1F600);
assertEquals(String.fromCodePoint(0x1F600), emoji);
assertEquals(4, emoji.length);
assertEquals([0xF0, 0x9F, 0x98, 0x80],
             Array.from({length: emoji.length},
                        (_, index) => emoji.charCodeAt(index)));
