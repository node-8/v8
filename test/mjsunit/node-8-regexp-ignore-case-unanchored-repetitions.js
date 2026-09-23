// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: consuming unanchored ignore-case repetitions and byte-coordinate consumers.
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
  const prefix = join(DL, Z0);  // Seven bytes, three UTF-16 units.
  for (const [name, pattern, part] of [
    ['unicode', string(E), EC], ['mixed', 'a' + string(E), join(ascii('A'), EC)],
  ]) {
    for (const [q, greedy, minimum] of [
      ['+', 5, 1], ['{1,3}', 3, 1], ['{2}', 2, 2], ['{3,}', 5, 3],
      ['{4}', 4, 4], ['{4,8}', 5, 4], ['{4,}', 5, 4], ['{1,64}', 5, 1],
    ]) {
      for (const lazy of [false, true]) {
        const count = lazy ? minimum : greedy;
        const whole = join(...Array(count).fill(part));
        const spans = (start, size) => [[start, start + size * count],
          [start, start + size * count], [start + size * (count - 1), start + size * count]];
        rows.push(row('search-' + name + '-' + q + '-' + lazy,
          '((' + pattern + ')' + q + (lazy ? '?' : '') + ')',
          join(prefix, ...Array(5).fill(part), bang), [whole, whole, part],
          spans(7, part.bytes.length), spans(3, part.stock.length)));
      }
    }
    for (const count of [1, 4, 16, 64]) {
      const whole = join(...Array(count).fill(part));
      const spans = (start, size) => [[start, start + size * count],
        [start + size * (count - 1), start + size * count]];
      rows.push(row('large-' + name + '-' + count, '(' + pattern + '){' + count + '}',
        join(prefix, whole, bang), [whole, part],
        spans(7, part.bytes.length), spans(3, part.stock.length)));
    }
  }
  for (const [name, pattern, value, condition] of [
    ['kelvin', 'k', KELVIN, 'unicode'], ['long-s', 's', LONG_S, 'unicode'],
    ['sharp-s', string(SHARP_S), CAPITAL_SHARP_S, 'unicode'],
    ['e', string(E), EC, 'all'], ['astral', string(D), DL, 'unicode'],
    ['surrogate', string(H), H, 'all'],
  ]) {
    for (const count of [1, 2, 4]) {
      for (const lazy of [false, true]) {
        const whole = join(...Array(count).fill(value));
        const spans = (start, size) => [[start, start + size * count],
          [start, start + size * count], [start + size * (count - 1), start + size * count]];
        rows.push(row('end-' + name + '-' + count + '-' + lazy,
          '((' + pattern + '){' + count + '}' + (lazy ? '?' : '') + ')$',
          join(prefix, whole), [whole, whole, value],
          spans(7, value.bytes.length), spans(3, value.stock.length), condition));
      }
    }
  }
  const originSubject = join(DL, E, EC, bang);
  for (const flag of ['g', 'y']) {
    for (const [name, byteStart, stockStart, which, sticky] of [
      ['before', 0, 0, 'whole', false], ['prefix-interior', 1, 1, 'whole', false],
      ['match', 4, 2, 'whole', true], ['first-interior', 5, 3, 'tail', !byte],
      ['second', 6, 3, 'tail', true], ['end', 9, 5, 'none', false],
    ]) {
      const accepted = which !== 'none' && (flag === 'g' || sticky);
      const whole = which === 'whole' ? join(E, EC, bang) : join(EC, bang);
      rows.push(row('origin-' + flag + '-' + name, '(?<e>' + string(E) + ')+!',
        originSubject, accepted ? [whole, EC] : null,
        [[which === 'whole' ? 4 : 6, 9], [6, 8]],
        [[which === 'whole' ? 2 : 3, 5], [3, 4]], 'all', flag,
        byte ? byteStart : stockStart, {e: 1}));
    }
  }
  rows.push(
    row('nullable-prefix', '(' + string(E) + ')*(' + string(SIGMA) + ')',
      join(prefix, EC, E, SMALL_SIGMA, bang), [join(EC, E, SMALL_SIGMA), E, SMALL_SIGMA],
      [[7, 13], [9, 11], [11, 13]], [[3, 6], [4, 5], [5, 6]]),
    row('empty-prefix', '(' + string(E) + ')*(' + string(SIGMA) + ')',
      join(prefix, SMALL_SIGMA, bang), [SMALL_SIGMA, undefined, SMALL_SIGMA],
      [[7, 9], undefined, [7, 9]], [[3, 4], undefined, [3, 4]]),
    row('nested', '((' + string(E) + ')+){2}!',
      join(prefix, EC, E, EC, bang), [join(EC, E, EC, bang), EC, EC],
      [[7, 14], [11, 13], [11, 13]], [[3, 7], [5, 6], [5, 6]]),
    row('sibling', '(' + string(E) + ')+(' + string(SIGMA) + ')+!',
      join(prefix, EC, SMALL_SIGMA, FINAL_SIGMA, bang),
      [join(EC, SMALL_SIGMA, FINAL_SIGMA, bang), EC, FINAL_SIGMA],
      [[7, 14], [7, 9], [11, 13]], [[3, 7], [3, 4], [5, 6]]),
    row('multiway', '((' + string(E) + ')|(a)|(' + string(SIGMA) + '))+!',
      join(prefix, EC, ascii('A'), SMALL_SIGMA, bang),
      [join(EC, ascii('A'), SMALL_SIGMA, bang), SMALL_SIGMA, undefined, undefined, SMALL_SIGMA],
      [[7, 13], [10, 12], undefined, undefined, [10, 12]],
      [[3, 7], [5, 6], undefined, undefined, [5, 6]]),
    row('branch-order', '((' + string(E) + ')+!|(' + string(E) + ')+)',
      join(prefix, EC, E, bang), [join(EC, E, bang), join(EC, E, bang), E, undefined],
      [[7, 12], [7, 12], [9, 11], undefined], [[3, 6], [3, 6], [4, 5], undefined]),
    row('end-nonmember', '(' + string(E) + '){2}$', join(prefix, EC, bang), null),
    row('end-ascii-fold', '(k){2}$', join(prefix, ascii('Kk')),
      [ascii('Kk'), ascii('k')], [[7, 9], [8, 9]], [[3, 5], [4, 5]])
  );
  for (const [index, bad] of [FF, CONT, BAD, TRUNC, ZTRUNC].entries()) {
    const b = bad.bytes.length;
    const u = bad.stock.length;
    rows.push(
      row('bad-prefix-' + index, '(' + string(E) + ')+!',
        join(bad, EC, E, bang), [join(EC, E, bang), E],
        [[b, b + 5], [b + 2, b + 4]], [[u, u + 3], [u + 1, u + 2]]),
      row('bad-gap-' + index, '(' + string(E) + '){2}!',
        join(EC, bad, EC, E, bang), [join(EC, E, bang), E],
        [[b + 2, b + 7], [b + 4, b + 6]], [[u + 1, u + 4], [u + 2, u + 3]])
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
      equal(id + ':next-anchored-exec', re.exec(string(item.subject)), null, id);
      equal(id + ':next-lastIndex-reset', re.lastIndex, 0, id);
    }
  }
  for (const grammar of ['', 'u', 'v']) {
    for (const literal of [false, true]) {
      for (const item of rows) sample(item, grammar, literal);
    }
  }

  const apiStart = checks;
  const intrinsicExec = RegExp.prototype.exec;
  let apiCases = 0;
  function makeApi(source, flags, slow) {
    const wrap = re => {
      let calls = 0;
      re.exec = function(subject) {
        if (++calls > 32) throw Error('UNANCHORED_REPETITIONS_API_BOUNDED_EXEC');
        return intrinsicExec.call(this, subject);
      };
      return re;
    };
    if (!slow) return new RegExp(source, flags);
    const re = wrap(new RegExp(source, flags));
    re.constructor = {[Symbol.species]: function(source, nextFlags) {
      return wrap(new RegExp(source, nextFlags));
    }};
    return re;
  }
  const apiSubject = join(Z0, EC, E, ascii('#'), EC, ascii('?'));
  const apiMatches = [[join(EC, E), E], [EC, EC]];
  const apiSpans = byte ? [[[3, 7], [5, 7]], [[8, 10], [8, 10]]] :
                         [[[1, 3], [2, 3]], [[4, 5], [4, 5]]];
  const apiReplacement = join(Z0, ascii('<'), E, ascii('>#<'), EC, ascii('>?'));
  const apiSplit = [Z0, E, ascii('#'), EC, ascii('?')];
  const compact = match => match === null ? null :
    [Array.from(match, units), match.index, Array.from(match.indices)];
  const expectedMatches = apiMatches.map((values, i) =>
    [values.map(selected), apiSpans[i][0][0], apiSpans[i]]);
  // Complete every ordinary API control before installing any delegated exec.
  for (const slow of [false, true]) {
    for (const grammar of ['', 'u', 'v']) {
      ++apiCases;
      const tag = 'api-' + grammar + '-' + slow;
      const source = '(' + string(E) + ')+';
      const input = string(apiSubject);
      for (let repeat = 0; repeat < 2; ++repeat) {
        const re = makeApi(source, 'dgi' + grammar, slow);
        for (let index = 0; index < 3; ++index) {
          equal(tag + '-exec-' + index, compact(re.exec(input)),
                index < 2 ? expectedMatches[index] : null, tag);
          equal(tag + '-lastIndex-' + index, re.lastIndex,
                index < 2 ? apiSpans[index][0][1] : 0, tag);
        }
        equal(tag + '-match', input.match(re)?.map(units) ?? null,
              apiMatches.map(values => selected(values[0])), tag);
        equal(tag + '-reset', re.lastIndex, 0, tag);
        equal(tag + '-replace', units(input.replace(re, '<$1>')), selected(apiReplacement), tag);
        const calls = [];
        equal(tag + '-callback-replace', units(input.replace(re, (m, capture, offset, original) => {
          if (calls.length > 3) throw Error('UNANCHORED_REPETITIONS_API_BOUNDED_CALLBACK');
          calls.push([units(m), units(capture), offset, units(original)]);
          return '<' + capture + '>';
        })), selected(apiReplacement), tag);
        equal(tag + '-callback', calls, apiMatches.map((values, i) =>
          [selected(values[0]), selected(values[1]), apiSpans[i][0][0], selected(apiSubject)]), tag);
        const iterator = input.matchAll(makeApi(source, 'dgi' + grammar, slow));
        const actual = [];
        let done = false;
        for (let index = 0; index < 3; ++index) {
          const next = iterator.next();
          if (next.done) { done = true; break; }
          actual.push(compact(next.value));
        }
        equal(tag + '-iterator', [actual, done], [expectedMatches, true], tag);
        equal(tag + '-split', input.split(makeApi(source, 'i' + grammar, slow)).map(
          value => value === undefined ? undefined : units(value)), apiSplit.map(selected), tag);
      }
    }
  }
  equal('fixed-api-cases', apiCases, 6);
  equal('fixed-api-checks', checks - apiStart + 1, 158);

  equal('fixed-case-count', cases, 636);
  equal('fixed-check-count', checks + 1, 5414);
  emit(encode({kind: 'unanchored-repetitions-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-unanchored-repetitions', profile,
    cases, checks, expectedCases: 636, expectedChecks: 5414,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['changed-flags', '^((?-i:' + string(E) + ')|' + string(SIGMA) + '|' + string(Z0) + ')!$', join(EC, bang)],
    ['nullable-root', '(' + string(E) + '|' + string(SIGMA) + '|)', empty],
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
  emit(encode({kind: 'excluded-unanchored-repetitions-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('UNANCHORED_REPETITIONS_ORACLE: ' + failureCount);
})();
