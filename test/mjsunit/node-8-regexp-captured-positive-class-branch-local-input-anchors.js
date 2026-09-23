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

function expression(body, end = '', flags = 'du') {
  return new RegExp('(?:^key=' + body + '!' + end + '|none)', flags);
}

function assertMatchIndices(expected, regexp, value) {
  const match = regexp.exec(value);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

const mixedExact = '((' + classSource + '){2})';

// Required start-of-input and optional end-of-input stay inside the first
// branch while the existing scalar field constructions are reused.
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression(mixedExact), subject + 'after');
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression(mixedExact, '$'), subject);
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    expression('((' + classSource + '){1,3})'), subject);
assertMatchIndices(
    [[0, 10], [6, 9]], expression('(' + classSource + ')+'), subject);
assertMatchIndices(
    [[0, 10], [4, 9]], expression('(' + classSource + '{2})'), subject);

// A later alternative remains unanchored and leaves failed field captures
// undefined, including when it wins away from input start.
const other = assertMatchIndices(
    [[2, 6], undefined, undefined], expression(mixedExact), 'zznone');
assertEquals('none', other[0]);
assertEquals(undefined, other[1]);
assertEquals(undefined, other[2]);

// Failures, byte offsets, global search, lastIndex, and replacement compose
// without extending the branch-local assertion to later alternatives.
assertNull(expression(mixedExact, '$').exec(subject + 'x'));
assertNull(expression(mixedExact).exec('x' + subject));
assertNull(expression(mixedExact).exec('key=' + eAcute + '!'));
assertEquals('X', subject.replace(expression(mixedExact, '', 'gu'), 'X'));

const global = expression(mixedExact, '', 'dgu');
global.lastIndex = 1;
assertMatchIndices([[1, 5], undefined, undefined], global, 'xnone none');
assertEquals(5, global.lastIndex);
assertMatchIndices([[6, 10], undefined, undefined], global, 'xnone none');
assertEquals(10, global.lastIndex);
assertNull(global.exec('xnone none'));
assertEquals(0, global.lastIndex);

const anchoredAfterZero = expression(mixedExact, '', 'dgu');
anchoredAfterZero.lastIndex = 1;
assertNull(anchoredAfterZero.exec(subject));
assertEquals(0, anchoredAfterZero.lastIndex);

// A malformed prefix retains byte offsets for later alternatives. The fully
// anchored finite replacement-class shape now matches maximal subparts.
assertMatchIndices(
    [[1, 5], undefined, undefined], expression(mixedExact),
    raw(0x80) + 'none');
const malformedClass = '[\ufffd\u00e9]';
assertMatchIndices(
    [[0, 8], [4, 7], [5, 7]],
    expression('((' + malformedClass + '){2})', '$'),
    'key=' + raw(0x80) + eAcute + '!');

// Generic composition handles end-only anchors and further capture topologies.
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('(?:key=' + mixedExact + '!$|none)', 'du'), subject);
// Multiline and case-sensitive word boundaries preserve captures.
assertEquals([subject, field, cjk], Array.from(assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression(mixedExact, '', 'dmu'), subject)));
assertEquals([subject, field, cjk], Array.from(assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('(?:^\\bkey=' + mixedExact + '!|none)', 'du'), subject)));
// The lookahead is local to the anchored branch and consumes nothing itself.
assertEquals([subject, field, cjk], Array.from(assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('(?:^(?=key=)key=' + mixedExact + '!|none)', 'du'), subject)));
assertMatchIndices(
    [[0, 10], [4, 9], [4, 9]], expression('((' + classSource + '+))', '$'), subject);
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression('((' + classSource + ')+)', '$'), subject);
assertMatchIndices(
    [[0, 7], [4, 6], [4, 6]], expression('((' + classSource + '){1})'),
    'key=' + eAcute + '!');
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    new RegExp('(?:none|^key=' + mixedExact + '!)', 'du'), subject);
assertMatchIndices(
    [[0, 10], [4, 9], undefined],
    new RegExp(
        '(?:^key=(' + classSource + '{2})!|other=(' + classSource + '{2})!)',
        'du'), subject);
assertMatchIndices(
    [[0, 10], [0, 10], [4, 9], [6, 9]],
    new RegExp('((?:^key=' + mixedExact + '!|none))', 'du'), subject);
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], expression(mixedExact, '', 'duy'), subject);
// Positive ignore-case classes are supported; modifier groups remain separate.
assertEquals(
    [subject, field, cjk],
    Array.from(assertMatchIndices(
        [[0, 10], [4, 9], [6, 9]], expression(mixedExact, '', 'dui'),
        subject)));
assertNull(
    new RegExp('(?i:^key=' + mixedExact + '!|none)', 'du').exec(subject));
