// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const highBytes = String.fromCharCode(0x80, 0xff);

for (let length = 0; length < 48; length++) {
  const prefix = 'a'.repeat(length);

  assertEquals(prefix + 'tail', JSON.parse(`"${prefix}tail"`));
  assertEquals(prefix + '"tail', JSON.parse(`"${prefix}\\"tail"`));
  assertEquals(prefix + '\\tail', JSON.parse(`"${prefix}\\\\tail"`));
  assertEquals(prefix + highBytes, JSON.parse(`"${prefix}${highBytes}"`));

  const control = `"${prefix}${String.fromCharCode(0x1f)}"`;
  assertThrows(() => JSON.parse(control), SyntaxError);
}

const twoByte = '\u4e2d'.repeat(48);
assertEquals(twoByte, JSON.parse(`"${twoByte}"`));
