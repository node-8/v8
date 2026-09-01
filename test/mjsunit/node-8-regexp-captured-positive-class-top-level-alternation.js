// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const field = eAcute + cjk;
const subject = 'key=' + field + '!';
const classSource = '[A-C\u00e9-\u00eb\u4e2d]';

function expression(first, body, flags = 'du') {
  const fieldBranch = 'key=' + body + '!';
  return new RegExp(
      '(?:' + (first ? fieldBranch + '|none' : 'none|' + fieldBranch) + ')',
      flags);
}

function assertMatchIndices(expected, regexp, value) {
  const match = regexp.exec(value);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

const mixedExact = '((' + classSource + '){2})';

// The proved field branch must appear before unchanged alternatives.
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression(true, mixedExact), subject);
assertNull(expression(false, mixedExact).exec(subject));

// Existing exact, finite, body-only unbounded, and pure-outer paths are reused.
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression(true, '((' + classSource + '){1,3})'),
    subject);
assertMatchIndices(
    [[0, 10], [6, 9]], expression(true, '(' + classSource + ')+'), subject);
assertMatchIndices(
    [[0, 10], [4, 9]], expression(true, '(' + classSource + '{2})'), subject);

// Required start-of-input and optional end-of-input wrap the whole choice.
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('^(?:key=' + mixedExact + '!|none)$', 'du'), subject);
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('^(?:key=' + mixedExact + '!|none)', 'du'), subject + 'after');

// Choice order and undefined captures remain unchanged when another branch
// wins.
const other = expression(true, mixedExact).exec('none');
assertNotNull(other);
assertEquals('none', other[0]);
assertEquals(undefined, other[1]);
assertEquals(undefined, other[2]);
assertEquals([[0, 4], undefined, undefined], Array.from(other.indices));

// Failures, global matching, replacement, and malformed maximal subparts use
// byte offsets and compose with the existing APIs.
assertNull(expression(true, mixedExact).exec('key=' + eAcute + '!'));
assertEquals(
    [[2, 12], [6, 11], [8, 11]],
    Array.from(expression(true, mixedExact).exec('zz' + subject).indices));
assertEquals(
    2,
    Array
        .from(
            ('none ' + subject).matchAll(expression(true, mixedExact, 'dgu')))
        .length);
assertEquals('X', subject.replace(expression(true, mixedExact, 'gu'), 'X'));
const malformedPrefix = raw(0x80) + subject;
const afterMalformed = expression(true, mixedExact, 'dgu');
afterMalformed.lastIndex = 1;
assertMatchIndices(
    [[1, 11], [5, 10], [7, 10]], afterMalformed, malformedPrefix);
assertEquals(11, afterMalformed.lastIndex);

// A branch must own all captures. Adjacent unsupported shapes retain their
// preceding node-8 behavior.
assertNull(
    new RegExp(
        '(?:key=(' + classSource + '{2})!|other=(' + classSource + '{2})!)',
        'du')
        .exec(subject));
assertNull(
    new RegExp('(?:zero|key=' + mixedExact + '!|none)', 'du').exec(subject));
assertNull(new RegExp('(?:wrap(?:key=' + mixedExact + '!|none)|other)', 'du')
               .exec('wrap' + subject));
assertNull(
    new RegExp('((?:key=' + mixedExact + '!|none))', 'du').exec(subject));
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('(?:^key=' + mixedExact + '!|none)', 'du'), subject);
assertNull(new RegExp('(?:key=' + mixedExact + '!$|none)', 'du').exec(subject));
assertNull(
    new RegExp('^(?:key=((' + classSource + '+))!|none)$', 'du').exec(subject));
assertNull(
    new RegExp('^(?:key=((' + classSource + ')+)!|none)$', 'du').exec(subject));
assertNull(
    expression(true, '((' + classSource + '){1})').exec('key=' + eAcute + '!'));
assertNull(expression(true, mixedExact, 'duy').exec(subject));
assertNull(expression(true, mixedExact, 'dui').exec(subject));
assertNull(new RegExp('(?i:key=' + mixedExact + '!|none)', 'du').exec(subject));
