// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: non-ASCII serial bodies with component captures and scalar leaves.
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
  const P = join(E, SIGMA);
  const P0 = join(EC, SMALL_SIGMA);
  const P1 = join(E, FINAL_SIGMA);
  const pairs = [empty, P0, join(P0, P1), join(P0, P1, P0),
    join(P0, P1, P0, P1), join(P0, P1, P0, P1, P0)];
  const split = '(' + string(E) + ')(' + string(SIGMA) + ')';
  const sharp = '(' + string(E) + ')(' + string(SHARP_S) + ')';
  const sharp0 = join(EC, CAPITAL_SHARP_S);
  const sharp1 = join(E, SHARP_S);
  const rows = [];
  // Pair fixtures and repetition counts determine spans without using RegExp.
  for (const [quantifier, greedy, lazyCount] of [
    ['?', 1, 0], ['*', 4, 0], ['+', 4, 1], ['{0,2}', 2, 0], ['{1,3}', 3, 1],
    ['{2}', 2, 2], ['{3,}', 4, 3], ['{4}', 4, 4], ['{4,8}', 4, 4], ['{4,}', 4, 4],
  ]) {
    for (const lazy of [false, true]) {
      const count = lazy ? lazyCount : greedy;
      const first = count === 0 ? undefined : count % 2 === 0 ? E : EC;
      const second = count === 0 ? undefined : count % 2 === 0 ? FINAL_SIGMA : SMALL_SIGMA;
      const tail = count % 2 === 0 ? P0 : P1;
      rows.push(row('prefix-' + quantifier + '-' + lazy,
        '^((?:' + split + ')' + quantifier + (lazy ? '?' : '') + ')(' + string(P) + ')',
        join(pairs[5], bang), [pairs[count + 1], pairs[count], first, second, tail],
        [[0, 4 * (count + 1)], [0, 4 * count],
         count === 0 ? undefined : [4 * (count - 1), 4 * count - 2],
         count === 0 ? undefined : [4 * count - 2, 4 * count], [4 * count, 4 * (count + 1)]],
        [[0, 2 * (count + 1)], [0, 2 * count],
         count === 0 ? undefined : [2 * (count - 1), 2 * count - 1],
         count === 0 ? undefined : [2 * count - 1, 2 * count], [2 * count, 2 * (count + 1)]]));
    }
  }
  for (const count of [4, 64]) {
    for (const lazy of [false, true]) {
      for (const delta of [-1, 0, 1]) {
        const subject = join(copies(P0, count + delta), bang);
        rows.push(row('exact-' + count + '-' + lazy + '-' + delta,
          '^((?:' + split + '){' + count + '}' + (lazy ? '?' : '') + ')!$', subject,
          delta === 0 ? [subject, copies(P0, count), EC, SMALL_SIGMA] : null,
          [[0, 4 * count + 1], [0, 4 * count], [4 * count - 4, 4 * count - 2],
           [4 * count - 2, 4 * count]],
          [[0, 2 * count + 1], [0, 2 * count], [2 * count - 2, 2 * count - 1],
           [2 * count - 1, 2 * count]]));
      }
    }
  }
  for (const [id, body] of [
    ['groups', '(?i:' + string(E) + ')(?i:' + string(SIGMA) + ')'],
    ['scalar-sequence', string(join(E, D))],
    ['scalar-groups', '(?i:' + string(E) + ')(?i:' + string(D) + ')'],
  ]) {
    for (const lazy of [false, true]) {
      const scalar = id !== 'groups';
      const pair = scalar ? join(EC, DL) : P0;
      rows.push(row(id + '-' + lazy, '^((' + body + '){2}' + (lazy ? '?' : '') + ')!$',
        join(pair, pair, bang), [join(pair, pair, bang), join(pair, pair), pair],
        [[0, scalar ? 13 : 9], [0, scalar ? 12 : 8], [scalar ? 6 : 4, scalar ? 12 : 8]],
        [[0, scalar ? 7 : 5], [0, scalar ? 6 : 4], [scalar ? 3 : 2, scalar ? 6 : 4]],
        scalar ? 'unicode' : 'all'));
    }
  }
  rows.push(
    row('zero-optional', '^((?:' + split + ')?)!$', bang,
        [bang, empty, undefined, undefined], [[0, 1], [0, 0], undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined]),
    row('zero-lazy-star', '^((?:' + split + ')*?)!$', bang,
        [bang, empty, undefined, undefined], [[0, 1], [0, 0], undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined]),
    row('named-global', '^A((?:(?<first>' + string(E) + ')(?<last>' + string(SIGMA) + '))+)(' + string(P) + ')!$',
        join(ascii('a'), pairs[3], bang), [join(ascii('a'), pairs[3], bang), pairs[2], E, FINAL_SIGMA, P0],
        [[0, 14], [1, 9], [5, 7], [7, 9], [9, 13]],
        [[0, 8], [1, 5], [3, 4], [4, 5], [5, 7]], 'all', 'g', 0, {first: 2, last: 3}),
    row('named-sticky', '^A((?:(?<first>' + string(E) + ')(?<last>' + string(SIGMA) + '))+?)(' + string(P) + ')!$',
        join(ascii('a'), pairs[3], bang), [join(ascii('a'), pairs[3], bang), pairs[2], E, FINAL_SIGMA, P0],
        [[0, 14], [1, 9], [5, 7], [7, 9], [9, 13]],
        [[0, 8], [1, 5], [3, 4], [4, 5], [5, 7]], 'all', 'y', 0, {first: 2, last: 3}),
    row('global-nonzero', '^((?:' + split + ')+)!$', join(pairs[3], bang), null,
        undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^((?:' + split + ')+)!$', join(pairs[3], bang), null,
        undefined, undefined, 'all', 'y', 1),
    row('nested-captures', '^(((' + split + ')){2})!$', join(pairs[2], bang),
        [join(pairs[2], bang), pairs[2], P1, P1, E, FINAL_SIGMA],
        [[0, 9], [0, 8], [4, 8], [4, 8], [4, 6], [6, 8]],
        [[0, 5], [0, 4], [2, 4], [2, 4], [2, 3], [3, 4]]),
    row('same-flags-components', '^((?i:(' + string(E) + '))(?i:(' + string(SIGMA) + '))){2}!$',
        join(pairs[2], bang), [join(pairs[2], bang), P1, E, FINAL_SIGMA],
        [[0, 9], [4, 8], [4, 6], [6, 8]], [[0, 5], [2, 4], [2, 3], [3, 4]]),
    row('sharp-rollback', '^((?:' + sharp + '){1,3})(' + string(join(E, SHARP_S)) + ')!$',
        join(sharp0, sharp1, sharp0, bang),
        [join(sharp0, sharp1, sharp0, bang), join(sharp0, sharp1), E, SHARP_S, sharp0],
        [[0, 15], [0, 9], [5, 7], [7, 9], [9, 14]],
        [[0, 7], [0, 4], [2, 3], [3, 4], [4, 6]], 'unicode'),
    row('sharp-lazy-prefix', '^((?:' + sharp + ')+?)(' + string(join(E, SHARP_S)) + ')',
        join(sharp0, sharp1, sharp0, bang),
        [join(sharp0, sharp1), sharp0, EC, CAPITAL_SHARP_S, sharp1],
        [[0, 9], [0, 5], [0, 2], [2, 5], [5, 9]],
        [[0, 4], [0, 2], [0, 1], [1, 2], [2, 4]], 'unicode'),
    row('scalar-captures', '^((?:(' + string(E) + ')(' + string(D) + ')){2})!$',
        join(EC, DL, E, D, bang), [join(EC, DL, E, D, bang), join(EC, DL, E, D), E, D],
        [[0, 13], [0, 12], [6, 8], [8, 12]], [[0, 7], [0, 6], [3, 4], [4, 6]], 'unicode'),
    row('surrogate-sequence', '^((' + string(join(E, H)) + '){2})!$',
        join(EC, H, E, H, bang), [join(EC, H, E, H, bang), join(EC, H, E, H), join(E, H)],
        [[0, 11], [0, 10], [5, 10]], [[0, 5], [0, 4], [2, 4]]),
    row('optional-rollback', '^((?:' + split + ')?)(' + string(P) + ')!$', join(P0, bang),
        [join(P0, bang), empty, undefined, undefined, P0],
        [[0, 5], [0, 0], undefined, undefined, [0, 4]],
        [[0, 3], [0, 0], undefined, undefined, [0, 2]]),
    row('malformed-ff', '^((?:' + split + ')+)!$', join(P0, FF, bang), null),
    row('malformed-cont', '^((?:' + split + ')+)!$', join(P0, CONT, bang), null),
    row('malformed-bad', '^((?:' + split + ')+)!$', join(P0, BAD, bang), null),
    row('truncated', '^((?:' + split + ')+)$', join(P0, TRUNC), null),
    row('partial-body', '^((?:' + split + ')+)!$', join(P0, EC, bang), null),
    row('reversed-body', '^((?:' + split + ')+)!$', join(SMALL_SIGMA, EC, bang), null),
    row('failed-suffix', '^((?:' + split + ')+)X$', join(pairs[5], bang), null)
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
  equal('fixed-case-count', cases, 348);
  equal('fixed-check-count', checks + 1, 2850);
  emit(encode({kind: 'sequence-repetitions-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-sequence-repetitions', profile,
    cases, checks, expectedCases: 348, expectedChecks: 2850,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['ascii-mixed-body', '^((' + string(E) + 'X)+)!$', join(EC, ascii('x!'))],
    ['second-quantifier', '^((' + string(E) + ')+)(' + string(SIGMA) + '+)!$', join(EC, SIGMA, bang)],
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
  emit(encode({kind: 'excluded-sequence-repetitions-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('SEQUENCE_REPETITIONS_ORACLE: ' + failureCount);
})();
