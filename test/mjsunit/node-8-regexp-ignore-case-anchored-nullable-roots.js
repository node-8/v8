// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: input-anchored nullable ignore-case roots and empty-match consumers.
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
  for (const [name, pattern, part] of [
    ['unicode', string(E), EC], ['mixed', 'a' + string(E), join(ascii('A'), EC)],
  ]) {
    for (const [q, max] of [['?', 1], ['*', 64], ['{0,2}', 2], ['{0,64}', 64]]) {
      for (const lazy of [false, true]) {
        for (const length of [0, 1, 3]) {
          for (const end of [false, true]) {
            const count = end ? length : lazy ? 0 : Math.min(length, max);
            const whole = join(...Array(count).fill(part));
            const subject = join(...Array(length).fill(part));
            const spans = size => [[0, size * count], [0, size * count],
              count ? [size * (count - 1), size * count] : undefined];
            rows.push(row(name + '-' + q + '-' + lazy + '-' + length + '-' + end,
              '^((' + pattern + ')' + q + (lazy ? '?' : '') + ')' + (end ? '$' : ''),
              subject, end && length > max ? null : [whole, whole, count ? part : undefined],
              spans(part.bytes.length), spans(part.stock.length)));
          }
        }
      }
    }
  }
  rows.push(
    row('optional-outer-empty', '^((' + string(E) + ')+)?$', empty,
      [empty, undefined, undefined], [[0, 0], undefined, undefined], [[0, 0], undefined, undefined]),
    row('optional-outer-value', '^((' + string(E) + ')+)?$', join(EC, E),
      [join(EC, E), join(EC, E), E], [[0, 4], [0, 4], [2, 4]], [[0, 2], [0, 2], [1, 2]]),
    row('choice-value-first', '^((' + string(E) + ')|)', EC,
      [EC, EC, EC], [[0, 2], [0, 2], [0, 2]], [[0, 1], [0, 1], [0, 1]]),
    row('choice-empty-first', '^(|(' + string(E) + '))', EC,
      [empty, empty, undefined], [[0, 0], [0, 0], undefined], [[0, 0], [0, 0], undefined]),
    row('choice-empty-forced', '^(|(' + string(E) + '))$', EC,
      [EC, EC, EC], [[0, 2], [0, 2], [0, 2]], [[0, 1], [0, 1], [0, 1]]),
    row('root-choice', '^' + string(E) + '|^', EC,
      [EC], [[0, 2]], [[0, 1]]),
    row('sibling-empty', '^(' + string(E) + ')*(' + string(SIGMA) + ')*$', empty,
      [empty, undefined, undefined], [[0, 0], undefined, undefined], [[0, 0], undefined, undefined]),
    row('sibling-value', '^(' + string(E) + ')*(' + string(SIGMA) + ')*$', join(EC, SMALL_SIGMA),
      [join(EC, SMALL_SIGMA), EC, SMALL_SIGMA], [[0, 4], [0, 2], [2, 4]], [[0, 2], [0, 1], [1, 2]]),
    row('nested-empty', '^((' + string(E) + ')?){2}$', empty,
      [empty, empty, undefined], [[0, 0], [0, 0], undefined], [[0, 0], [0, 0], undefined]),
    row('nested-required-empty', '^((' + string(E) + ')?){2}$', EC,
      [EC, empty, undefined], [[0, 2], [2, 2], undefined], [[0, 1], [1, 1], undefined]),
    row('nested-last', '^((' + string(E) + ')?){2}$', join(EC, E),
      [join(EC, E), E, E], [[0, 4], [2, 4], [2, 4]], [[0, 2], [1, 2], [1, 2]]),
    row('nested-star-empty', '^((' + string(E) + ')?)*$', empty,
      [empty, undefined, undefined], [[0, 0], undefined, undefined], [[0, 0], undefined, undefined]),
    row('nested-plus-empty', '^((' + string(E) + ')?)+$', empty,
      [empty, empty, undefined], [[0, 0], [0, 0], undefined], [[0, 0], [0, 0], undefined]),
    row('zero-count', '^(' + string(E) + '){0}', EC,
      [empty, undefined], [[0, 0], undefined], [[0, 0], undefined]),
    row('surrogate-nullable', '^(' + string(H) + ')?$', H,
      [H, H], [[0, 3], [0, 3]], [[0, 1], [0, 1]]),
    row('astral-nullable', '^(' + string(D) + ')?$', DL,
      [DL, DL], [[0, 4], [0, 4]], [[0, 2], [0, 2]], 'unicode')
  );
  for (const [pattern, value] of [
    ['k', KELVIN], [string(KELVIN), ascii('K')],
    ['s', LONG_S], [string(LONG_S), ascii('S')],
  ]) {
    rows.push(row('mixed-fold-' + pattern, '^(' + pattern + ')*$', value,
      [value, value], [[0, value.bytes.length], [0, value.bytes.length]],
      [[0, 1], [0, 1]], 'unicode'));
  }
  for (const flag of ['g', 'y']) {
    for (const value of [empty, EC]) {
      const size = value.bytes.length;
      rows.push(row('state-' + flag + '-' + size, '^(?<e>' + string(E) + ')*$', value,
        [value, size ? EC : undefined], [[0, size], size ? [0, size] : undefined],
        [[0, size ? 1 : 0], size ? [0, 1] : undefined], 'all', flag, 0, {e: 1}));
    }
    rows.push(row('nonzero-' + flag, '^(' + string(E) + ')*', EC,
      null, undefined, undefined, 'all', flag, 1));
  }
  for (const [index, bad] of [FF, CONT, BAD, TRUNC, ZTRUNC].entries()) {
    rows.push(
      row('malformed-empty-' + index, '^(' + string(E) + ')*', bad,
        [empty, undefined], [[0, 0], undefined], [[0, 0], undefined]),
      row('malformed-consume-' + index, '^(' + string(E) + ')*', join(EC, bad),
        [EC, EC], [[0, 2], [0, 2]], [[0, 1], [0, 1]]),
      row('malformed-end-' + index, '^(' + string(E) + ')*$', join(EC, bad), null)
    );
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
      const next = snapshot(re.exec(string(item.subject)));
      equal(id + ':next-anchored-exec', next,
            text !== null && indices[0][1] === 0 ? expected : null, id);
      equal(id + ':next-lastIndex-reset', re.lastIndex, 0, id);
    }
  }
  for (const grammar of ['', 'u', 'v']) {
    for (const literal of [false, true]) {
      for (const item of rows) sample(item, grammar, literal);
    }
  }

  // Fast controls precede delegated exec/species installation.
  const apiStart = checks;
  const intrinsicExec = RegExp.prototype.exec;
  let apiCases = 0;
  function makeApi(source, flags, slow) {
    const wrap = re => {
      let calls = 0;
      re.exec = function(subject) {
        if (++calls > 8) throw Error('ANCHORED_NULLABLE_ROOTS_API_BOUNDED_EXEC');
        return intrinsicExec.call(this, subject);
      };
      return re;
    };
    if (!slow) return new RegExp(source, flags);
    const re = wrap(new RegExp(source, flags));
    re.constructor = {[Symbol.species]: (function(source, nextFlags) {
      return wrap(new RegExp(source, nextFlags));
    })};
    return re;
  }
  const apiRows = [
    ['greedy', '^' + string(E) + '*', join(EC, E, bang), join(EC, E), bang,
      [empty, bang]],
    ['lazy', '^' + string(E) + '*?', join(EC, E, bang), empty, join(EC, E, bang),
      [join(EC, E, bang)]],
    ['empty-input', '^' + string(E) + '*', empty, empty, empty, []],
    ['nonmember', '^' + string(E) + '*', join(DL, bang), empty, join(DL, bang),
      [join(DL, bang)]],
    ['required-end', '^' + string(E) + '*$', join(EC, E), join(EC, E), empty,
      [empty, empty]],
  ];
  for (const slow of [false, true]) {
    for (const grammar of ['', 'u', 'v']) {
      for (const [name, source, subject, matched, suffix, split] of apiRows) {
        ++apiCases;
        const tag = 'api-' + name + '-' + grammar + '-' + slow;
        const input = string(subject);
        for (let repeat = 0; repeat < 2; ++repeat) {
          const re = makeApi(source, 'gi' + grammar, slow);
          equal(tag + '-match', input.match(re)?.map(units) ?? null, [selected(matched)], tag);
          equal(tag + '-reset', re.lastIndex, 0, tag);
          equal(tag + '-replace', units(input.replace(re, '|')),
                selected(join(ascii('|'), suffix)), tag);
          const calls = [];
          equal(tag + '-callback-replace', units(input.replace(re, (m, offset, original) => {
            if (calls.length > 2) throw Error('ANCHORED_NULLABLE_ROOTS_API_BOUNDED_CALLBACK');
            calls.push([units(m), offset, units(original)]);
            return '|';
          })), selected(join(ascii('|'), suffix)), tag);
          equal(tag + '-callback', calls, [[selected(matched), 0, selected(subject)]], tag);
          const iterator = input.matchAll(makeApi(source, 'gi' + grammar, slow));
          const first = iterator.next();
          equal(tag + '-iterator-first', first.done ? null :
            [units(first.value[0]), first.value.index], [selected(matched), 0], tag);
          equal(tag + '-iterator-done', iterator.next().done, true, tag);
          equal(tag + '-split', input.split(makeApi(source, 'i' + grammar, slow)).map(units),
                split.map(selected), tag);
        }
      }
    }
  }
  equal('fixed-api-cases', apiCases, 30);
  equal('fixed-api-checks', checks - apiStart + 1, 482);

  equal('fixed-case-count', cases, 822);
  equal('fixed-check-count', checks + 1, 7154);
  emit(encode({kind: 'anchored-nullable-roots-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-anchored-nullable-roots', profile,
    cases, checks, expectedCases: 822, expectedChecks: 7154,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['changed-flags', '^((?-i:' + string(E) + ')|' + string(SIGMA) + '|' + string(Z0) + ')!$', join(EC, bang)],
    ['unanchored-loop', '(' + string(E) + '|' + string(SIGMA) + '|' + string(Z0) + ')+!$', join(EC, bang)],
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
  emit(encode({kind: 'excluded-anchored-nullable-roots-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('ANCHORED_NULLABLE_ROOTS_ORACLE: ' + failureCount);
})();
