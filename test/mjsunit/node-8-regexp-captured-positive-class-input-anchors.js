// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const eAcute = String.fromCodePoint(0xe9);
const cjk = String.fromCodePoint(0x4e2d);
const field = eAcute + cjk;
const classSource = '[A-C\u00e9-\u00eb\u4e2d]';
const prefix = 'key=';
const tail = '!';

function regexp(start, body, end, flags = 'du') {
  return new RegExp(start + prefix + body + tail + end, flags);
}

function assertMatchIndices(expected, expression, subject) {
  const match = expression.exec(subject);
  assertNotNull(match);
  assertEquals(expected, Array.from(match.indices));
  return match;
}

const mixedExact = '((' + classSource + '){2})';
const bodyFinite = '(' + classSource + '){1,3}';

// A start assertion and its optional end assertion preserve the accepted core.
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], regexp('^', mixedExact, '$'),
    prefix + field + tail);
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]], regexp('^', mixedExact, ''),
    prefix + field + tail + 'after');

// Existing exact, finite, unbounded, greedy, and lazy constructions are reused.
assertMatchIndices(
    [[0, 10], [6, 9]], regexp('^', bodyFinite, '$'), prefix + field + tail);
assertMatchIndices(
    [[0, 10], [6, 9]], regexp('^', '(' + classSource + ')+', '$'),
    prefix + field + tail);
assertMatchIndices(
    [[0, 10], [4, 9], [6, 9]],
    regexp('^', '((' + classSource + '){1,3}?)', '$'), prefix + field + tail);

// Anchors, counts, and tail failures remain strict.
assertNull(regexp('^', mixedExact, '$').exec('x' + prefix + field + tail));
assertNull(regexp('^', mixedExact, '$').exec(prefix + field + tail + 'x'));
assertNull(regexp('^', mixedExact, '$').exec(prefix + eAcute + tail));
assertNull(regexp('^', mixedExact, '$').exec(prefix + field + 'x'));

const global = regexp('^', mixedExact, '$', 'dgu');
assertEquals(1, Array.from((prefix + field + tail).matchAll(global)).length);
assertEquals(
    'Y',
    (prefix + field + tail).replace(regexp('^', mixedExact, '$', 'gu'), 'Y'));

// Assertion-free accepted behavior is unchanged.
assertMatchIndices(
    [[2, 12], [6, 11], [8, 11]], regexp('', mixedExact, ''),
    'zz' + prefix + field + tail);

// Adjacent assertion and selector forms remain on their prior paths.
assertNull(regexp('', mixedExact, '$').exec('zz' + prefix + field + tail));
assertNull(
    regexp('^', '((' + classSource + '+))', '$').exec(prefix + field + tail));
assertNull(
    regexp('^', '((' + classSource + ')+)', '$').exec(prefix + field + tail));
assertNull(regexp('^', mixedExact, '$', 'dmu').exec(prefix + field + tail));
assertNull(new RegExp('^\\b' + prefix + mixedExact + tail + '$', 'du')
               .exec(prefix + field + tail));
assertNull(
    new RegExp('^(?=' + prefix + ')' + prefix + mixedExact + tail + '$', 'du')
        .exec(prefix + field + tail));
assertNull(regexp('^', '((' + classSource + '){1})', '$')
               .exec(prefix + eAcute + tail));
assertNull(regexp('^', mixedExact, '$', 'duy').exec(prefix + field + tail));
assertNull(regexp('^', mixedExact, '$', 'dui').exec(prefix + field + tail));
