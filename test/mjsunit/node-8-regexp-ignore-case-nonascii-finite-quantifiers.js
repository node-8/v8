// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: one non-ASCII-only singleton quantifier, finite max 1..3, anchored
// consuming root, outer captures only, no original choice. Max-zero is a
// correct old-route control, not a requirement to enter this lowering.
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
  const SIGMA = fixture([0xce, 0xa3], [0x03a3]);
  const SMALL_SIGMA = fixture([0xcf, 0x83], [0x03c3]);
  const FINAL_SIGMA = fixture([0xcf, 0x82], [0x03c2]);
  const SHARP_S = fixture([0xc3, 0x9f], [0x00df]);
  const CAPITAL_SHARP_S = fixture([0xe1, 0xba, 0x9e], [0x1e9e]);
  const D = fixture([0xf0, 0x90, 0x90, 0x80], [0xd801, 0xdc00]);
  const DL = fixture([0xf0, 0x90, 0x90, 0xa8], [0xd801, 0xdc28]);
  const H = fixture([0xed, 0xa0, 0x80], [0xd800]);
  const L = fixture([0xed, 0xb0, 0x80], [0xdc00]);
  const U = fixture([0xf0, 0x90, 0x80, 0x80], [0xd800, 0xdc00]);
  const FF = fixture([0xff], [0x00ff]);
  const CONT = fixture([0x80], [0x0080]);
  const BAD = fixture([0xc3, 0x28], [0x00c3, 0x0028]);
  const TRUNC = fixture([0xc3], [0x00c3]);
  const bang = ascii('!');
  const empty = ascii('');
  const eTwo = join(EC, E);
  const eThree = join(EC, E, EC);
  const eFour = join(EC, E, EC, E);
  const eFive = join(eFour, EC);
  const sharpSmallFirst = join(SHARP_S, CAPITAL_SHARP_S);
  const sharpCapitalFirst = join(CAPITAL_SHARP_S, SHARP_S);
  const namedSource = '^A(?<x>' + string(SHARP_S) + '{1,2}?)(' + string(SHARP_S) + ')!$';
  const namedSubject = join(ascii('a'), sharpCapitalFirst, CAPITAL_SHARP_S, bang);
  const namedValues = [namedSubject, sharpCapitalFirst, CAPITAL_SHARP_S];
  const namedBytes = [[0, 10], [1, 6], [6, 9]];
  const namedStock = [[0, 5], [1, 3], [3, 4]];
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
  for (const [name, value] of Object.entries({E, EC, SIGMA, SMALL_SIGMA,
      FINAL_SIGMA, SHARP_S, CAPITAL_SHARP_S, D, DL, H, L, U, FF, CONT, BAD, TRUNC})) {
    equal('fixture-' + name, units(string(value)), selected(value));
  }
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = '', start = 0, names) =>
    ({id, source, subject, values, bytes, stock, condition, extraFlags, start, names});

  // These four answers are independently fixed prefixes, not engine output.
  // Index is the number of é iterations; the next é is a separate capture.
  const prefixAnswers = [
    [[EC, empty, EC], [[0, 2], [0, 0], [0, 2]], [[0, 1], [0, 0], [0, 1]]],
    [[eTwo, EC, E], [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]],
    [[eThree, eTwo, EC], [[0, 6], [0, 4], [4, 6]], [[0, 3], [0, 2], [2, 3]]],
    [[eFour, eThree, E], [[0, 8], [0, 6], [6, 8]], [[0, 4], [0, 3], [3, 4]]],
  ];
  const rows = [];
  const combinations = [[0, 1], [1, 1], [0, 2], [1, 2], [2, 2],
                        [0, 3], [1, 3], [2, 3], [3, 3]];
  for (const [min, max] of combinations) {
    for (const lazy of [false, true]) {
      const quantifier = min === max ? '{' + min + '}' : '{' + min + ',' + max + '}';
      const [values, bytes, stock] = prefixAnswers[lazy ? min : max];
      rows.push(row('matrix-' + min + '-' + max + (lazy ? '-lazy' : '-greedy'),
        '^(' + string(E) + quantifier + (lazy ? '?' : '') + ')(' + string(E) + ')',
        join(eFive, bang), values, bytes, stock));
    }
  }
  rows.push(
    row('optional-greedy-alias', '^(' + string(E) + '?)(' + string(E) + ')',
        join(eFive, bang), ...prefixAnswers[1]),
    row('optional-lazy-alias', '^(' + string(E) + '??)(' + string(E) + ')',
        join(eFive, bang), ...prefixAnswers[0]),
    row('zero-repetitions-consuming-root', '^(' + string(E) + '{0,3})!$', bang,
        [bang, empty], [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('minimum-failure', '^(' + string(E) + '{2,3})!$', join(EC, bang), null),
    row('maximum-failure', '^(' + string(E) + '{0,3})!$', join(eFour, bang), null),
    row('sharp-small-first-suffix-retry', '^(' + string(SHARP_S) + '{1,2}?)(' + string(SHARP_S) + ')!$',
        join(sharpSmallFirst, SHARP_S, bang),
        [join(sharpSmallFirst, SHARP_S, bang), sharpSmallFirst, SHARP_S],
        [[0, 8], [0, 5], [5, 7]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('sharp-capital-first-suffix-retry', '^(' + string(SHARP_S) + '{1,2}?)(' + string(SHARP_S) + ')!$',
        join(sharpCapitalFirst, CAPITAL_SHARP_S, bang),
        [join(sharpCapitalFirst, CAPITAL_SHARP_S, bang), sharpCapitalFirst, CAPITAL_SHARP_S],
        [[0, 9], [0, 5], [5, 8]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('sharp-exact-two-greedy', '^(' + string(SHARP_S) + '{2})!$',
        join(sharpCapitalFirst, bang), [join(sharpCapitalFirst, bang), sharpCapitalFirst],
        [[0, 6], [0, 5]], [[0, 3], [0, 2]], 'unicode'),
    row('sharp-exact-two-lazy', '^(' + string(SHARP_S) + '{2}?)!$',
        join(sharpCapitalFirst, bang), [join(sharpCapitalFirst, bang), sharpCapitalFirst],
        [[0, 6], [0, 5]], [[0, 3], [0, 2]], 'unicode'),
    row('sigma-greedy-priority', '^(' + string(SIGMA) + '{1,2})(' + string(SIGMA) + ')',
        join(SMALL_SIGMA, FINAL_SIGMA, SIGMA, bang),
        [join(SMALL_SIGMA, FINAL_SIGMA, SIGMA), join(SMALL_SIGMA, FINAL_SIGMA), SIGMA],
        [[0, 6], [0, 4], [4, 6]], [[0, 3], [0, 2], [2, 3]]),
    row('sigma-lazy-priority', '^(' + string(SIGMA) + '{1,2}?)(' + string(SIGMA) + ')',
        join(SMALL_SIGMA, FINAL_SIGMA, SIGMA, bang),
        [join(SMALL_SIGMA, FINAL_SIGMA), SMALL_SIGMA, FINAL_SIGMA],
        [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]),
    row('deseret-bounded-retry', '^(' + string(D) + '{1,2}?)(' + string(D) + ')!$',
        join(DL, DL, D, bang), [join(DL, DL, D, bang), join(DL, DL), D],
        [[0, 13], [0, 8], [8, 12]], [[0, 7], [0, 4], [4, 6]], 'unicode'),
    row('raw-high-exact-two', '^(' + string(H) + '{2})!$', join(H, H, bang),
        [join(H, H, bang), join(H, H)], [[0, 7], [0, 6]], [[0, 3], [0, 2]]),
    row('raw-low-shortest', '^(' + string(L) + '{1,2}?)(' + string(L) + ')',
        join(L, L, L, bang), [join(L, L), L, L],
        [[0, 6], [0, 3], [3, 6]], [[0, 2], [0, 1], [1, 2]]),
    row('raw-high-before-low', '^(' + string(H) + '{1,2}?)' + string(L) + '!$',
        join(H, H, L, bang), [join(H, H, L, bang), join(H, H)],
        [[0, 10], [0, 6]], [[0, 4], [0, 2]], 'byte-or-stock-legacy'),
    row('scalar-not-raw-pairs', '^(' + string(U) + '{2})!$',
        join(H, L, H, L, bang), [join(H, L, H, L, bang), join(H, L, H, L)],
        [[0, 13], [0, 12]], [[0, 5], [0, 4]], 'stock-unicode'),
    row('grouped-scalar-exact-two', '^((?:' + string(U) + '){2})!$',
        join(U, U, bang), [join(U, U, bang), join(U, U)],
        [[0, 9], [0, 8]], [[0, 5], [0, 4]]),
    row('malformed-ff', '^(' + string(E) + '{0,3})!$', join(EC, FF, bang), null),
    row('malformed-continuation', '^(' + string(E) + '{0,3})!$', join(EC, CONT, bang), null),
    row('malformed-second-byte', '^(' + string(E) + '{0,3})!$', join(EC, BAD, bang), null),
    row('truncated-subject', '^(' + string(E) + '{1,3})$', join(EC, TRUNC), null),
    row('same-flags-body', '^((?i:' + string(E) + '){1,2}?)(' + string(E) + ')',
        join(eFive, bang), ...prefixAnswers[1]),
    row('same-flags-root', '(?i:^(' + string(E) + '{1,2}?)(' + string(E) + '))',
        join(eFive, bang), ...prefixAnswers[1]),
    row('named-global', namedSource, namedSubject, namedValues,
        namedBytes, namedStock, 'unicode', 'g', 0, {x: 1}),
    row('named-sticky', namedSource, namedSubject, namedValues,
        namedBytes, namedStock, 'unicode', 'y', 0, {x: 1}),
    row('global-nonzero-origin', namedSource, namedSubject, null,
        undefined, undefined, 'all', 'g', 1, {x: 1}),
    row('sticky-nonzero-origin', namedSource, namedSubject, null,
        undefined, undefined, 'all', 'y', 1, {x: 1}),
  );
  // Dead non-ASCII bodies preserve the earlier correct ASCII suffix route.
  for (const quantifier of ['{0}', '{0}?', '{0,0}', '{0,0}?']) {
    rows.push(row('max-zero-old-route-' + quantifier,
      '^(' + string(E) + quantifier + ')A$', ascii('a'), [ascii('a'), empty],
      [[0, 1], [0, 0]], [[0, 1], [0, 0]]));
  }
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
    try { re = literal ? eval('/' + item.source + '/' + flags) : new RegExp(item.source, flags); }
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
  for (const grammar of ['', 'u']) {
    for (const literal of [false, true]) {
      sample(row('singleton-bracket-bounded', '^([' + string(E) + ']{1,2}?)(' + string(E) + ')',
                 join(eFive, bang), ...prefixAnswers[1]), grammar, literal);
    }
  }
  equal('fixed-case-count', cases, 298);
  equal('fixed-check-count', checks + 1, 2450);
  emit(encode({kind: 'nonascii-finite-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-nonascii-finite-quantifiers', profile,
    cases, checks, expectedCases: 298, expectedChecks: 2450,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['maximum-four', '^(' + string(E) + '{0,4})!$', join(eFour, bang)],
    ['choice-before', '^(?:' + string(E) + '|' + string(SIGMA) + ')(' + string(E) + '{1,2})!$',
      join(eThree, bang)],
    ['inner-capture', '^((' + string(E) + '){1,2})!$', join(eTwo, bang)],
    ['second-quantifier', '^(' + string(E) + '{1,2})(' + string(SIGMA) + '{1,2})!$',
      join(EC, SMALL_SIGMA, bang)],
    ['ascii-closure', '^(a{1,2}?)a', ascii('AAA!')],
    ['changed-body-flags', '^((?-i:' + string(E) + '){1,2})!$', join(eTwo, bang)],
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
  emit(encode({kind: 'excluded-finite-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('NONASCII_FINITE_ORACLE: ' + failureCount);
})();
