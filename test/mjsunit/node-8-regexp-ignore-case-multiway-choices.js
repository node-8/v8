// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: ordered multiway choices with byte-correct prefix handling.
// Existing root, depth and non-ASCII repeated-body gates remain.
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
  const Z0 = fixture([0xe4, 0xb8, 0x80], [0x4e00]);
  const Z1 = fixture([0xe4, 0xb8, 0x81], [0x4e01]);
  const Z2 = fixture([0xe4, 0xb8, 0x82], [0x4e02]);
  const ZTRUNC = fixture([0xe4, 0xb8], [0x00e4, 0x00b8]);
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
      FINAL_SIGMA, SHARP_S, CAPITAL_SHARP_S, D, DL, H, L, U, FF, CONT, BAD, TRUNC,
      Z0, Z1, Z2, ZTRUNC})) {
    equal('fixture-' + name, units(string(value)), selected(value));
  }
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = '', start = 0, names) =>
    ({id, source, subject, values, bytes, stock, condition, extraFlags, start, names});

  const rows = [];
  const cjk = index => fixture([0xe4, 0xb8 + (index >> 6), 0x80 + (index & 63)],
                               [0x4e00 + index]);
  for (const count of [3, 4, 16, 64]) {
    const members = Array.from({length: count}, (_, index) => cjk(index));
    for (const captured of [false, true]) {
      const source = '^(' + members.map(value =>
        captured ? '(' + string(value) + ')' : string(value)).join('|') + ')!$';
      for (const index of [0, Math.floor(count / 2), count - 1, count]) {
        const member = cjk(index);
        const subject = join(member, bang);
        const captures = captured ? members.map((_value, offset) => offset === index ? member : undefined) : [];
        const spans = scale => [[0, scale + 1], [0, scale],
          ...(captured ? members.map((_value, offset) => offset === index ? [0, scale] : undefined) : [])];
        rows.push(row('list-' + count + '-' + captured + '-' + index, source, subject,
          index < count ? [subject, member, ...captures] : null, spans(3), spans(1)));
      }
    }
  }
  for (const [id, value, condition] of [
    ['e', EC, 'all'], ['sigma', FINAL_SIGMA, 'all'], ['sharp', CAPITAL_SHARP_S, 'unicode'],
  ]) {
    rows.push(row('fold-' + id, '^(' + string(E) + '|' + string(SIGMA) + '|' +
      string(SHARP_S) + ')!$', join(value, bang), [join(value, bang), value],
      [[0, value.bytes.length + 1], [0, value.bytes.length]],
      [[0, 2], [0, 1]], condition));
  }
  rows.push(row('fold-nonmember', '^(' + string(E) + '|' + string(SIGMA) + '|' +
      string(SHARP_S) + ')!$', join(Z0, bang), null));
  rows.push(
    row('nonzero-search', string(E) + '|' + string(SIGMA) + '|' + string(Z0),
        join(DL, SMALL_SIGMA, bang), [SMALL_SIGMA], [[4, 6]], [[2, 3]]),
    row('prefix-short-first', '(' + string(Z0) + '|' + string(join(Z0, Z1)) +
        '|' + string(join(Z0, Z2)) + ')', join(Z0, Z1, bang),
        [Z0, Z0], [[0, 3], [0, 3]], [[0, 1], [0, 1]]),
    row('prefix-long-first', '(' + string(join(Z0, Z1)) + '|' + string(Z0) +
        '|' + string(join(Z0, Z2)) + ')', join(Z0, Z1, bang),
        [join(Z0, Z1), join(Z0, Z1)], [[0, 6], [0, 6]], [[0, 2], [0, 2]]),
    row('prefix-forced-long', '^(' + string(Z0) + '|' + string(join(Z0, Z1)) +
        '|' + string(join(Z0, Z2)) + ')!$', join(Z0, Z1, bang),
        [join(Z0, Z1, bang), join(Z0, Z1)], [[0, 7], [0, 6]], [[0, 3], [0, 2]]),
    row('equivalent-closures', '^((' + string(E) + ')|(' + string(EC) + ')|(' +
        string(SIGMA) + '))!$', join(EC, bang),
        [join(EC, bang), EC, EC, undefined, undefined],
        [[0, 3], [0, 2], [0, 2], undefined, undefined],
        [[0, 2], [0, 1], [0, 1], undefined, undefined]),
    row('third-branch-rollback', '^((' + string(E) + ')+' + string(SIGMA) +
        'x|(' + string(E) + ')+' + string(SIGMA) + 'y|(' + string(E) + ')+' +
        string(SIGMA) + ')!$', join(EC, E, SMALL_SIGMA, bang),
        [join(EC, E, SMALL_SIGMA, bang), join(EC, E, SMALL_SIGMA), undefined, undefined, E],
        [[0, 7], [0, 6], undefined, undefined, [2, 4]],
        [[0, 4], [0, 3], undefined, undefined, [1, 2]])
  );
  const pieces = [EC, SMALL_SIGMA, Z0, E, FINAL_SIGMA];
  const segment = count => join(...pieces.slice(0, count));
  const byteOffsets = [0, 2, 4, 7, 9, 11];
  for (const [q, greedy, lazyCount] of [
    ['?', 1, 0], ['*', 5, 0], ['+', 5, 1], ['{0,2}', 2, 0], ['{1,3}', 3, 1],
    ['{2}', 2, 2], ['{3,}', 5, 3], ['{4}', 4, 4], ['{4,8}', 5, 4], ['{4,}', 5, 4],
  ]) {
    for (const lazy of [false, true]) {
      const count = lazy ? lazyCount : greedy;
      const last = count === 0 ? undefined : pieces[count - 1];
      const captures = [1, 2, 0].map(branch => count !== 0 && count % 3 === branch ? last : undefined);
      const spans = offsets => {
        const body = count === 0 ? undefined : [1 + offsets[count - 1], 1 + offsets[count]];
        return [[0, 1 + offsets[count]], [1, 1 + offsets[count]], body,
          ...[1, 2, 0].map(branch => count !== 0 && count % 3 === branch ? body : undefined)];
      };
      rows.push(row('repeat-' + q + '-' + lazy,
        '^A(((' + string(E) + ')|(' + string(SIGMA) + ')|(' + string(Z0) + '))' +
        q + (lazy ? '?' : '') + ')', join(ascii('a'), segment(5), bang),
        [join(ascii('a'), segment(count)), segment(count), last, ...captures],
        spans(byteOffsets), spans([0, 1, 2, 3, 4, 5])));
    }
  }
  const branches = '^((' + string(E) + ')+|(' + string(SIGMA) + ')+|(' + string(Z0) + ')+)!$';
  rows.push(
    row('branch-repeats-first', branches, join(EC, E, bang),
        [join(EC, E, bang), join(EC, E), E, undefined, undefined],
        [[0, 5], [0, 4], [2, 4], undefined, undefined],
        [[0, 3], [0, 2], [1, 2], undefined, undefined]),
    row('branch-repeats-third', branches, join(Z0, Z0, bang),
        [join(Z0, Z0, bang), join(Z0, Z0), undefined, undefined, Z0],
        [[0, 7], [0, 6], undefined, undefined, [3, 6]],
        [[0, 3], [0, 2], undefined, undefined, [1, 2]]),
    row('branch-repeats-nonmember', branches, join(EC, Z0, bang), null),
    row('nullable-choice', '^((' + string(E) + ')|(' + string(SIGMA) + ')|)+!$',
        join(EC, SMALL_SIGMA, bang), [join(EC, SMALL_SIGMA, bang), SMALL_SIGMA, undefined, SMALL_SIGMA],
        [[0, 5], [2, 4], undefined, [2, 4]], [[0, 3], [1, 2], undefined, [1, 2]]),
    row('nullable-required', '^((' + string(E) + ')|(' + string(SIGMA) + ')|)+!$',
        bang, [bang, empty, undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined], [[0, 1], [0, 0], undefined, undefined]),
    row('astral-choice', '^(' + string(E) + '|' + string(D) + '|' + string(H) + ')!$',
        join(DL, bang), [join(DL, bang), DL], [[0, 5], [0, 4]], [[0, 3], [0, 2]], 'unicode'),
    row('surrogate-choice', '^(' + string(E) + '|' + string(D) + '|' + string(H) + ')!$',
        join(H, bang), [join(H, bang), H], [[0, 4], [0, 3]], [[0, 2], [0, 1]]),
    row('named-global', '^((?<a>' + string(E) + ')|(?<b>' + string(SIGMA) +
        ')|(?<c>' + string(Z0) + '))+!$', join(EC, SMALL_SIGMA, Z0, bang),
        [join(EC, SMALL_SIGMA, Z0, bang), Z0, undefined, undefined, Z0],
        [[0, 8], [4, 7], undefined, undefined, [4, 7]],
        [[0, 4], [2, 3], undefined, undefined, [2, 3]], 'all', 'g', 0, {a: 2, b: 3, c: 4}),
    row('named-sticky', '^((?<a>' + string(E) + ')|(?<b>' + string(SIGMA) +
        ')|(?<c>' + string(Z0) + '))+!$', join(EC, SMALL_SIGMA, bang),
        [join(EC, SMALL_SIGMA, bang), SMALL_SIGMA, undefined, SMALL_SIGMA, undefined],
        [[0, 5], [2, 4], undefined, [2, 4], undefined],
        [[0, 3], [1, 2], undefined, [1, 2], undefined], 'all', 'y', 0, {a: 2, b: 3, c: 4}),
    row('global-nonzero', branches, join(EC, bang), null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', branches, join(Z0, bang), null, undefined, undefined, 'all', 'y', 1),
    ...[FF, CONT, BAD, TRUNC, ZTRUNC].map((bad, index) =>
      row('malformed-' + index, '^(' + string(E) + '|' + string(Z0) + '|' +
          string(SIGMA) + ')+!$', join(EC, bad, bang), null))
  );
  for (const value of [ascii('!'), ascii('#'), ascii('%'), Z0, ascii('@')]) {
    const accepted = value !== undefined && value.stock[0] !== 0x40;
    rows.push(row('byte-atoms-' + value.stock[0], '^(!|#|%|' + string(Z0) + ')$',
      value, accepted ? [value, value] : null,
      [[0, value.bytes.length], [0, value.bytes.length]],
      [[0, value.stock.length], [0, value.stock.length]]));
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
      values, index: indices[0][0], indices, input: selected(item.subject), slices: values,
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
  equal('fixed-case-count', cases, 498);
  equal('fixed-check-count', checks + 1, 4054);
  emit(encode({kind: 'multiway-choices-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-multiway-choices', profile,
    cases, checks, expectedCases: 498, expectedChecks: 4054,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['ascii-loop', '^(' + string(E) + '|a|' + string(SIGMA) + ')+!$', join(EC, bang)],
    ['mixed-closure', '^(' + string(E) + '|k|' + string(SIGMA) + ')+!$', join(EC, bang)],
    ['changed-flags', '^((?-i:' + string(E) + ')|' + string(SIGMA) + '|' + string(Z0) + ')!$', join(EC, bang)],
    ['unanchored-loop', '(' + string(E) + '|' + string(SIGMA) + '|' + string(Z0) + ')+!$', join(EC, bang)],
    ['nullable-root', '^(' + string(E) + '|' + string(SIGMA) + '|)$', empty],
    ['decoder-class', '^(' + string(E) + '|.|' + string(SIGMA) + ')!$', join(EC, bang)],
    ['lookaround', '^(?=' + string(E) + ')(' + string(E) + '|' + string(SIGMA) + '|' + string(Z0) + ')!$', join(EC, bang)],
    ['replacement-leaf', '^(' + string(E) + '|' + String.fromCodePoint(0xfffd) + '|' + string(SIGMA) + ')!$', join(FF, bang)],
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
  emit(encode({kind: 'excluded-multiway-choices-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('MULTIWAY_CHOICES_ORACLE: ' + failureCount);
})();
