// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The external driver must verify the intended profile.
// Fixed oracles qualify only one non-ASCII-only unbounded quantifier, min 0..3,
// in an anchored consuming root without original choices or inner captures.
'use strict';

(() => {
  const width = String.fromCodePoint(233).length;
  if (width !== 1 && width !== 2) throw Error('Unknown string profile');
  const byte = width === 2;
  const profile = byte ? 'node8' : 'stock';
  const emit = typeof print === 'function' ? print : console.log;
  const fixture = (bytes, stock) => ({bytes, stock});
  const ascii = text => {
    const data = Array.from(text, ch => ch.charCodeAt(0));
    if (data.some(value => value > 127)) throw Error('Non-ASCII fixture');
    return fixture(data, data);
  };
  const join = (...parts) => fixture(parts.flatMap(p => p.bytes),
                                    parts.flatMap(p => p.stock));
  const selected = value => byte ? value.bytes : value.stock;
  const string = value => String.fromCharCode(...selected(value));
  const units = value => {
    const result = [];
    for (let i = 0; i < value.length; ++i) result.push(value.charCodeAt(i));
    return result;
  };
  const E = fixture([0xc3, 0xa9], [0x00e9]);
  const EC = fixture([0xc3, 0x89], [0x00c9]);
  const K = fixture([0xe2, 0x84, 0xaa], [0x212a]);
  const H = fixture([0xed, 0xa0, 0x80], [0xd800]);
  const L = fixture([0xed, 0xb0, 0x80], [0xdc00]);
  const U = fixture([0xf0, 0x90, 0x80, 0x80], [0xd800, 0xdc00]);
  const D = fixture([0xf0, 0x90, 0x90, 0x80], [0xd801, 0xdc00]);
  const DL = fixture([0xf0, 0x90, 0x90, 0xa8], [0xd801, 0xdc28]);
  const SIGMA = fixture([0xce, 0xa3], [0x03a3]);
  const SMALL_SIGMA = fixture([0xcf, 0x83], [0x03c3]);
  const FINAL_SIGMA = fixture([0xcf, 0x82], [0x03c2]);
  const SHARP_S = fixture([0xc3, 0x9f], [0x00df]);
  const CAPITAL_SHARP_S = fixture([0xe1, 0xba, 0x9e], [0x1e9e]);
  const FF = fixture([0xff], [0x00ff]);
  const CONT = fixture([0x80], [0x0080]);
  const BAD = fixture([0xc3, 0x28], [0x00c3, 0x0028]);
  const TRUNC = fixture([0xc3], [0x00c3]);
  const bang = ascii('!');
  const empty = ascii('');
  const eTwo = join(EC, E);
  const eThree = join(EC, E, EC);
  const hTwo = join(H, H);
  const uTwo = join(U, U);
  const rawPairs = join(H, L, H, L);
  const sharpSmallFirst = join(SHARP_S, CAPITAL_SHARP_S);
  const sharpCapitalFirst = join(CAPITAL_SHARP_S, SHARP_S);
  const namedSource = '^A(?<x>' + string(SHARP_S) + '+?)(' + string(SHARP_S) + ')';
  const namedSubject = join(ascii('a'), sharpCapitalFirst, CAPITAL_SHARP_S, bang);
  const namedValues = [join(ascii('a'), sharpCapitalFirst), CAPITAL_SHARP_S, SHARP_S];
  const namedBytes = [[0, 6], [1, 4], [4, 6]];
  const namedStock = [[0, 3], [1, 2], [2, 3]];
  let checks = 0;
  let cases = 0;
  let failureCount = 0;
  const failures = [];
  const failedCases = new Set();
  const encode = value => JSON.stringify(value, (_key, item) =>
    item === undefined ? {undefined: true} : item);
  function equal(label, actual, expected, id = label) {
    ++checks;
    if (encode(actual) === encode(expected)) return;
    ++failureCount;
    failedCases.add(id);
    if (failures.length < 40) failures.push({label, actual, expected});
  }
  for (const [name, value] of Object.entries({E, EC, K, H, L, U, D, DL,
      SIGMA, SMALL_SIGMA, FINAL_SIGMA, SHARP_S, CAPITAL_SHARP_S,
      FF, CONT, BAD, TRUNC})) {
    equal('fixture-' + name, units(string(value)), selected(value));
  }
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = '', start = 0, names) =>
    ({id, source, subject, values, bytes, stock, condition, extraFlags, start, names});
  // Numeric spans and values are fixtures, never inferred from engine output.
  const rows = [
    row('minimum-zero-shortest', '^(' + string(E) + '*?)(' + string(E) + ')',
        join(eThree, bang), [EC, empty, EC],
        [[0, 2], [0, 0], [0, 2]], [[0, 1], [0, 0], [0, 1]]),
    row('minimum-one-shortest', '^(' + string(E) + '+?)(' + string(E) + ')',
        join(eThree, bang), [eTwo, EC, E],
        [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]),
    row('minimum-two-shortest', '^(' + string(E) + '{2,}?)(' + string(E) + ')',
        join(eThree, bang), [eThree, eTwo, EC],
        [[0, 6], [0, 4], [4, 6]], [[0, 3], [0, 2], [2, 3]]),
    row('minimum-three-shortest', '^(' + string(E) + '{3,}?)(' + string(E) + ')',
        join(eThree, E, bang), [join(eThree, E), eThree, E],
        [[0, 8], [0, 6], [6, 8]], [[0, 4], [0, 3], [3, 4]]),
    row('greedy-priority-control', '^(' + string(E) + '+)(' + string(E) + ')',
        join(eThree, bang), [eThree, eTwo, EC],
        [[0, 6], [0, 4], [4, 6]], [[0, 3], [0, 2], [2, 3]]),
    row('sharp-small-first-shortest', '^(' + string(SHARP_S) + '+?)(' + string(SHARP_S) + ')',
        join(sharpSmallFirst, SHARP_S, bang), [sharpSmallFirst, SHARP_S, CAPITAL_SHARP_S],
        [[0, 5], [0, 2], [2, 5]], [[0, 2], [0, 1], [1, 2]], 'unicode'),
    row('sharp-capital-first-shortest', '^(' + string(SHARP_S) + '+?)(' + string(SHARP_S) + ')',
        join(sharpCapitalFirst, CAPITAL_SHARP_S, bang), [sharpCapitalFirst, CAPITAL_SHARP_S, SHARP_S],
        [[0, 5], [0, 3], [3, 5]], [[0, 2], [0, 1], [1, 2]], 'unicode'),
    row('sharp-small-first-suffix-retry', '^(' + string(SHARP_S) + '*?)(' + string(SHARP_S) + ')!$',
        join(sharpSmallFirst, SHARP_S, bang),
        [join(sharpSmallFirst, SHARP_S, bang), sharpSmallFirst, SHARP_S],
        [[0, 8], [0, 5], [5, 7]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('sharp-capital-first-suffix-retry', '^(' + string(SHARP_S) + '+?)(' + string(SHARP_S) + ')!$',
        join(sharpCapitalFirst, CAPITAL_SHARP_S, bang),
        [join(sharpCapitalFirst, CAPITAL_SHARP_S, bang), sharpCapitalFirst, CAPITAL_SHARP_S],
        [[0, 9], [0, 5], [5, 8]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('named-prefix-shortest', namedSource, namedSubject, namedValues,
        namedBytes, namedStock, 'unicode', '', 0, {x: 1}),
    row('sigma-shortest', '^(' + string(SIGMA) + '+?)(' + string(SIGMA) + ')',
        join(SMALL_SIGMA, FINAL_SIGMA, SIGMA, bang),
        [join(SMALL_SIGMA, FINAL_SIGMA), SMALL_SIGMA, FINAL_SIGMA],
        [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]),
    row('deseret-shortest', '^(' + string(D) + '+?)(' + string(D) + ')',
        join(DL, DL, D, bang), [join(DL, DL), DL, DL],
        [[0, 8], [0, 4], [4, 8]], [[0, 4], [0, 2], [2, 4]], 'unicode'),
    row('grouped-scalar-shortest', '^((?:' + string(U) + ')+?)(' + string(U) + ')',
        join(uTwo, bang), [uTwo, U, U],
        [[0, 8], [0, 4], [4, 8]], [[0, 4], [0, 2], [2, 4]]),
    row('raw-high-shortest', '^(' + string(H) + '+?)(' + string(H) + ')',
        join(H, H, H, bang), [hTwo, H, H],
        [[0, 6], [0, 3], [3, 6]], [[0, 2], [0, 1], [1, 2]]),
    row('raw-low-shortest', '^(' + string(L) + '+?)(' + string(L) + ')',
        join(L, L, L, bang), [join(L, L), L, L],
        [[0, 6], [0, 3], [3, 6]], [[0, 2], [0, 1], [1, 2]]),
    row('raw-high-before-low', '^(' + string(H) + '+?)' + string(L) + '!$',
        join(hTwo, L, bang), [join(hTwo, L, bang), hTwo],
        [[0, 10], [0, 6]], [[0, 4], [0, 2]], 'byte-or-stock-legacy'),
    row('bare-scalar-repetition', '^(' + string(U) + '+?)!$',
        join(uTwo, bang), [join(uTwo, bang), uTwo],
        [[0, 9], [0, 8]], [[0, 5], [0, 4]], 'unicode'),
    row('scalar-not-raw-pairs', '^(' + string(U) + '+?)!$',
        join(rawPairs, bang), [join(rawPairs, bang), rawPairs],
        [[0, 13], [0, 12]], [[0, 5], [0, 4]], 'stock-unicode'),
    row('star-zero-consuming-root', '^(' + string(E) + '*?)!$', bang,
        [bang, empty], [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('minimum-failure', '^(' + string(E) + '{2,}?)!$', join(EC, bang), null),
    row('wrong-letter', '^(' + string(E) + '+?)!$', ascii('E!'), null),
    row('sharp-small-first-tail-failure', '^(' + string(SHARP_S) + '*?)(' + string(SHARP_S) + ')!$',
        join(sharpSmallFirst, SHARP_S, ascii('?')), null),
    row('sharp-capital-first-tail-failure', '^(' + string(SHARP_S) + '+?)(' + string(SHARP_S) + ')!$',
        join(sharpCapitalFirst, CAPITAL_SHARP_S, ascii('?')), null),
    row('malformed-ff', '^(' + string(E) + '+?)!$', join(EC, FF, bang), null),
    row('malformed-continuation', '^(' + string(E) + '+?)!$', join(EC, CONT, bang), null),
    row('malformed-second-byte', '^(' + string(E) + '+?)!$', join(EC, BAD, bang), null),
    row('truncated-subject', '^(' + string(E) + '+?)$', join(EC, TRUNC), null),
    row('same-flags-body', '^((?i:' + string(E) + ')+?)(' + string(E) + ')',
        join(eThree, bang), [eTwo, EC, E],
        [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]),
    row('same-flags-root', '(?i:^(' + string(E) + '+?)(' + string(E) + '))',
        join(eThree, bang), [eTwo, EC, E],
        [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]),
    row('escaped-high-shortest', '^(\\uD800+?)(\\uD800)',
        join(H, H, H, bang), [hTwo, H, H],
        [[0, 6], [0, 3], [3, 6]], [[0, 2], [0, 1], [1, 2]]),
    row('nested-outer-captures', '^((' + string(E) + '+?))(' + string(E) + ')',
        join(eThree, bang), [eTwo, EC, EC, E],
        [[0, 4], [0, 2], [0, 2], [2, 4]], [[0, 2], [0, 1], [0, 1], [1, 2]]),
    row('named-global', namedSource, namedSubject, namedValues,
        namedBytes, namedStock, 'unicode', 'g', 0, {x: 1}),
    row('named-sticky', namedSource, namedSubject, namedValues,
        namedBytes, namedStock, 'unicode', 'y', 0, {x: 1}),
    row('named-global-sticky', namedSource, namedSubject, namedValues,
        namedBytes, namedStock, 'unicode', 'gy', 0, {x: 1}),
    row('global-nonzero-origin', namedSource, namedSubject, null,
        undefined, undefined, 'all', 'g', 1, {x: 1}),
    row('sticky-nonzero-origin', namedSource, namedSubject, null,
        undefined, undefined, 'all', 'y', 1, {x: 1}),
  ];
  function snapshot(match) {
    if (match === null) return null;
    const value = item => item === undefined ? undefined : units(item);
    return {
      values: Array.from(match, value), index: match.index,
      indices: Array.from(match.indices), input: units(match.input),
      slices: Array.from(match.indices, span => span === undefined ? undefined :
        units(match.input.slice(span[0], span[1]))),
      groups: match.groups === undefined ? null : Object.fromEntries(
        Object.entries(match.groups).map(([name, item]) => [name, value(item)])),
      groupIndices: match.indices.groups === undefined ? null : match.indices.groups,
    };
  }
  function allowed(condition, grammar) {
    if (condition === 'all') return true;
    if (condition === 'unicode') return byte || grammar !== '';
    if (condition === 'byte-or-stock-legacy') return byte || grammar === '';
    if (condition === 'stock-unicode') return !byte && grammar !== '';
    throw Error('Unknown fixed-oracle condition');
  }
  function sample(item, grammar, literal) {
    ++cases;
    const flags = 'di' + grammar + item.extraFlags;
    const id = item.id + ':' + flags + ':' + (literal ? 'literal' : 'constructor');
    let re;
    let error;
    try { re = literal ? eval('/' + item.source + '/' + flags) :
      new RegExp(item.source, flags); }
    catch (caught) { error = caught.name; }
    equal(id + ':compile', error, undefined, id);
    if (error !== undefined) return;
    equal(id + ':source', units(re.source), units(item.source), id);
    equal(id + ':flags', re.flags, Array.from(flags).sort().join(''), id);
    equal(id + ':mode', [re.ignoreCase, re.unicode, re.unicodeSets],
          [true, grammar === 'u', grammar === 'v'], id);
    const text = item.values !== null && allowed(item.condition, grammar) ? item.values : null;
    const indices = byte ? item.bytes : item.stock;
    const values = text === null ? null : text.map(selected);
    const expected = text === null ? null : {
      values, index: 0, indices, input: selected(item.subject), slices: values,
      groups: item.names === undefined ? null : Object.fromEntries(
        Object.entries(item.names).map(([name, capture]) => [name, values[capture]])),
      groupIndices: item.names === undefined ? null : Object.fromEntries(
        Object.entries(item.names).map(([name, capture]) => [name, indices[capture]])),
    };
    for (let repeat = 0; repeat < 2; ++repeat) {
      re.lastIndex = item.start;
      equal(id + ':exec-' + repeat, snapshot(re.exec(string(item.subject))), expected, id);
      equal(id + ':lastIndex-' + repeat, re.lastIndex,
            item.extraFlags === '' ? item.start : text === null ? 0 : indices[0][1], id);
    }
    if (item.extraFlags !== '') {
      // After a failed nonzero-origin call, reset the same origin so this
      // remains an anchored-failure control, not an accidental fresh match.
      if (text === null) re.lastIndex = item.start;
      equal(id + ':next-anchored-exec', re.exec(string(item.subject)), null, id);
      equal(id + ':next-lastIndex-reset', re.lastIndex, 0, id);
    }
  }
  for (const grammar of ['', 'u', 'v']) {
    for (const literal of [false, true]) {
      for (const item of rows) sample(item, grammar, literal);
    }
  }
  // The /v bracket ClassSet representation is not in this slice.
  for (const grammar of ['', 'u']) {
    for (const literal of [false, true]) {
      sample(row('singleton-bracket-shortest', '^([' + string(E) + ']+?)(' + string(E) + ')',
                 join(eThree, bang), [eTwo, EC, E],
                 [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]), grammar, literal);
    }
  }
  equal('fixed-case-count', cases, 220);
  equal('fixed-check-count', checks + 1, 1839);
  emit(encode({kind: 'nonascii-lazy-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-nonascii-lazy-quantifiers', profile,
    cases, checks, expectedCases: 220, expectedChecks: 1839,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length,
    performanceTested: false}));

  // Actual results for excluded syntax are diagnostic, never required failures.
  const excluded = [
    ['finite-maximum', '^(' + string(E) + '{1,2}?)!$', join(eTwo, bang)],
    ['minimum-four', '^(' + string(E) + '{4,}?)!$', join(eThree, E, bang)],
    ['choice-before', '^(?:' + string(E) + '|' + string(SIGMA) + ')(' + string(E) + '+?)!$',
      join(eThree, bang)],
    ['choice-after', '^(' + string(E) + '+?)(?:' + string(E) + '|' + string(SIGMA) + ')!$',
      join(eThree, bang)],
    ['inner-capture', '^((' + string(E) + ')+?)!$', join(eTwo, bang)],
    ['second-quantifier', '^(' + string(E) + '+?)(' + string(SIGMA) + '+)!$',
      join(EC, SMALL_SIGMA, bang)],
    ['ascii-closure', '^(a+?)a', ascii('AAA!')],
    ['mixed-closure', '^(k+?)k', join(K, ascii('kK!'))],
    ['changed-body-flags', '^((?-i:' + string(E) + ')+?)!$', join(eTwo, bang)],
  ];
  const observations = [];
  for (const [id, source, subject] of excluded) {
    for (const grammar of ['', 'u', 'v']) {
      for (const literal of [false, true]) {
        const flags = 'di' + grammar;
        try {
          const re = literal ? eval('/' + source + '/' + flags) : new RegExp(source, flags);
          observations.push({id, grammar, literal, actual: snapshot(re.exec(string(subject)))});
        } catch (caught) {
          observations.push({id, grammar, literal, error: caught.name});
        }
      }
    }
  }
  emit(encode({kind: 'excluded-lazy-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('NONASCII_LAZY_ORACLE: ' + failureCount);
})();
