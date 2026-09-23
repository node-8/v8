// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: anchored consuming mixed ASCII/Unicode repeated literal bodies.
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
  const KELVIN = fixture([0xe2, 0x84, 0xaa], [0x212a]);
  const LONG_S = fixture([0xc5, 0xbf], [0x017f]);
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
  for (const [name, value] of Object.entries({KELVIN, LONG_S, E, EC, SIGMA, SMALL_SIGMA,
      FINAL_SIGMA, SHARP_S, CAPITAL_SHARP_S, D, DL, H, L, U, FF, CONT, BAD, TRUNC,
      Z0, Z1, Z2, ZTRUNC})) {
    equal('fixture-' + name, units(string(value)), selected(value));
  }
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = '', start = 0, names) =>
    ({id, source, subject, values, bytes, stock, condition, extraFlags, start, names});

  const rows = [];
  // Prefix widths and all input bytes are declared by the fixtures above.
  for (let letter = 65; letter <= 90; ++letter) {
    for (const lower of [false, true]) {
      const source = String.fromCharCode(letter + (lower ? 32 : 0));
      const run = ascii(source + String.fromCharCode(letter + (lower ? 0 : 32)) + source);
      const subject = join(EC, run, bang);
      rows.push(row('ascii-' + letter + '-' + lower,
        '^' + string(E) + '(' + source + ')+!$', subject,
        [subject, ascii(source)], [[0, 6], [4, 5]], [[0, 5], [3, 4]]));
    }
  }
  for (let code = 0; code < 128; ++code) {
    const escaped = '\\x' + code.toString(16).padStart(2, '0');
    const value = fixture([code], [code]);
    const subject = join(EC, value, value, bang);
    rows.push(row('ascii-byte-' + code, '^' + string(E) + '(' + escaped + ')+!$',
      subject, [subject, value], [[0, 5], [3, 4]], [[0, 4], [2, 3]]));
  }
  for (const [name, members, outsider] of [
    ['k', [ascii('K'), ascii('k'), KELVIN], ascii('s')],
    ['s', [ascii('S'), ascii('s'), LONG_S], ascii('k')],
  ]) {
    for (let from = 0; from < 3; ++from) {
      for (let to = 0; to < 4; ++to) {
        const value = to < 3 ? members[to] : outsider;
        const repeated = join(value, value);
        const subject = join(repeated, bang);
        const size = value.bytes.length;
        const condition = from === 2 && to < 2 || from < 2 && to === 2 ? 'unicode' : 'all';
        rows.push(row('mixed-' + name + '-' + from + '-' + to,
          '^(' + string(members[from]) + ')+!$', subject,
          to < 3 ? [subject, value] : null,
          [[0, 2 * size + 1], [size, 2 * size]], [[0, 3], [1, 2]], condition));
      }
    }
  }
  for (const [q, greedy, lazyCount] of [
    ['?', 1, 0], ['*', 5, 0], ['+', 5, 1], ['{0,2}', 2, 0], ['{1,3}', 3, 1],
    ['{2}', 2, 2], ['{3,}', 5, 3], ['{4}', 4, 4], ['{4,8}', 5, 4], ['{4,}', 5, 4],
  ]) {
    for (const lazy of [false, true]) {
      const count = lazy ? lazyCount : greedy;
      const part = join(ascii('A'), EC);
      const segment = join(...Array(count).fill(part));
      rows.push(row('sequence-' + q + '-' + lazy,
        '^!((' + 'a' + string(E) + ')' + q + (lazy ? '?' : '') + ')',
        join(bang, ...Array(5).fill(part), ascii('?')),
        [join(bang, segment), segment, count ? part : undefined],
        [[0, 1 + 3 * count], [1, 1 + 3 * count],
          count ? [1 + 3 * (count - 1), 1 + 3 * count] : undefined],
        [[0, 1 + 2 * count], [1, 1 + 2 * count],
          count ? [1 + 2 * (count - 1), 1 + 2 * count] : undefined]));
    }
  }
  for (const count of [1, 4, 16, 64]) {
    for (const lazy of [false, true]) {
      const run = join(...Array(count).fill(ascii('A')));
      const subject = join(EC, run, bang);
      rows.push(row('large-' + count + '-' + lazy,
        '^' + string(E) + '(a){' + count + '}' + (lazy ? '?' : '') + '!$', subject,
        [subject, ascii('A')], [[0, count + 3], [count + 1, count + 2]],
        [[0, count + 2], [count, count + 1]]));
    }
  }
  rows.push(
    row('mixed-width-run', '^((k)+)!$', join(ascii('k'), KELVIN, ascii('K'), bang),
      [join(ascii('k'), KELVIN, ascii('K'), bang), join(ascii('k'), KELVIN, ascii('K')), ascii('K')],
      [[0, 6], [0, 5], [4, 5]], [[0, 4], [0, 3], [2, 3]], 'unicode'),
    row('mixed-width-lazy-backtrack', '^(k)+?k!$', join(KELVIN, ascii('k'), KELVIN, bang),
      [join(KELVIN, ascii('k'), KELVIN, bang), ascii('k')],
      [[0, 8], [3, 4]], [[0, 4], [1, 2]], 'unicode'),
    row('mixed-nullable', '^((k)?){2}!$', join(KELVIN, bang),
      [join(KELVIN, bang), empty, undefined], [[0, 4], [3, 3], undefined],
      [[0, 2], [1, 1], undefined], 'unicode'),
    row('ascii-nullable', '^' + string(E) + '((a)?)+!$', join(EC, bang),
      [join(EC, bang), empty, undefined], [[0, 3], [2, 2], undefined],
      [[0, 2], [1, 1], undefined]),
    row('nested', '^((a' + string(E) + '){1,2}){2}!$',
      join(ascii('A'), EC, ascii('a'), E, ascii('A'), EC, bang),
      [join(ascii('A'), EC, ascii('a'), E, ascii('A'), EC, bang), join(ascii('A'), EC), join(ascii('A'), EC)],
      [[0, 10], [6, 9], [6, 9]], [[0, 7], [4, 6], [4, 6]]),
    row('sibling', '^(' + string(E) + 'a)+(' + string(SIGMA) + 'b)+!$',
      join(EC, ascii('A'), SMALL_SIGMA, ascii('B'), bang),
      [join(EC, ascii('A'), SMALL_SIGMA, ascii('B'), bang), join(EC, ascii('A')), join(SMALL_SIGMA, ascii('B'))],
      [[0, 7], [0, 3], [3, 6]], [[0, 5], [0, 2], [2, 4]]),
    row('choice-clearing', '^((a)|(' + string(E) + ')|(k))+!$', join(ascii('A'), EC, KELVIN, bang),
      [join(ascii('A'), EC, KELVIN, bang), KELVIN, undefined, undefined, KELVIN],
      [[0, 7], [3, 6], undefined, undefined, [3, 6]],
      [[0, 4], [2, 3], undefined, undefined, [2, 3]], 'unicode'),
    row('ordered-short', '^((a)|(' + string(E) + 'a)|(' + string(E) + '))+!$',
      join(EC, ascii('A'), bang), [join(EC, ascii('A'), bang), join(EC, ascii('A')), undefined, join(EC, ascii('A')), undefined],
      [[0, 4], [0, 3], undefined, [0, 3], undefined],
      [[0, 3], [0, 2], undefined, [0, 2], undefined]),
    row('surrogate-ascii', '^(' + string(H) + 'a)+!$', join(H, ascii('A'), bang),
      [join(H, ascii('A'), bang), join(H, ascii('A'))], [[0, 5], [0, 4]], [[0, 3], [0, 2]]),
    row('astral-ascii', '^(' + string(D) + 'a)+!$', join(DL, ascii('A'), bang),
      [join(DL, ascii('A'), bang), join(DL, ascii('A'))], [[0, 6], [0, 5]], [[0, 4], [0, 3]], 'unicode')
  );
  for (const flag of ['g', 'y']) {
    rows.push(
      row('named-' + flag, '^((?<a>a)|(?<e>' + string(E) + '))+!$', join(ascii('A'), EC, bang),
        [join(ascii('A'), EC, bang), EC, undefined, EC],
        [[0, 4], [1, 3], undefined, [1, 3]], [[0, 3], [1, 2], undefined, [1, 2]],
        'all', flag, 0, {a: 2, e: 3}),
      row('nonzero-' + flag, '^(' + string(E) + 'a)+!$', join(EC, ascii('A'), bang),
        null, undefined, undefined, 'all', flag, 1)
    );
  }
  for (const [index, bad] of [FF, CONT, BAD, TRUNC, ZTRUNC].entries()) {
    rows.push(row('malformed-' + index, '^(' + string(E) + 'a|k)+!$',
      join(EC, ascii('A'), bad, bang), null));
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
  equal('fixed-case-count', cases, 1506);
  equal('fixed-check-count', checks + 1, 12120);
  emit(encode({kind: 'mixed-loop-bodies-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-mixed-loop-bodies', profile,
    cases, checks, expectedCases: 1506, expectedChecks: 12120,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
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
  emit(encode({kind: 'excluded-mixed-loop-bodies-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('MIXED_LOOP_BODIES_ORACLE: ' + failureCount);
})();
