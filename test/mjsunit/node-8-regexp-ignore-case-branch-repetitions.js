// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: ordered choices composed with eligible non-ASCII repetitions.
// Consuming anchored roots, binary-node and repeated-body gates remain.
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
  for (const [q, greedy, lazyCount] of [
    ['?', 1, 0], ['*', 5, 0], ['+', 5, 1], ['{0,2}', 2, 0], ['{1,3}', 3, 1],
    ['{2}', 2, 2], ['{3,}', 5, 3], ['{4}', 4, 4], ['{4,8}', 5, 4], ['{4,}', 5, 4],
  ]) {
    for (const lazy of [false, true]) {
      for (const second of [false, true]) {
        const count = second && lazyCount === 0 ? 0 : lazy ? lazyCount : greedy;
        const part = second ? SMALL_SIGMA : EC;
        const body = repeated(part, count);
        const last = count === 0 ? undefined : part;
        const spans = scale => {
          const capture = count === 0 ? undefined :
            [1 + scale * (count - 1), 1 + scale * count];
          return [[0, 1 + scale * count], [1, 1 + scale * count],
            second ? undefined : capture, second ? capture : undefined];
        };
        rows.push(row('prefix-' + q + '-' + lazy + '-' + second,
          '^A((' + string(E) + ')' + q + (lazy ? '?' : '') + '|(' +
          string(SIGMA) + ')' + q + (lazy ? '?' : '') + ')',
          join(ascii('a'), repeated(part, 5), bang),
          [join(ascii('a'), body), body, second ? undefined : last,
           second ? last : undefined], spans(2), spans(1)));
      }
    }
  }
  for (const base of [4, 64]) {
    for (const second of [false, true]) {
      const count = base + (second ? 1 : 0);
      const part = second ? SMALL_SIGMA : EC;
      for (const delta of [-1, 0, 1]) {
        const body = repeated(part, count + delta);
        const subject = join(body, bang);
        const spans = scale => [[0, scale * count + 1], [0, scale * count],
          second ? undefined : [scale * (count - 1), scale * count],
          second ? [scale * (count - 1), scale * count] : undefined];
        rows.push(row('counter-' + base + '-' + second + '-' + delta,
          '^((' + string(E) + '){' + base + '}|(' + string(SIGMA) + '){' +
          (base + 1) + '})!$', subject,
          delta === 0 ? [subject, body, second ? undefined : part,
                        second ? part : undefined] : null, spans(2), spans(1)));
      }
    }
  }
  const EE = join(EC, E);
  const EEE = join(EE, EC);
  const SS = join(SMALL_SIGMA, FINAL_SIGMA);
  rows.push(
    row('short-first', '^(' + string(E) + '|(' + string(E) + ')+)',
        join(EEE, bang), [EC, EC, undefined],
        [[0, 2], [0, 2], undefined], [[0, 1], [0, 1], undefined]),
    row('long-first', '^((' + string(E) + ')+|' + string(E) + ')',
        join(EEE, bang), [EEE, EEE, EC],
        [[0, 6], [0, 6], [4, 6]], [[0, 3], [0, 3], [2, 3]]),
    row('partial-first-fails', '^((' + string(E) + ')+' + string(SIGMA) +
        '|(' + string(E) + ')+)!$', join(EEE, bang),
        [join(EEE, bang), EEE, undefined, EC],
        [[0, 7], [0, 6], undefined, [4, 6]], [[0, 4], [0, 3], undefined, [2, 3]]),
    row('suffix-forces-second', '^(((' + string(E) + ')+' + string(SIGMA) +
        ')|((' + string(E) + ')+))' + string(SIGMA) + '!$',
        join(EE, SMALL_SIGMA, bang), [join(EE, SMALL_SIGMA, bang), EE, undefined,
        undefined, EE, E],
        [[0, 7], [0, 4], undefined, undefined, [0, 4], [2, 4]],
        [[0, 4], [0, 2], undefined, undefined, [0, 2], [1, 2]]),
    row('equivalent-closures', '^((' + string(E) + ')+|(' + string(EC) + ')+)!$',
        join(EE, bang), [join(EE, bang), EE, E, undefined],
        [[0, 5], [0, 4], [2, 4], undefined], [[0, 3], [0, 2], [1, 2], undefined]),
    row('empty-second', '^((' + string(E) + ')+|)!$', bang,
        [bang, empty, undefined], [[0, 1], [0, 0], undefined],
        [[0, 1], [0, 0], undefined]),
    row('empty-first', '^A(|(' + string(E) + ')+)', join(ascii('a'), EE, bang),
        [ascii('a'), empty, undefined], [[0, 1], [1, 1], undefined],
        [[0, 1], [1, 1], undefined]),
    row('zero-branch', '^((' + string(E) + ')*|(' + string(SIGMA) + ')+)!$',
        bang, [bang, empty, undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined], [[0, 1], [0, 0], undefined, undefined]),
    row('zero-branch-fallback', '^((' + string(E) + ')*|(' + string(SIGMA) + ')+)!$',
        join(SS, bang), [join(SS, bang), SS, undefined, FINAL_SIGMA],
        [[0, 5], [0, 4], undefined, [2, 4]], [[0, 3], [0, 2], undefined, [1, 2]]),
    row('named-global', '^((?<e>' + string(E) + ')+|(?<s>' + string(SIGMA) + ')+)!$',
        join(SS, bang), [join(SS, bang), SS, undefined, FINAL_SIGMA],
        [[0, 5], [0, 4], undefined, [2, 4]], [[0, 3], [0, 2], undefined, [1, 2]],
        'all', 'g', 0, {e: 2, s: 3}),
    row('named-sticky', '^((?<e>' + string(E) + ')+|(?<s>' + string(SIGMA) + ')+)!$',
        join(EE, bang), [join(EE, bang), EE, E, undefined],
        [[0, 5], [0, 4], [2, 4], undefined], [[0, 3], [0, 2], [1, 2], undefined],
        'all', 'y', 0, {e: 2, s: 3}),
    row('global-nonzero', '^(' + string(E) + '+|' + string(SIGMA) + '+)!$',
        join(EE, bang), null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^(' + string(E) + '+|' + string(SIGMA) + '+)!$',
        join(SS, bang), null, undefined, undefined, 'all', 'y', 1),
    row('both-branches-anchored', '^(' + string(E) + ')+!$|^(' + string(SIGMA) + ')+!$',
        join(SS, bang), [join(SS, bang), undefined, FINAL_SIGMA],
        [[0, 5], undefined, [2, 4]], [[0, 3], undefined, [1, 2]]),
    row('choice-before-loop', '^(' + string(E) + '|' + string(SIGMA) +
        ')(' + string(E) + ')+!$', join(SMALL_SIGMA, EE, bang),
        [join(SMALL_SIGMA, EE, bang), SMALL_SIGMA, E],
        [[0, 7], [0, 2], [4, 6]], [[0, 4], [0, 1], [2, 3]]),
    row('choice-after-loop', '^(' + string(E) + ')+(' + string(SIGMA) +
        '|' + string(E) + ')!$', join(EE, SMALL_SIGMA, bang),
        [join(EE, SMALL_SIGMA, bang), E, SMALL_SIGMA],
        [[0, 7], [2, 4], [4, 6]], [[0, 4], [1, 2], [2, 3]]),
    row('sibling-choices', '^(' + string(E) + '+|' + string(SIGMA) + '+)(' +
        string(E) + '+|' + string(SIGMA) + '+)!$', join(EEE, bang),
        [join(EEE, bang), EE, EC], [[0, 7], [0, 4], [4, 6]], [[0, 4], [0, 2], [2, 3]]),
    row('inside-and-outside', '^((' + string(E) + '|' + string(SIGMA) +
        ')+|' + string(E) + '+)!$', join(EC, SMALL_SIGMA, E, bang),
        [join(EC, SMALL_SIGMA, E, bang), join(EC, SMALL_SIGMA, E), E],
        [[0, 7], [0, 6], [4, 6]], [[0, 4], [0, 3], [2, 3]]),
    row('nested-positive', '^((' + string(E) + '+){2}|' + string(SIGMA) + '+)!$',
        join(EEE, bang), [join(EEE, bang), EEE, EC],
        [[0, 7], [0, 6], [4, 6]], [[0, 4], [0, 3], [2, 3]]),
    row('astral-branch', '^((' + string(D) + ')+|(' + string(E) + ')+)!$',
        join(DL, DL, bang), [join(DL, DL, bang), join(DL, DL), DL, undefined],
        [[0, 9], [0, 8], [4, 8], undefined], [[0, 5], [0, 4], [2, 4], undefined], 'unicode'),
    row('surrogate-branch', '^((' + string(H) + ')+|(' + string(E) + ')+)!$',
        join(H, H, bang), [join(H, H, bang), join(H, H), H, undefined],
        [[0, 7], [0, 6], [3, 6], undefined], [[0, 3], [0, 2], [1, 2], undefined]),
    row('sharp-branch', '^((' + string(SHARP_S) + ')+|(' + string(E) + ')+)!$',
        join(CAPITAL_SHARP_S, SHARP_S, bang),
        [join(CAPITAL_SHARP_S, SHARP_S, bang), join(CAPITAL_SHARP_S, SHARP_S), SHARP_S, undefined],
        [[0, 6], [0, 5], [3, 5], undefined], [[0, 3], [0, 2], [1, 2], undefined], 'unicode'),
    ...[FF, CONT, BAD, TRUNC].map((bad, index) =>
      row('malformed-' + index, '^(' + string(E) + '+|' + string(SIGMA) + '+)!$',
          join(EC, bad, bang), null))
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
  equal('fixed-case-count', cases, 468);
  equal('fixed-check-count', checks + 1, 3810);
  emit(encode({kind: 'branch-repetitions-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-branch-repetitions', profile,
    cases, checks, expectedCases: 468, expectedChecks: 3810,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['three-branches', '^(' + string(E) + '+|' + string(SIGMA) + '+|' + string(D) + '+)!$', join(EC, bang)],
    ['nullable-inner', '^((' + string(E) + '?)+' + string(SIGMA) + '|' + string(E) + '+)!$', join(EC, bang)],
    ['changed-flags', '^((?-i:' + string(E) + ')+|' + string(SIGMA) + '+)!$', join(EC, bang)],
    ['ascii-loop', '^(' + string(E) + '+|a+)!$', join(EC, bang)],
    ['mixed-closure', '^(' + string(E) + '+|k+)!$', join(EC, bang)],
    ['partial-anchor', '^' + string(E) + '+!$|' + string(SIGMA) + '+!$', join(EC, bang)],
    ['unanchored-root', '(' + string(E) + '+|' + string(SIGMA) + '+)!$', join(EC, bang)],
    ['nullable-root', '^(' + string(E) + '+|)$', empty],
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
  emit(encode({kind: 'excluded-branch-repetitions-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('BRANCH_REPETITIONS_ORACLE: ' + failureCount);
})();
