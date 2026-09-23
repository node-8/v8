// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: larger counts of one non-ASCII singleton with optional captures.
// Anchored consuming root and no-original-choice gates stay.
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
  const eTwo = join(EC, E);
  const eThree = join(EC, E, EC);
  const eFour = join(EC, E, EC, E);
  const eFive = join(eFour, EC);
  const sharpSmallFirst = join(SHARP_S, CAPITAL_SHARP_S);
  const sharpCapitalFirst = join(CAPITAL_SHARP_S, SHARP_S);
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
  const eRuns = [empty, EC, eTwo, eThree, eFour, eFive,
    join(eFive, E), join(eFive, E, EC), join(eFive, E, EC, E),
    join(eFive, E, EC, E, EC)];
  // Counts and spans are calculated from declared fixtures, never from a match.
  const rows = [];
  function exactRow(id, quantifier, count, captured, lazy, subjectCount = count) {
    const run = copies(EC, count);
    const subject = join(copies(EC, subjectCount), bang);
    const values = subjectCount === count ?
      [subject, run, ...(captured ? [EC] : [])] : null;
    const bytes = [[0, count * 2 + 1], [0, count * 2],
                   ...(captured ? [[(count - 1) * 2, count * 2]] : [])];
    const stock = [[0, count + 1], [0, count],
                   ...(captured ? [[count - 1, count]] : [])];
    return row(id, '^(' + (captured ? '(' + string(E) + ')' : string(E)) +
      quantifier + (lazy ? '?' : '') + ')!$', subject, values, bytes, stock);
  }
  for (const [quantifier, greedy, lazyCount] of [
    ['{0,4}', 4, 0], ['{1,4}', 4, 1], ['{3,4}', 4, 3], ['{4}', 4, 4],
    ['{4,8}', 8, 4], ['{4,}', 8, 4], ['{7,8}', 8, 7], ['{8}', 8, 8],
    ['{0,64}', 8, 0], ['{4,64}', 8, 4],
  ]) {
    for (const captured of [false, true]) {
      for (const lazy of [false, true]) {
        const count = lazy ? lazyCount : greedy;
        const inner = count === 0 ? undefined : count % 2 === 0 ? E : EC;
        const tail = count % 2 === 0 ? EC : E;
        rows.push(row('prefix-' + quantifier + '-' + captured + '-' + lazy,
          '^(' + (captured ? '(' + string(E) + ')' : string(E)) +
          quantifier + (lazy ? '?' : '') + ')(' + string(E) + ')',
          join(eRuns[9], bang),
          [eRuns[count + 1], eRuns[count], ...(captured ? [inner] : []), tail],
          [[0, 2 * (count + 1)], [0, 2 * count],
           ...(captured ? [count === 0 ? undefined : [2 * (count - 1), 2 * count]] : []),
           [2 * count, 2 * (count + 1)]],
          [[0, count + 1], [0, count],
           ...(captured ? [count === 0 ? undefined : [count - 1, count]] : []),
           [count, count + 1]]));
      }
    }
  }
  for (const count of [4, 8, 64, 257]) {
    for (const captured of [false, true]) {
      for (const lazy of [false, true]) {
        for (const delta of [-1, 0, 1]) {
          rows.push(exactRow('exact-' + count + '-' + captured + '-' + lazy + '-' + delta,
            '{' + count + '}', count, captured, lazy, count + delta));
        }
      }
    }
  }
  for (const captured of [false, true]) {
    rows.push(exactRow('exact-4096-' + captured, '{4096}', 4096, captured, false));
  }
  for (const maximum of ['2147483646', '2147483647', '2147483648', '9999999999999999999999999']) {
    for (const captured of [false, true]) {
      for (const lazy of [false, true]) {
        for (const [quantifier, matches] of [
          ['{0,' + maximum + '}', true], ['{4,' + maximum + '}', true],
          ['{' + maximum + '}', false], ['{' + maximum + ',}', false],
        ]) {
          const item = exactRow('saturated-' + quantifier + '-' + captured + '-' + lazy,
            quantifier, 8, captured, lazy);
          if (!matches) item.values = null;
          rows.push(item);
        }
      }
    }
  }
  rows.push(
    row('large-zero-greedy', '^((' + string(E) + '){0,2147483647})!$', bang,
        [bang, empty, undefined], [[0, 1], [0, 0], undefined], [[0, 1], [0, 0], undefined]),
    row('large-zero-lazy', '^((' + string(E) + '){0,2147483647}?)!$', bang,
        [bang, empty, undefined], [[0, 1], [0, 0], undefined], [[0, 1], [0, 0], undefined]),
    row('named-global', '^A((?<x>' + string(E) + '){4,8})(' + string(E) + ')!$',
        join(ascii('a'), eFive, bang), [join(ascii('a'), eFive, bang), eFour, E, EC],
        [[0, 12], [1, 9], [7, 9], [9, 11]], [[0, 7], [1, 5], [4, 5], [5, 6]], 'all', 'g', 0, {x: 2}),
    row('named-sticky', '^A((?<x>' + string(E) + '){4,8}?)(' + string(E) + ')!$',
        join(ascii('a'), eFive, bang), [join(ascii('a'), eFive, bang), eFour, E, EC],
        [[0, 12], [1, 9], [7, 9], [9, 11]], [[0, 7], [1, 5], [4, 5], [5, 6]], 'all', 'y', 0, {x: 2}),
    row('global-nonzero', '^((' + string(E) + '){4,8})!$', join(eFour, bang),
        null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^((' + string(E) + '){4,8})!$', join(eFour, bang),
        null, undefined, undefined, 'all', 'y', 1),
    row('nested-last', '^(((' + string(E) + ')){4})!$', join(eFour, bang),
        [join(eFour, bang), eFour, E, E],
        [[0, 9], [0, 8], [6, 8], [6, 8]], [[0, 5], [0, 4], [3, 4], [3, 4]]),
    row('sharp-rollback', '^((' + string(SHARP_S) + '){4,8})(' + string(SHARP_S) + ')!$',
        join(sharpCapitalFirst, sharpCapitalFirst, CAPITAL_SHARP_S, bang),
        [join(sharpCapitalFirst, sharpCapitalFirst, CAPITAL_SHARP_S, bang),
         join(sharpCapitalFirst, sharpCapitalFirst), SHARP_S, CAPITAL_SHARP_S],
        [[0, 14], [0, 10], [8, 10], [10, 13]], [[0, 6], [0, 4], [3, 4], [4, 5]], 'unicode'),
    row('sharp-lazy', '^((' + string(SHARP_S) + '){4,8}?)(' + string(SHARP_S) + ')',
        join(sharpSmallFirst, sharpSmallFirst, SHARP_S, CAPITAL_SHARP_S, bang),
        [join(sharpSmallFirst, sharpSmallFirst, SHARP_S),
         join(sharpSmallFirst, sharpSmallFirst), CAPITAL_SHARP_S, SHARP_S],
        [[0, 12], [0, 10], [7, 10], [10, 12]], [[0, 5], [0, 4], [3, 4], [4, 5]], 'unicode'),
    row('sigma-four', '^((' + string(SIGMA) + '){4})!$',
        join(SMALL_SIGMA, FINAL_SIGMA, SMALL_SIGMA, FINAL_SIGMA, bang),
        [join(SMALL_SIGMA, FINAL_SIGMA, SMALL_SIGMA, FINAL_SIGMA, bang),
         join(SMALL_SIGMA, FINAL_SIGMA, SMALL_SIGMA, FINAL_SIGMA), FINAL_SIGMA],
        [[0, 9], [0, 8], [6, 8]], [[0, 5], [0, 4], [3, 4]]),
    row('deseret-four', '^((' + string(D) + '){4})!$', join(copies(DL, 4), bang),
        [join(copies(DL, 4), bang), copies(DL, 4), DL],
        [[0, 17], [0, 16], [12, 16]], [[0, 9], [0, 8], [6, 8]], 'unicode'),
    row('raw-high-four', '^((' + string(H) + '){4})!$', join(copies(H, 4), bang),
        [join(copies(H, 4), bang), copies(H, 4), H],
        [[0, 13], [0, 12], [9, 12]], [[0, 5], [0, 4], [3, 4]]),
    row('raw-low-four', '^((' + string(L) + '){4})!$', join(copies(L, 4), bang),
        [join(copies(L, 4), bang), copies(L, 4), L],
        [[0, 13], [0, 12], [9, 12]], [[0, 5], [0, 4], [3, 4]]),
    row('scalar-not-raw', '^((' + string(U) + '){4})!$', join(copies(join(H, L), 4), bang),
        [join(copies(join(H, L), 4), bang), copies(join(H, L), 4), join(H, L)],
        [[0, 25], [0, 24], [18, 24]], [[0, 9], [0, 8], [6, 8]], 'stock'),
    row('same-flags-around-capture', '^((?i:(' + string(E) + ')){4})!$', join(eFour, bang),
        [join(eFour, bang), eFour, E], [[0, 9], [0, 8], [6, 8]], [[0, 5], [0, 4], [3, 4]]),
    row('same-flags-inside-capture', '^(((?i:' + string(E) + ')){4})!$', join(eFour, bang),
        [join(eFour, bang), eFour, E], [[0, 9], [0, 8], [6, 8]], [[0, 5], [0, 4], [3, 4]]),
    row('malformed-ff', '^((' + string(E) + '){4,8})!$', join(eFour, FF, bang), null),
    row('malformed-cont', '^((' + string(E) + '){4,8})!$', join(eFour, CONT, bang), null),
    row('malformed-bad', '^((' + string(E) + '){4,8})!$', join(eFour, BAD, bang), null),
    row('truncated-subject', '^((' + string(E) + '){4,})$', join(eFour, TRUNC), null),
    row('zero-maximum', '^(' + string(E) + '{0})A!$', ascii('a!'),
        [ascii('a!'), empty], [[0, 2], [0, 0]], [[0, 2], [0, 0]]),
    row('zero-maximum-lazy', '^(' + string(E) + '{0}?)A!$', ascii('a!'),
        [ascii('a!'), empty], [[0, 2], [0, 0]], [[0, 2], [0, 0]]),
    row('saturated-min-short', '^((' + string(E) + '){2147483647,2147483648})!$', bang, null),
    row('large-min-short', '^((' + string(E) + '){4096,8192})!$', join(eFour, bang), null)
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
  for (const grammar of ['', 'u']) {
    for (const literal of [false, true]) {
      sample(row('singleton-bracket-captured', '^(([' + string(E) + ']){4})!$',
                 join(eFour, bang), [join(eFour, bang), eFour, E],
                 [[0, 9], [0, 8], [6, 8]], [[0, 5], [0, 4], [3, 4]]), grammar, literal);
    }
  }
  equal('fixed-case-count', cases, 1072);
  equal('fixed-check-count', checks + 1, 8642);
  emit(encode({kind: 'large-quantifiers-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-large-quantifiers', profile,
    cases, checks, expectedCases: 1072, expectedChecks: 8642,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['compound-body', '^((' + string(E) + 'X)+)!$', join(EC, ascii('x!'))],
    ['second-quantifier', '^((' + string(E) + ')+)(' + string(SIGMA) + '+)!$', join(EC, SIGMA, bang)],
    ['changed-body-flags', '^(((?-i:' + string(E) + '))+)!$', join(EC, bang)],
    ['ascii-closure', '^((a)+)!$', ascii('AA!')],
    ['mixed-closure', '^((k)+)!$', ascii('KK!')],
    ['original-choice', '^((' + string(E) + '|' + string(SIGMA) + ')+)!$', join(EC, bang)],
    ['backreference', '^((' + string(E) + '){4})\\1!$', join(eFour, eFour, bang)],
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
  emit(encode({kind: 'excluded-large-quantifiers-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('LARGE_QUANTIFIERS_ORACLE: ' + failureCount);
})();
