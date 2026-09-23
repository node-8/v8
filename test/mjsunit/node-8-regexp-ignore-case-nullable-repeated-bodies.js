// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: nullable non-ASCII repeated bodies with existing progress guards.
// Consuming anchored roots, binary-node and non-ASCII closure gates remain.
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

  const rows = [];
  const repeated = (part, count) => join(...Array(count).fill(part));
  for (const [q, minimum, maximum] of [
    ['?', 0, 1], ['*', 0, Infinity], ['+', 1, Infinity], ['{0,2}', 0, 2],
    ['{1,3}', 1, 3], ['{2}', 2, 2], ['{3,}', 3, Infinity], ['{4,8}', 4, 8],
  ]) {
    for (const lazy of [false, true]) {
      for (const count of [0, 1, 2, 4, 5]) {
        const body = repeated(EC, count);
        const subject = join(body, bang);
        const skipped = count === 0 && minimum === 0;
        const lastEmpty = count < minimum;
        const capture = skipped ? undefined : lastEmpty ? empty : EC;
        const inner = skipped || lastEmpty ? undefined : EC;
        const spans = scale => [[0, scale * count + 1],
          skipped ? undefined : [scale * (lastEmpty ? count : count - 1), scale * count],
          skipped || lastEmpty ? undefined : [scale * (count - 1), scale * count]];
        rows.push(row('optional-' + q + '-' + lazy + '-' + count,
          '^((' + string(E) + ')?)' + q + (lazy ? '?' : '') + '!$', subject,
          count <= maximum ? [subject, capture, inner] : null, spans(2), spans(1)));
      }
    }
  }
  for (const count of [2, 4, 64]) {
    for (const lazy of [false, true]) {
      // A lazy 64-way optional chain on 64 units explores exponentially many paths.
      const lengths = count === 64 ? [0, 1, 2, lazy ? 3 : 64] : [0, 1, count, count + 1];
      for (const length of lengths) {
        const body = repeated(EC, length);
        const subject = join(body, bang);
        const lastEmpty = lazy ? length === 0 : length < count;
        const spans = scale => [[0, scale * length + 1],
          [scale * (lastEmpty ? length : length - 1), scale * length],
          lastEmpty ? undefined : [scale * (length - 1), scale * length]];
        rows.push(row('exact-' + count + '-' + lazy + '-' + length,
          '^((' + string(E) + ')?' + (lazy ? '?' : '') + '){' + count + '}!$',
          subject, length <= count ? [subject, lastEmpty ? empty : EC,
                                     lastEmpty ? undefined : EC] : null,
          spans(2), spans(1)));
      }
    }
  }
  const EE = join(EC, E);
  const SS = join(SMALL_SIGMA, FINAL_SIGMA);
  rows.push(
    row('nested-star-required', '^((' + string(E) + ')*){2}!$', join(EE, bang),
        [join(EE, bang), empty, undefined], [[0, 5], [4, 4], undefined],
        [[0, 3], [2, 2], undefined]),
    row('nested-lazy-star-required', '^((' + string(E) + ')*?){2}!$', join(EE, bang),
        [join(EE, bang), EE, E], [[0, 5], [0, 4], [2, 4]], [[0, 3], [0, 2], [1, 2]]),
    row('star-star', '^((' + string(E) + ')*)*!$', join(EE, bang),
        [join(EE, bang), EE, E], [[0, 5], [0, 4], [2, 4]], [[0, 3], [0, 2], [1, 2]]),
    row('star-lazy-star', '^((' + string(E) + ')*?)*!$', join(EE, bang),
        [join(EE, bang), E, E], [[0, 5], [2, 4], [2, 4]], [[0, 3], [1, 2], [1, 2]]),
    row('empty-second-branch', '^((' + string(E) + ')|)+!$', join(EE, bang),
        [join(EE, bang), E, E], [[0, 5], [2, 4], [2, 4]], [[0, 3], [1, 2], [1, 2]]),
    row('empty-first-branch', '^(|(' + string(E) + '))+!$', join(EE, bang),
        [join(EE, bang), E, E], [[0, 5], [2, 4], [2, 4]], [[0, 3], [1, 2], [1, 2]]),
    row('empty-first-required', '^(|(' + string(E) + '))+!$', bang,
        [bang, empty, undefined], [[0, 1], [0, 0], undefined], [[0, 1], [0, 0], undefined]),
    row('empty-first-skipped', '^(|(' + string(E) + '))*!$', bang,
        [bang, undefined, undefined], [[0, 1], undefined, undefined], [[0, 1], undefined, undefined]),
    row('optional-sequence', '^((' + string(E) + ')?(' + string(SIGMA) + ')?)+!$',
        join(EC, SMALL_SIGMA, E, bang), [join(EC, SMALL_SIGMA, E, bang), E, E, undefined],
        [[0, 7], [4, 6], [4, 6], undefined], [[0, 4], [2, 3], [2, 3], undefined]),
    row('nullable-priority', '^((' + string(E) + ')?(' + string(SIGMA) + ')??)*!$',
        join(EC, SMALL_SIGMA, bang), [join(EC, SMALL_SIGMA, bang), SMALL_SIGMA, undefined, SMALL_SIGMA],
        [[0, 5], [2, 4], undefined, [2, 4]], [[0, 3], [1, 2], undefined, [1, 2]]),
    row('nested-start-anchor', '^((^' + string(E) + ')?){2}!$', join(EC, bang),
        [join(EC, bang), empty, undefined], [[0, 3], [2, 2], undefined],
        [[0, 2], [1, 1], undefined]),
    row('nested-end-anchor', '^A((' + string(E) + '$)?){2}', join(ascii('a'), EC),
        [join(ascii('a'), EC), empty, undefined], [[0, 3], [3, 3], undefined],
        [[0, 2], [2, 2], undefined]),
    row('named-global', '^((?<e>' + string(E) + ')?(?<s>' + string(SIGMA) + ')?)+!$',
        join(EC, SMALL_SIGMA, E, bang), [join(EC, SMALL_SIGMA, E, bang), E, E, undefined],
        [[0, 7], [4, 6], [4, 6], undefined], [[0, 4], [2, 3], [2, 3], undefined],
        'all', 'g', 0, {e: 2, s: 3}),
    row('named-sticky', '^((?<e>' + string(E) + ')?(?<s>' + string(SIGMA) + ')?)+!$',
        join(EC, SMALL_SIGMA, bang), [join(EC, SMALL_SIGMA, bang), join(EC, SMALL_SIGMA), EC, SMALL_SIGMA],
        [[0, 5], [0, 4], [0, 2], [2, 4]], [[0, 3], [0, 2], [0, 1], [1, 2]],
        'all', 'y', 0, {e: 2, s: 3}),
    row('global-nonzero', '^((' + string(E) + ')?)+!$', join(EE, bang),
        null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^((' + string(E) + ')?)+!$', join(EE, bang),
        null, undefined, undefined, 'all', 'y', 1),
    row('astral-optional', '^((' + string(D) + ')?)+!$', join(DL, DL, bang),
        [join(DL, DL, bang), DL, DL], [[0, 9], [4, 8], [4, 8]],
        [[0, 5], [2, 4], [2, 4]], 'unicode'),
    row('surrogate-optional', '^((' + string(H) + ')?)+!$', join(H, H, bang),
        [join(H, H, bang), H, H], [[0, 7], [3, 6], [3, 6]], [[0, 3], [1, 2], [1, 2]]),
    row('sharp-optional', '^((' + string(SHARP_S) + ')?)+!$', join(CAPITAL_SHARP_S, SHARP_S, bang),
        [join(CAPITAL_SHARP_S, SHARP_S, bang), SHARP_S, SHARP_S],
        [[0, 6], [3, 5], [3, 5]], [[0, 3], [1, 2], [1, 2]], 'unicode'),
    ...[FF, CONT, BAD, TRUNC].map((bad, index) =>
      row('malformed-' + index, '^((' + string(E) + ')?)+!$', join(EC, bad, bang), null))
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
  equal('fixed-case-count', cases, 762);
  equal('fixed-check-count', checks + 1, 6162);
  emit(encode({kind: 'nullable-repeated-bodies-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-nullable-repeated-bodies', profile,
    cases, checks, expectedCases: 762, expectedChecks: 6162,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['three-branches', '^(' + string(E) + '?|' + string(SIGMA) + '?|' + string(D) + '?)+!$', join(EC, bang)],
    ['changed-flags', '^((?-i:' + string(E) + ')?)+!$', join(EC, bang)],
    ['ascii-loop', '^(' + string(E) + '?a?)+!$', join(EC, bang)],
    ['mixed-closure', '^(' + string(E) + '?k?)+!$', join(EC, bang)],
    ['unanchored-root', '(' + string(E) + '?)+!$', join(EC, bang)],
    ['nullable-root', '^(' + string(E) + '?)+$', empty],
    ['lookaround-body', '^(?=' + string(E) + ')(' + string(E) + '?)+!$', join(EC, bang)],
    ['replacement-leaf', '^(' + String.fromCodePoint(0xfffd) + '?)+!$', join(FF, bang)],
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
  emit(encode({kind: 'excluded-nullable-repeated-bodies-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('NULLABLE_REPEATED_BODIES_ORACLE: ' + failureCount);
})();
