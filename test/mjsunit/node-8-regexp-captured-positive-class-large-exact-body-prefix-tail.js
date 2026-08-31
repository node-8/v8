// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);
const cjk = String.fromCodePoint(0x4e2d);
const classSource = '[A-C\\u00e9-\\u00eb]';
const tail9 = '123456789';
const tail16 = '1234567890abcdef';
const tail32 = '1234567890abcdefghijklmnopqrstuv';
const tail33 = '1234567890abcdefghijklmnopqrstuvw';
const prefix9 = 'prefix-09';
const prefix32 = 'prefix-1234567890123456789012345';

function regexp(prefix, body, tail, flags = 'du') {
  return new RegExp(prefix + body + tail, flags);
}

function assertMatchIndices(expected, expression, subject) {
  const match = expression.exec(subject);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

function exactBody(count) {
  return '(' + classSource + '){' + count + '}';
}

function exactMixed(count) {
  return '((' + classSource + '){' + count + '})';
}

// The old unrolled boundary remains unchanged; 9/20/100 use one quantifier.
for (const count of [8, 9, 20, 100]) {
  const field = eAcute.repeat(count);
  assertMatchIndices(
      [
        [0, field.length + tail9.length],
        [field.length - eAcute.length, field.length]
      ],
      regexp('', exactBody(count), tail9), field + tail9);
}

const field20 = (eAcute + eCircumflex).repeat(10);
assertMatchIndices(
    [[0, 40 + tail16.length], [0, 40], [38, 40]],
    regexp('', exactMixed(20), tail16), field20 + tail16);
assertMatchIndices(
    [
      [0, prefix32.length + 40 + tail32.length],
      [prefix32.length, prefix32.length + 40],
      [prefix32.length + 38, prefix32.length + 40]
    ],
    regexp(prefix32, exactMixed(20), tail32), prefix32 + field20 + tail32);

// Exact-count failures do not borrow bytes from the successor.
assertNull(regexp('p=', exactMixed(20), tail16)
               .exec('p=' + eAcute.repeat(19) + tail16));
assertNull(regexp('p=', exactMixed(20), tail16)
               .exec('p=' + eAcute.repeat(21) + tail16));

const searched = 'zz' + prefix9 + eAcute.repeat(9) + tail9;
assertMatchIndices(
    [
      [2, searched.length], [2 + prefix9.length, 2 + prefix9.length + 18],
      [2 + prefix9.length + 16, 2 + prefix9.length + 18]
    ],
    regexp(prefix9, exactMixed(9), tail9), searched);

const chunk = prefix9 + eAcute.repeat(9) + tail9;
const all = Array.from(
    chunk.repeat(30).matchAll(regexp(prefix9, exactMixed(9), tail9, 'dgu')));
assertEquals(30, all.length);
for (let i = 0; i < all.length; ++i) {
  const start = i * chunk.length;
  assertEquals(
      [
        [start, start + chunk.length],
        [start + prefix9.length, start + prefix9.length + 18],
        [start + prefix9.length + 16, start + prefix9.length + 18]
      ],
      Array.from(all[i].indices));
}

const calls = [];
assertEquals(
    'Y',
    chunk.replace(
        regexp(prefix9, exactMixed(9), tail9, 'gu'),
        (match, outer, part, offset) => {
          calls.push([bytes(match), bytes(outer), bytes(part), offset]);
          return 'Y';
        }));
assertEquals(
    [[bytes(chunk), bytes(eAcute.repeat(9)), bytes(eAcute), 0]], calls);

const malformedSubject =
    raw(0x80, ...bytes(prefix9), ...bytes(eAcute.repeat(9)), ...bytes(tail9));
const malformed = regexp(prefix9, exactMixed(9), tail9, 'dgu');
malformed.lastIndex = 1;
assertMatchIndices([[1, 37], [10, 28], [26, 28]], malformed, malformedSubject);
assertEquals(37, malformed.lastIndex);

// Adjacent unsupported paths retain their prior behavior.
assertNull(
    regexp('', '((' + classSource + '{20}))', tail9).exec(field20 + tail9));
assertNull(regexp('', exactMixed(20), tail33).exec(field20 + tail33));
assertNull(regexp('', exactMixed(20), String.fromCodePoint(0x4e2d))
               .exec(field20 + cjk));
assertNull(regexp('', exactMixed(20), tail9, 'duy').exec(field20 + tail9));
assertNull(regexp('', exactMixed(20), tail9, 'dui').exec(field20 + tail9));
