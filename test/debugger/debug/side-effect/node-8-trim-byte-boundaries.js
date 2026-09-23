// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const Debug = debug.Debug;
let exception = null;
let coercions = 0;
const receiver = { toString() { ++coercions; return ' x '; } };

Debug.setListener((event, state) => {
  if (event !== Debug.DebugEvent.Break) return;
  try {
    for (const method of ['trim', 'trimStart', 'trimEnd', 'trimLeft', 'trimRight']) {
      const input = method === 'trimStart' || method === 'trimLeft' ?
          '\\u3000x' : method === 'trimEnd' || method === 'trimRight' ?
          'x\\u00a0' : '\\u3000x\\u00a0';
      assertEquals('x', state.frame(0)
          .evaluate(`'${input}'.${method}()`, true).value());
    }
    assertThrows(() => state.frame(0)
        .evaluate('String.prototype.trim.call(receiver)', true), EvalError);
  } catch (error) {
    exception = error;
  }
});
debugger;
Debug.setListener(null);
assertNull(exception);
assertEquals(0, coercions);
