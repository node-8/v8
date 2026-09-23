// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics --allow-natives-syntax

const spaces = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f,
  0x205f, 0x3000, 0xfeff,
].map(cp => String.fromCodePoint(cp));
const raw = (...bytes) => String.fromCharCode(...bytes);
const payload = 'Aé中😀\u0120';

function check(left, body, right) {
  const s = left + body + right;
  assertEquals(body, s.trim());
  assertEquals(body + right, s.trimStart());
  assertEquals(left + body, s.trimEnd());
  assertEquals(s.trimStart(), s.trimLeft());
  assertEquals(s.trimEnd(), s.trimRight());
}

for (const space of spaces) {
  check(space, payload, space);
  assertEquals('', (space + space).trim());
  assertEquals('', (space + space).trimStart());
  assertEquals('', (space + space).trimEnd());
  for (const other of spaces) check(space + other, payload, other + space);
}
check('', payload, '');
assertEquals('', ''.trim());
assertEquals('', ''.trimStart());
assertEquals('', ''.trimEnd());
const mixed = spaces.join('');
check(mixed, payload, mixed);
assertEquals('', mixed.trim());

// Every continuation, incomplete whitespace prefix/suffix and overlong/WTF-8
// sequence remains payload, even when its last byte is Latin-1 NBSP (0xA0).
const nonspace = [];
for (let byte = 0x80; byte <= 0xbf; ++byte) nonspace.push(raw(byte));
for (const space of spaces) {
  for (let i = 1; i < space.length; ++i) {
    nonspace.push(space.slice(0, i), space.slice(i));
  }
}
nonspace.push(
    raw(0xc0, 0xa0), raw(0xe0, 0x80, 0xa0), raw(0xed, 0xa0, 0x80),
    raw(0xff), raw(0, 0xa0), '\u0085', '\u0120', '\u180e', '\u200b',
    '\u2060', 'é', '😀');
for (const value of nonspace) {
  check(mixed, value, mixed);
  check('', value, '');
}

// Independent byte-slice oracle: exhaust all two-byte inputs, then perturb
// every byte of every multibyte whitespace encoding. No RegExp is involved.
function oracle(s, fromStart, fromEnd) {
  let start = 0;
  let end = s.length;
  if (fromStart) {
    for (;;) {
      const space = spaces.find(w => start + w.length <= end &&
                                    s.slice(start, start + w.length) === w);
      if (space === undefined) break;
      start += space.length;
    }
  }
  if (fromEnd) {
    for (;;) {
      const space = spaces.find(w => end - w.length >= start &&
                                    s.slice(end - w.length, end) === w);
      if (space === undefined) break;
      end -= space.length;
    }
  }
  return s.slice(start, end);
}
function checkOracle(s) {
  assertEquals(oracle(s, true, true), s.trim());
  assertEquals(oracle(s, true, false), s.trimStart());
  assertEquals(oracle(s, false, true), s.trimEnd());
}
for (let a = 0; a < 256; ++a) {
  for (let b = 0; b < 256; ++b) checkOracle(raw(a, b));
}
for (const space of spaces) {
  if (space.length === 1) continue;
  for (let i = 0; i < space.length; ++i) {
    for (let byte = 0; byte < 256; ++byte) {
      const mutated = space.slice(0, i) + raw(byte) + space.slice(i + 1);
      checkOracle(mutated);
      checkOracle(' ' + mutated + '\t');
    }
  }
}

// Leading/trailing ASCII next to an incomplete sequence trims independently.
assertEquals(raw(0xc2), (raw(0xc2) + ' ').trimEnd());
assertEquals(raw(0xa0), (' ' + raw(0xa0)).trimStart());
assertEquals(raw(0xe2, 0x80), (raw(0xe2, 0x80) + '\u3000').trimEnd());
// Concatenation is raw; the resulting complete boundary can still be matched.
check(raw(0xe2) + raw(0x80, 0x80), payload, raw(0xc2) + raw(0xa0));
const padded = ('p'.repeat(64) + mixed + payload + mixed + 'q'.repeat(64));
assertEquals(payload, padded.slice(64, -64).trim());

assertSame(String.prototype.trimStart, String.prototype.trimLeft);
assertSame(String.prototype.trimEnd, String.prototype.trimRight);
for (const method of ['trim', 'trimStart', 'trimEnd']) {
  const fn = String.prototype[method];
  assertEquals(method, fn.name);
  assertEquals(0, fn.length);
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, method);
  assertFalse(descriptor.enumerable);
  assertTrue(descriptor.configurable);
  assertTrue(descriptor.writable);
  assertThrows(() => fn.call(null), TypeError);
  assertThrows(() => fn.call(undefined), TypeError);
  assertThrows(() => fn.call(Symbol()), TypeError);
  assertEquals('42', fn.call(42));
}
let coercions = 0;
assertEquals(payload, String.prototype.trim.call({
  toString() { ++coercions; return mixed + payload + mixed; }
}));
assertEquals(1, coercions);

function trimmed(s) { return s.trim() + ':' + s.trimStart() + ':' + s.trimEnd(); }
%PrepareFunctionForOptimization(trimmed);
const value = '\u3000x\u00a0';
const expected = 'x:x\u00a0:\u3000x';
assertEquals(expected, trimmed(value));
assertEquals(expected, trimmed(value));
%OptimizeFunctionOnNextCall(trimmed);
assertEquals(expected, trimmed(value));
assertOptimized(trimmed);

const realm = Realm.create();
assertEquals('x', Realm.eval(realm, '"\\u3000x\\u00a0".trim()'));
assertTrue(Realm.eval(realm,
    'String.prototype.trimStart === String.prototype.trimLeft'));
Realm.dispose(realm);
