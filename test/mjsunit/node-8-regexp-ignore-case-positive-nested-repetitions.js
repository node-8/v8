// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: nested non-ASCII consuming loops; nullable inner nodes stay excluded.
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
  const pieces = [EC, E, EC, E, EC, E, EC, E, EC, E];
  const segment = (start, end) => join(...pieces.slice(start, end));
  const P0 = join(EC, SMALL_SIGMA);
  const P1 = join(E, FINAL_SIGMA);
  const rows = [];
  // Every inner block consumes two declared fixtures. Outer bounds determine
  // the successful prefix independently of the RegExp implementation.
  for (const [q, greedy, lazyCount] of [
    ['?', 1, 0], ['*', 4, 0], ['+', 4, 1], ['{0,2}', 2, 0], ['{1,3}', 3, 1],
    ['{2}', 2, 2], ['{3,}', 4, 3], ['{4}', 4, 4], ['{4,8}', 4, 4], ['{4,}', 4, 4],
  ]) {
    for (const innerLazy of [false, true]) {
      for (const outerLazy of [false, true]) {
        const count = outerLazy ? lazyCount : greedy;
        const chars = 2 * count;
        const spans = scale => [[0, scale * (chars + 1)], [0, scale * chars],
          count === 0 ? undefined : [scale * (chars - 2), scale * chars],
          count === 0 ? undefined : [scale * (chars - 1), scale * chars],
          [scale * chars, scale * (chars + 1)]];
        rows.push(row('fixed-block-' + q + '-' + innerLazy + '-' + outerLazy,
          '^(((' + string(E) + '){2}' + (innerLazy ? '?' : '') + ')' +
          q + (outerLazy ? '?' : '') + ')(' + string(E) + ')',
          join(segment(0, 10), bang), [segment(0, chars + 1), segment(0, chars),
            count === 0 ? undefined : segment(chars - 2, chars),
            count === 0 ? undefined : pieces[chars - 1], pieces[chars]],
          spans(2), spans(1)));
      }
    }
  }
  for (const inner of ['+', '{1,3}']) {
    for (const innerLazy of [false, true]) {
      for (const outerLazy of [false, true]) {
        const first = innerLazy ? 1 : 3;
        const subject = join(segment(0, 5), bang);
        rows.push(row('variable-inner-' + inner + '-' + innerLazy + '-' + outerLazy,
          '^(((' + string(E) + ')' + inner + (innerLazy ? '?' : '') +
          '){2}' + (outerLazy ? '?' : '') + ')(' + string(E) + ')!$',
          subject, [subject, segment(0, 4), segment(first, 4), E, EC],
          [[0, 11], [0, 8], [2 * first, 8], [6, 8], [8, 10]],
          [[0, 6], [0, 4], [first, 4], [3, 4], [4, 5]]));
      }
    }
  }
  for (const depth of [2, 3, 6]) {
    for (const lazy of [false, true]) {
      let source = string(E);
      for (let level = 0; level < depth; ++level) {
        source = '(' + source + '){2}' + (lazy ? '?' : '');
      }
      const count = 2 ** depth;
      const body = copies(join(EC, E), count / 2);
      const captures = [body];
      const bytes = [[0, 2 * count + 1], [0, 2 * count]];
      const stock = [[0, count + 1], [0, count]];
      for (let level = depth - 1; level >= 0; --level) {
        const length = 2 ** level;
        captures.push(length === 1 ? E : copies(join(EC, E), length / 2));
        bytes.push([2 * (count - length), 2 * count]);
        stock.push([count - length, count]);
      }
      rows.push(row('depth-' + depth + '-' + lazy, '^(' + source + ')!$',
        join(body, bang), [join(body, bang), ...captures], bytes, stock));
    }
  }
  rows.push(
    row('zero-outer-optional', '^(((' + string(E) + ')+)?)!$', bang,
        [bang, empty, undefined, undefined], [[0, 1], [0, 0], undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined]),
    row('zero-outer-star', '^(((' + string(E) + ')+)*?)!$', bang,
        [bang, empty, undefined, undefined], [[0, 1], [0, 0], undefined, undefined],
        [[0, 1], [0, 0], undefined, undefined]),
    row('named-global', '^((?<block>(?<leaf>' + string(E) + '){1,2}){2})!$',
        join(segment(0, 3), bang), [join(segment(0, 3), bang), segment(0, 3), EC, EC],
        [[0, 7], [0, 6], [4, 6], [4, 6]], [[0, 4], [0, 3], [2, 3], [2, 3]],
        'all', 'g', 0, {block: 2, leaf: 3}),
    row('named-sticky', '^((?<block>(?<leaf>' + string(E) + '){1,2}?){2})!$',
        join(segment(0, 3), bang), [join(segment(0, 3), bang), segment(0, 3), segment(1, 3), EC],
        [[0, 7], [0, 6], [2, 6], [4, 6]], [[0, 4], [0, 3], [1, 3], [2, 3]],
        'all', 'y', 0, {block: 2, leaf: 3}),
    row('global-nonzero', '^(((' + string(E) + '){2}){2})!$', join(segment(0, 4), bang),
        null, undefined, undefined, 'all', 'g', 1),
    row('sticky-nonzero', '^(((' + string(E) + '){2}){2})!$', join(segment(0, 4), bang),
        null, undefined, undefined, 'all', 'y', 1),
    row('compound-nesting', '^(((' + string(E) + ')(' + string(SIGMA) + ')){2}){2}!$',
        join(P0, P1, P0, P1, bang), [join(P0, P1, P0, P1, bang), join(P0, P1), P1, E, FINAL_SIGMA],
        [[0, 17], [8, 16], [12, 16], [12, 14], [14, 16]],
        [[0, 9], [4, 8], [6, 8], [6, 7], [7, 8]]),
    row('partial-nested-iteration', '^(((?:(' + string(E) + ')(' + string(SIGMA) + ')){1,2}){2})(' + string(E) + ')!$',
        join(P0, P1, EC, bang), [join(P0, P1, EC, bang), join(P0, P1), P1, E, FINAL_SIGMA, EC],
        [[0, 11], [0, 8], [4, 8], [4, 6], [6, 8], [8, 10]],
        [[0, 6], [0, 4], [2, 4], [2, 3], [3, 4], [4, 5]]),
    row('sharp-greedy', '^(((' + string(SHARP_S) + '){1,2}){2})!$',
        join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang),
        [join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang),
         join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S), CAPITAL_SHARP_S, CAPITAL_SHARP_S],
        [[0, 9], [0, 8], [5, 8], [5, 8]], [[0, 4], [0, 3], [2, 3], [2, 3]], 'unicode'),
    row('sharp-lazy', '^(((' + string(SHARP_S) + '){1,2}?){2})!$',
        join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang),
        [join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S, bang),
         join(CAPITAL_SHARP_S, SHARP_S, CAPITAL_SHARP_S), join(SHARP_S, CAPITAL_SHARP_S), CAPITAL_SHARP_S],
        [[0, 9], [0, 8], [3, 8], [5, 8]], [[0, 4], [0, 3], [1, 3], [2, 3]], 'unicode'),
    row('astral-nesting', '^(((' + string(D) + '){2}){2})!$', join(copies(DL, 4), bang),
        [join(copies(DL, 4), bang), copies(DL, 4), copies(DL, 2), DL],
        [[0, 17], [0, 16], [8, 16], [12, 16]], [[0, 9], [0, 8], [4, 8], [6, 8]], 'unicode'),
    row('surrogate-nesting', '^(((' + string(H) + '){2}){2})!$', join(copies(H, 4), bang),
        [join(copies(H, 4), bang), copies(H, 4), copies(H, 2), H],
        [[0, 13], [0, 12], [6, 12], [9, 12]], [[0, 5], [0, 4], [2, 4], [3, 4]]),
    row('malformed-ff', '^(((' + string(E) + '){2}){2})!$', join(copies(EC, 3), FF, bang), null),
    row('malformed-bad', '^(((' + string(E) + '){2}){2})!$', join(copies(EC, 3), BAD, bang), null),
    row('malformed-cont', '^(((' + string(E) + '){2}){2})!$', join(copies(EC, 3), CONT, bang), null),
    row('short-inner-block', '^(((' + string(E) + '){2}){2})!$', join(copies(EC, 3), bang), null),
    row('failed-suffix', '^(((' + string(E) + '){2}){2})X$', join(copies(EC, 4), bang), null),
    row('large-nested-counts', '^(((' + string(E) + '){4}){16})!$', join(copies(EC, 64), bang),
        [join(copies(EC, 64), bang), copies(EC, 64), copies(EC, 4), EC],
        [[0, 129], [0, 128], [120, 128], [126, 128]], [[0, 65], [0, 64], [60, 64], [63, 64]]),
    row('nested-and-sibling', '^(((' + string(E) + '){2}){2})(' + string(SIGMA) + '+)!$',
        join(copies(EC, 4), SMALL_SIGMA, bang),
        [join(copies(EC, 4), SMALL_SIGMA, bang), copies(EC, 4), copies(EC, 2), EC, SMALL_SIGMA],
        [[0, 11], [0, 8], [4, 8], [6, 8], [8, 10]], [[0, 6], [0, 4], [2, 4], [3, 4], [4, 5]]),
    row('escaped-inner', '^(((\\u00e9){2}){2})!$', join(segment(0, 4), bang),
        [join(segment(0, 4), bang), segment(0, 4), segment(2, 4), E],
        [[0, 9], [0, 8], [4, 8], [6, 8]], [[0, 5], [0, 4], [2, 4], [3, 4]])
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
  equal('fixed-case-count', cases, 444);
  equal('fixed-check-count', checks + 1, 3618);
  emit(encode({kind: 'positive-nested-repetitions-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-positive-nested-repetitions', profile,
    cases, checks, expectedCases: 444, expectedChecks: 3618,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['ascii-mixed-body', '^((' + string(E) + 'X)+)!$', join(EC, ascii('x!'))],
    ['nested-nullable-body', '^((' + string(E) + ')?)+!$', join(EC, bang)],
    ['changed-body-flags', '^(((?-i:' + string(E) + '))+)!$', join(EC, bang)],
    ['ascii-closure', '^((a)+)!$', ascii('AA!')],
    ['mixed-closure', '^((k)+)!$', ascii('KK!')],
    ['original-choice', '^((' + string(E) + '|' + string(SIGMA) + ')+)!$', join(EC, bang)],
    ['nullable-inner-star', '^(((' + string(E) + ')*)+)!$', join(EC, bang)],
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
  emit(encode({kind: 'excluded-positive-nested-repetitions-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('POSITIVE_NESTED_REPETITIONS_ORACLE: ' + failureCount);
})();
