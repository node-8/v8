// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: independent non-ASCII sibling loops; nested loops remain excluded.
// Existing anchored consuming root and no-original-choice gates stay.
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
  const selected = value => value === undefined ? undefined : byte ? value.bytes : value.stock;
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

  const copies = (value, count) => fixture(
    Array.from({length: count}, () => value.bytes).flat(),
    Array.from({length: count}, () => value.stock).flat());
  const pieces = [EC, E, EC, E, EC, E];
  const segment = (start, end) => join(...pieces.slice(start, end));
  const P = join(E, SIGMA);
  const P0 = join(EC, SMALL_SIGMA);
  const rows = [];
  // Allocate six declared E fixtures by bounds and greedy/lazy priorities.
  // The mandatory final E leaves at most five for the two sibling loops.
  for (const [q1, min1, max1] of [
    ['?', 0, 1], ['*', 0, 6], ['+', 1, 6], ['{1,2}', 1, 2],
    ['{2}', 2, 2], ['{2,4}', 2, 4], ['{2,}', 2, 6], ['{0,4}', 0, 4],
  ]) {
    for (const [q2, min2, max2] of [['?', 0, 1], ['+', 1, 6], ['{1,3}', 1, 3]]) {
      for (const lazy1 of [false, true]) {
        for (const lazy2 of [false, true]) {
          const n1 = lazy1 ? min1 : Math.min(max1, 5 - min2);
          const n2 = lazy2 ? min2 : Math.min(max2, 5 - n1);
          const total = n1 + n2;
          const spans = scale => [[0, scale * (total + 1)], [0, scale * n1],
            n1 === 0 ? undefined : [scale * (n1 - 1), scale * n1],
            [scale * n1, scale * total],
            n2 === 0 ? undefined : [scale * (total - 1), scale * total],
            [scale * total, scale * (total + 1)]];
          rows.push(row('overlap-' + q1 + '-' + q2 + '-' + lazy1 + '-' + lazy2,
            '^((' + string(E) + ')' + q1 + (lazy1 ? '?' : '') + ')((' +
            string(E) + ')' + q2 + (lazy2 ? '?' : '') + ')(' + string(E) + ')',
            join(segment(0, 6), bang),
            [segment(0, total + 1), segment(0, n1), n1 === 0 ? undefined : pieces[n1 - 1],
             segment(n1, total), n2 === 0 ? undefined : pieces[total - 1], pieces[total]],
            spans(2), spans(1)));
        }
      }
    }
  }
  for (const count of [4, 64]) {
    for (const delta of [-1, 0, 1]) {
      const a = copies(EC, count + delta);
      const b = copies(SMALL_SIGMA, count);
      const subject = join(a, b, bang);
      rows.push(row('independent-counters-' + count + '-' + delta,
        '^((' + string(E) + '){' + count + '})((' + string(SIGMA) + '){' + count + '})!$',
        subject, delta === 0 ? [subject, a, EC, b, SMALL_SIGMA] : null,
        [[0, 4 * count + 1], [0, 2 * count], [2 * count - 2, 2 * count],
         [2 * count, 4 * count], [4 * count - 2, 4 * count]],
        [[0, 2 * count + 1], [0, count], [count - 1, count],
         [count, 2 * count], [2 * count - 1, 2 * count]]));
    }
  }
  rows.push(
    row('three-loops', '^(' + string(E) + '+)(' + string(SIGMA) + '+)(' + string(D) + '+)!$',
        join(EC, SMALL_SIGMA, DL, bang), [join(EC, SMALL_SIGMA, DL, bang), EC, SMALL_SIGMA, DL],
        [[0, 9], [0, 2], [2, 4], [4, 8]], [[0, 5], [0, 1], [1, 2], [2, 4]], 'unicode'),
    row('same-flags-loops', '^(?i:(' + string(E) + ')+)(?i:(' + string(SIGMA) + ')+)!$',
        join(EC, E, SMALL_SIGMA, FINAL_SIGMA, bang),
        [join(EC, E, SMALL_SIGMA, FINAL_SIGMA, bang), E, FINAL_SIGMA],
        [[0, 9], [2, 4], [6, 8]], [[0, 5], [1, 2], [3, 4]]),
    row('named-global', '^((?<a>' + string(E) + ')+)((?<b>' + string(SIGMA) + ')+)!$',
        join(EC, E, SMALL_SIGMA, bang), [join(EC, E, SMALL_SIGMA, bang), join(EC, E), E, SMALL_SIGMA, SMALL_SIGMA],
        [[0, 7], [0, 4], [2, 4], [4, 6], [4, 6]],
        [[0, 4], [0, 2], [1, 2], [2, 3], [2, 3]], 'all', 'g', 0, {a: 2, b: 4}),
    row('named-sticky', '^((?<a>' + string(E) + ')+?)((?<b>' + string(SIGMA) + ')+?)!$',
        join(EC, E, SMALL_SIGMA, bang), [join(EC, E, SMALL_SIGMA, bang), join(EC, E), E, SMALL_SIGMA, SMALL_SIGMA],
        [[0, 7], [0, 4], [2, 4], [4, 6], [4, 6]],
        [[0, 4], [0, 2], [1, 2], [2, 3], [2, 3]], 'all', 'y', 0, {a: 2, b: 4}),
    row('global-nonzero', '^(' + string(E) + '+)(' + string(SIGMA) + '+)!$',
        join(P0, bang), null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^(' + string(E) + '+)(' + string(SIGMA) + '+)!$',
        join(P0, bang), null, undefined, undefined, 'all', 'y', 1),
    row('zero-both', '^((' + string(E) + ')*)((' + string(SIGMA) + ')*)!$', bang,
        [bang, empty, undefined, empty, undefined],
        [[0, 1], [0, 0], undefined, [0, 0], undefined],
        [[0, 1], [0, 0], undefined, [0, 0], undefined]),
    row('zero-first', '^((' + string(E) + ')*)((' + string(SIGMA) + ')+)!$', join(SMALL_SIGMA, bang),
        [join(SMALL_SIGMA, bang), empty, undefined, SMALL_SIGMA, SMALL_SIGMA],
        [[0, 3], [0, 0], undefined, [0, 2], [0, 2]], [[0, 2], [0, 0], undefined, [0, 1], [0, 1]]),
    row('zero-second', '^((' + string(E) + ')+)((' + string(SIGMA) + ')*)!$', join(EC, bang),
        [join(EC, bang), EC, EC, empty, undefined],
        [[0, 3], [0, 2], [0, 2], [2, 2], undefined], [[0, 2], [0, 1], [0, 1], [1, 1], undefined]),
    row('partial-iteration-rollback', '^((?:(' + string(E) + ')(' + string(SIGMA) + '))+)((' + string(E) + ')+)!$',
        join(P0, E, bang), [join(P0, E, bang), P0, EC, SMALL_SIGMA, E, E],
        [[0, 7], [0, 4], [0, 2], [2, 4], [4, 6], [4, 6]],
        [[0, 4], [0, 2], [0, 1], [1, 2], [2, 3], [2, 3]]),
    row('sharp-greedy-rollback', '^((' + string(SHARP_S) + ')+)((' + string(SHARP_S) + ')+)!$',
        join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang),
        [join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang), join(CAPITAL_SHARP_S, SHARP_S),
         SHARP_S, CAPITAL_SHARP_S, CAPITAL_SHARP_S],
        [[0, 9], [0, 5], [3, 5], [5, 8], [5, 8]], [[0, 4], [0, 2], [1, 2], [2, 3], [2, 3]], 'unicode'),
    row('sharp-lazy-rollback', '^((' + string(SHARP_S) + ')+?)((' + string(SHARP_S) + ')+)!$',
        join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang),
        [join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang), CAPITAL_SHARP_S,
         CAPITAL_SHARP_S, join(SHARP_S, CAPITAL_SHARP_S), CAPITAL_SHARP_S],
        [[0, 9], [0, 3], [0, 3], [3, 8], [5, 8]], [[0, 4], [0, 1], [0, 1], [1, 3], [2, 3]], 'unicode'),
    row('surrogate-sibling', '^((' + string(H) + ')+)((' + string(E) + ')+)!$',
        join(H, H, EC, E, bang), [join(H, H, EC, E, bang), join(H, H), H, join(EC, E), E],
        [[0, 11], [0, 6], [3, 6], [6, 10], [8, 10]], [[0, 5], [0, 2], [1, 2], [2, 4], [3, 4]]),
    row('ascii-separator', '^((' + string(E) + ')+):((' + string(SIGMA) + ')+)!$',
        join(EC, ascii(':'), SMALL_SIGMA, bang), [join(EC, ascii(':'), SMALL_SIGMA, bang), EC, EC, SMALL_SIGMA, SMALL_SIGMA],
        [[0, 6], [0, 2], [0, 2], [3, 5], [3, 5]], [[0, 4], [0, 1], [0, 1], [2, 3], [2, 3]]),
    row('malformed-ff', '^(' + string(E) + '+)(' + string(SIGMA) + '+)!$', join(EC, FF, SMALL_SIGMA, bang), null),
    row('malformed-bad', '^(' + string(E) + '+)(' + string(SIGMA) + '+)!$', join(EC, BAD, SMALL_SIGMA, bang), null),
    row('malformed-cont', '^(' + string(E) + '+)(' + string(SIGMA) + '+)!$', join(EC, CONT, SMALL_SIGMA, bang), null),
    row('partial-second-body', '^((' + string(P) + ')+)((' + string(join(D, E)) + ')+)!$', join(P0, DL, bang), null),
    row('reversed-fields', '^(' + string(E) + '+)(' + string(SIGMA) + '+)!$', join(SMALL_SIGMA, EC, bang), null),
    row('failed-suffix', '^(' + string(E) + '+)(' + string(SIGMA) + '+)X$', join(P0, bang), null)
  );
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
    if (condition === 'stock') return !byte;
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
  equal('fixed-case-count', cases, 732);
  equal('fixed-check-count', checks + 1, 5922);
  emit(encode({kind: 'sibling-repetitions-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-sibling-repetitions', profile,
    cases, checks, expectedCases: 732, expectedChecks: 5922,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['ascii-mixed-body', '^((' + string(E) + 'X)+)!$', join(EC, ascii('x!'))],
    ['nested-nullable-body', '^((' + string(E) + ')?)+!$', join(EC, bang)],
    ['changed-body-flags', '^(((?-i:' + string(E) + '))+)!$', join(EC, bang)],
    ['ascii-closure', '^((a)+)!$', ascii('AA!')],
    ['mixed-closure', '^((k)+)!$', ascii('KK!')],
    ['original-choice', '^((' + string(E) + '|' + string(SIGMA) + ')+)!$', join(EC, bang)],
    ['nested-quantifier', '^(((' + string(E) + ')+)(' + string(SIGMA) + '))+!$', join(EC, SMALL_SIGMA, bang)],
    ['unanchored-root', '((' + string(E) + ')+)!$', join(EC, bang)],
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
  emit(encode({kind: 'excluded-sibling-repetitions-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('SIBLING_REPETITIONS_ORACLE: ' + failureCount);
})();
