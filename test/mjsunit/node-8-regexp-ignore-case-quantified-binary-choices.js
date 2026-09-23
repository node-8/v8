// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: ordered binary choices inside eligible repeated non-ASCII bodies.
// Consuming anchored roots and outside-body choice gates remain.
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

  const pieces = [EC, SMALL_SIGMA, E, FINAL_SIGMA, EC];
  const segment = count => join(...pieces.slice(0, count));
  const P0 = join(EC, SMALL_SIGMA);
  const P1 = join(E, FINAL_SIGMA);
  const split = '(' + string(E) + ')|(' + string(SIGMA) + ')';
  const rows = [];
  for (const [q, greedy, lazyCount] of [
    ['?', 1, 0], ['*', 5, 0], ['+', 5, 1], ['{0,2}', 2, 0], ['{1,3}', 3, 1],
    ['{2}', 2, 2], ['{3,}', 5, 3], ['{4}', 4, 4], ['{4,8}', 5, 4], ['{4,}', 5, 4],
  ]) {
    for (const captured of [false, true]) {
      for (const lazy of [false, true]) {
        const count = lazy ? lazyCount : greedy;
        const last = count === 0 ? undefined : pieces[count - 1];
        const firstBranch = count !== 0 && count % 2 === 1;
        const secondBranch = count !== 0 && count % 2 === 0;
        const spans = scale => {
          const body = count === 0 ? undefined : [1 + scale * (count - 1), 1 + scale * count];
          return [[0, 1 + scale * count], [1, 1 + scale * count], body,
            ...(captured ? [firstBranch ? body : undefined, secondBranch ? body : undefined] : [])];
        };
        rows.push(row('prefix-' + q + '-' + captured + '-' + lazy,
          '^A((' + (captured ? split : string(E) + '|' + string(SIGMA)) + ')' +
          q + (lazy ? '?' : '') + ')', join(ascii('a'), segment(5), bang),
          [join(ascii('a'), segment(count)), segment(count), last,
           ...(captured ? [firstBranch ? last : undefined, secondBranch ? last : undefined] : [])],
          spans(2), spans(1)));
      }
    }
  }
  for (const count of [4, 64]) {
    for (const delta of [-1, 0, 1]) {
      const body = join(...Array.from({length: count + delta},
                                     (_, i) => i % 2 === 0 ? EC : SMALL_SIGMA));
      const subject = join(body, bang);
      rows.push(row('exact-' + count + '-' + delta, '^((' + split + '){' + count + '})!$',
        subject, delta === 0 ? [subject, body, SMALL_SIGMA, undefined, SMALL_SIGMA] : null,
        [[0, 2 * count + 1], [0, 2 * count], [2 * count - 2, 2 * count],
         undefined, [2 * count - 2, 2 * count]],
        [[0, count + 1], [0, count], [count - 1, count], undefined, [count - 1, count]]));
    }
  }
  rows.push(
    row('zero-optional', '^(' + split + ')?!$', bang,
        [bang, undefined, undefined, undefined],
        [[0, 1], undefined, undefined, undefined], [[0, 1], undefined, undefined, undefined]),
    row('zero-star', '^((' + split + ')*)!$', bang,
        [bang, empty, undefined, undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined, undefined]),
    row('named-global', '^((?<a>' + string(E) + ')|(?<b>' + string(SIGMA) + '))+$',
        segment(3), [segment(3), E, E, undefined],
        [[0, 6], [4, 6], [4, 6], undefined], [[0, 3], [2, 3], [2, 3], undefined],
        'all', 'g', 0, {a: 2, b: 3}),
    row('named-sticky', '^((?<a>' + string(E) + ')|(?<b>' + string(SIGMA) + '))+$',
        segment(2), [segment(2), SMALL_SIGMA, undefined, SMALL_SIGMA],
        [[0, 4], [2, 4], undefined, [2, 4]], [[0, 2], [1, 2], undefined, [1, 2]],
        'all', 'y', 0, {a: 2, b: 3}),
    row('global-nonzero', '^(' + split + ')+!$', join(P0, bang),
        null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^(' + split + ')+!$', join(P0, bang),
        null, undefined, undefined, 'all', 'y', 1),
    row('short-first-prefix', '^(((' + string(E) + ')|(' + string(join(E, SIGMA)) + '))+)',
        join(P0, bang), [EC, EC, EC, EC, undefined],
        [[0, 2], [0, 2], [0, 2], [0, 2], undefined],
        [[0, 1], [0, 1], [0, 1], [0, 1], undefined]),
    row('long-first-prefix', '^(((' + string(join(E, SIGMA)) + ')|(' + string(E) + '))+)',
        join(P0, bang), [P0, P0, P0, P0, undefined],
        [[0, 4], [0, 4], [0, 4], [0, 4], undefined],
        [[0, 2], [0, 2], [0, 2], [0, 2], undefined]),
    row('forced-long-branch', '^(((' + string(E) + ')|(' + string(join(E, SIGMA)) + '))+)!$',
        join(P0, bang), [join(P0, bang), P0, P0, undefined, P0],
        [[0, 5], [0, 4], [0, 4], undefined, [0, 4]],
        [[0, 3], [0, 2], [0, 2], undefined, [0, 2]]),
    row('equivalent-closures', '^((' + string(E) + ')|(' + string(EC) + ')){2}!$',
        join(EC, E, bang), [join(EC, E, bang), E, E, undefined],
        [[0, 5], [2, 4], [2, 4], undefined], [[0, 3], [1, 2], [1, 2], undefined]),
    row('branch-rollback', '^(((' + string(join(E, SIGMA)) + ')|(' + string(E) + '))+)(' + string(SIGMA) + ')!$',
        join(P0, P1, bang), [join(P0, P1, bang), join(P0, E), E, undefined, E, FINAL_SIGMA],
        [[0, 9], [0, 6], [4, 6], undefined, [4, 6], [6, 8]],
        [[0, 5], [0, 3], [2, 3], undefined, [2, 3], [3, 4]]),
    row('nested-greedy', '^((' + split + ')+){2}!$', join(P0, P1, bang),
        [join(P0, P1, bang), FINAL_SIGMA, FINAL_SIGMA, undefined, FINAL_SIGMA],
        [[0, 9], [6, 8], [6, 8], undefined, [6, 8]],
        [[0, 5], [3, 4], [3, 4], undefined, [3, 4]]),
    row('nested-lazy', '^((' + split + ')+?){2}!$', join(P0, P1, bang),
        [join(P0, P1, bang), join(SMALL_SIGMA, P1), FINAL_SIGMA, undefined, FINAL_SIGMA],
        [[0, 9], [2, 8], [6, 8], undefined, [6, 8]],
        [[0, 5], [1, 4], [3, 4], undefined, [3, 4]]),
    row('sibling-choices', '^((' + string(E) + '|' + string(SIGMA) + ')+)((' +
        string(E) + '|' + string(SIGMA) + ')+)!$', join(P0, P1, bang),
        [join(P0, P1, bang), join(P0, E), E, FINAL_SIGMA, FINAL_SIGMA],
        [[0, 9], [0, 6], [4, 6], [6, 8], [6, 8]],
        [[0, 5], [0, 3], [2, 3], [3, 4], [3, 4]]),
    row('astral-choice', '^((' + string(D) + ')|(' + string(E) + '))+!$', join(DL, EC, DL, bang),
        [join(DL, EC, DL, bang), DL, DL, undefined],
        [[0, 11], [6, 10], [6, 10], undefined], [[0, 6], [3, 5], [3, 5], undefined], 'unicode'),
    row('surrogate-choice', '^((' + string(H) + ')|(' + string(E) + '))+!$', join(H, E, H, bang),
        [join(H, E, H, bang), H, H, undefined],
        [[0, 9], [5, 8], [5, 8], undefined], [[0, 4], [2, 3], [2, 3], undefined]),
    row('sharp-choice', '^((' + string(E) + ')|(' + string(SHARP_S) + '))+!$',
        join(EC, CAPITAL_SHARP_S, E, SHARP_S, bang),
        [join(EC, CAPITAL_SHARP_S, E, SHARP_S, bang), SHARP_S, undefined, SHARP_S],
        [[0, 10], [7, 9], undefined, [7, 9]], [[0, 5], [3, 4], undefined, [3, 4]], 'unicode'),
    row('malformed-ff', '^(' + split + ')+!$', join(EC, FF, SMALL_SIGMA, bang), null),
    row('malformed-bad', '^(' + split + ')+!$', join(EC, BAD, SMALL_SIGMA, bang), null),
    row('malformed-cont', '^(' + split + ')+!$', join(EC, CONT, SMALL_SIGMA, bang), null)
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
  equal('fixed-case-count', cases, 396);
  equal('fixed-check-count', checks + 1, 3234);
  emit(encode({kind: 'quantified-binary-choices-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-quantified-binary-choices', profile,
    cases, checks, expectedCases: 396, expectedChecks: 3234,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['outer-choice', '^(' + string(E) + '+|' + string(SIGMA) + '+)!$', join(EC, bang)],
    ['three-branches', '^(' + string(E) + '|' + string(SIGMA) + '|' + string(D) + ')+!$', join(EC, bang)],
    ['nullable-branch', '^(' + string(E) + '|)+!$', join(EC, bang)],
    ['nullable-inner', '^(' + string(E) + '?|' + string(SIGMA) + ')+!$', join(EC, bang)],
    ['changed-branch-flags', '^((?-i:' + string(E) + ')|' + string(SIGMA) + ')+!$', join(EC, bang)],
    ['ascii-branch', '^(' + string(E) + '|a)+!$', join(EC, bang)],
    ['mixed-closure', '^(' + string(E) + '|k)+!$', join(EC, bang)],
    ['unanchored-root', '(' + split + ')+!$', join(EC, bang)],
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
  emit(encode({kind: 'excluded-quantified-binary-choices-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('QUANTIFIED_BINARY_CHOICES_ORACLE: ' + failureCount);
})();
