// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: case-sensitive local dotAll byte compositions.
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
  const REPLACEMENT = fixture([0xef,0xbf,0xbd],[0xfffd]);
  const malformed = [
    fixture([0xff],[0xfffd]), fixture([0x80],[0xfffd]),
    fixture([0xe4,0xb8],[0xfffd]),
  ];
  const scopePoints = [
    ['lf', ascii('\n'), true, false], ['cr', ascii('\r'), true, false],
    ['ls', fixture([0xe2,0x80,0xa8],[0x2028]), true, false],
    ['ps', fixture([0xe2,0x80,0xa9],[0x2029]), true, false],
    ['cjk', Z0, false, false], ['surrogate', H, false, false],
    ['replacement', REPLACEMENT, false, false],
    ['truncated', malformed[2], false, false],
    ['continuation', malformed[1], false, false], ['astral', D, false, true],
  ];
  for (const [label, part, newline, astral] of scopePoints) {
    const body = join(part,E);
    const whole = join(body,bang);
    const b = part.bytes.length, s = part.stock.length;
    for (const [name, pattern, rootFlags, enabled] of [
      ['enable', '(?s:.)', '', true], ['disable', '(?-s:.)', 's', false],
      ['nested-disable', '(?s:(?-s:.))', '', false],
      ['nested-enable', '(?-s:(?s:.))', 's', true],
    ]) {
      rows.push(row('scope-' + name + '-' + label,
        '^(' + pattern + string(E) + ')!$', whole,
        newline && !enabled ? null : [whole,body],
        [[0,b+3],[0,b+2]], [[0,s+2],[0,s+1]],
        astral ? 'unicode' : 'all', rootFlags));
    }
    const before = join(ascii('\n'),part,E);
    const after = join(part,ascii('\n'),E);
    rows.push(
      row('scope-sibling-off-' + label, '^((?s:.).' + string(E) + ')!$',
        join(before,bang), newline ? null : [join(before,bang),before],
        [[0,b+4],[0,b+3]], [[0,s+3],[0,s+2]], astral ? 'unicode' : 'all'),
      row('scope-sibling-on-' + label, '^((?-s:.).' + string(E) + ')!$',
        join(after,bang), newline ? null : [join(after,bang),after],
        [[0,b+4],[0,b+3]], [[0,s+3],[0,s+2]], astral ? 'unicode' : 'all', 's')
    );
  }
  rows.push(
    row('scope-no-dot', '^((?s:' + string(E) + '))$', E,
      [E,E], [[0,2],[0,2]], [[0,1],[0,1]]),
    row('scope-nested-no-dot', '^((?s:(?:' + string(E) + ')))$', E,
      [E,E], [[0,2],[0,2]], [[0,1],[0,1]]),
    row('scope-ascii-fallback', '^((?s:a+))$', ascii('aaa'),
      [ascii('aaa'),ascii('aaa')], [[0,3],[0,3]], [[0,3],[0,3]])
  );


  for (const [label, part] of [['lf',ascii('\n')],['cjk',Z0]]) {
    const pair = join(part,E);
    for (const [q,greedy,minimum] of [
      ['+',3,1], ['*',3,0], ['{2}',2,2], ['{0,2}',2,0],
    ]) {
      for (const lazy of [false,true]) {
        const count = lazy ? minimum : greedy;
        const whole = join(...Array(count).fill(pair));
        const spans = size => [[0,size*count],[0,size*count],
          count === 0 ? undefined : [size*(count-1),size*count]];
        const source = '((?s:(.' + string(E) + ')' + q + (lazy?'?':'') + '))';
        rows.push(
          row('repeat-' + label + q + lazy, source, join(pair,pair,pair),
            [whole,whole,count===0?undefined:pair],
            spans(pair.bytes.length),spans(pair.stock.length)),
          row('empty-' + label + q + lazy, '^' + source, empty,
            minimum===0?[empty,empty,undefined]:null,
            [[0,0],[0,0],undefined],[[0,0],[0,0],undefined])
        );
      }
    }
  }
  rows.push(row('case-sensitive-miss','^((?s:' + string(E) + '))$',EC,null));
  for (const flag of ['g','y']) {
    for (const start of [1,2]) {
      const fragment = fixture([0x80],Z0.stock);
      rows.push(row('interior-' + flag + '-' + start,
        '((?s:.))' + string(E),join(Z0,E),
        byte && flag==='y' && start===1?null:[join(fragment,E),fragment],
        [[2,5],[2,3]],[[0,2],[0,1]],'all',flag,byte?start:0));
    }
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
    if (condition === 'never') return false;
    if (condition === 'stock-legacy') return !byte && grammar === '';
    if (condition === 'stock') return !byte;
    if (condition === 'unicode') return byte || grammar !== '';
    if (condition === 'byte-or-stock-legacy') return byte || grammar === '';
    if (condition === 'stock-unicode') return !byte && grammar !== '';
    throw Error('Unknown fixed-oracle condition');
  }
  function sample(item, grammar, literal) {
    ++cases;
    const flags = 'd' + grammar + item.extraFlags;
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
          [false, grammar === 'u', grammar === 'v'], id);
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
            !item.extraFlags.includes('g') && !item.extraFlags.includes('y') ? item.start :
              text === null ? 0 : indices[0][1], id);
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
        if (++calls > 64) throw Error('CS_SCOPED_DOTALL_BOUNDED_EXEC');
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
  const apiPart = malformed[2];
  const apiSubject = join(apiPart, apiPart, ascii('#'), apiPart, ascii('?'));
  const apiValues = [join(apiPart, apiPart), empty, apiPart, empty, empty];
  const spans = byte ? [[0, 4], [4, 4], [5, 7], [7, 7], [8, 8]] :
                       [[0, 2], [2, 2], [3, 4], [4, 4], [5, 5]];
  const replacement = join(ascii('<'), apiPart, apiPart, ascii('><>#<'), apiPart, ascii('><>?<>'));
  const compact = match => [Array.from(match, units), match.index, Array.from(match.indices)];
  const expectedMatches = apiValues.map((value, i) =>
    [[selected(value), selected(value)], spans[i][0], [spans[i], spans[i]]]);
  function boundedAll(input, re) {
    const iterator = input.matchAll(re), output = [];
    for (let i = 0; i < 32; ++i) {
      const next = iterator.next();
      if (next.done) return [output, true];
      output.push(compact(next.value));
    }
    return [output, false];
  }
  for (const slow of [false, true]) {
    for (const grammar of ['', 'u', 'v']) {
      ++apiCases;
      const tag = 'api-' + grammar + '-' + slow;
      const source = '((?s:' + string(REPLACEMENT) + '*))';
      const input = string(apiSubject);
      for (let repeat = 0; repeat < 2; ++repeat) {
        const re = makeApi(source, 'dg' + grammar, slow);
        equal(tag + '-match', input.match(re)?.map(units) ?? null, apiValues.map(selected), tag);
        equal(tag + '-reset', re.lastIndex, 0, tag);
        equal(tag + '-replace', units(input.replace(re, '<$1>')), selected(replacement), tag);
        const calls = [];
        equal(tag + '-callback-result', units(input.replace(re, (m, capture, offset, original) => {
          if (calls.length > 16) throw Error('CS_SCOPED_DOTALL_BOUNDED_CALLBACK');
          calls.push([units(m), units(capture), offset, units(original)]);
          return '<' + capture + '>';
        })), selected(replacement), tag);
        equal(tag + '-callback', calls, apiValues.map((value, i) =>
          [selected(value), selected(value), spans[i][0], selected(apiSubject)]), tag);
        equal(tag + '-all', boundedAll(input, re), [expectedMatches, true], tag);
        equal(tag + '-all-preserves', re.lastIndex, 0, tag);
        equal(tag + '-split', input.split(makeApi(source, grammar, slow)).map(units),
          [empty, join(apiPart, apiPart), ascii('#'), apiPart, ascii('?')].map(selected), tag);
        re.lastIndex = byte ? 4 : 2;
        const at = byte ? 4 : 2;
        const direct = re.exec(input);
        equal(tag + '-direct-empty', direct === null ? null : compact(direct),
          [[[], []], at, [[at, at], [at, at]]], tag);
        equal(tag + '-direct-no-advance', re.lastIndex, at, tag);

      }
    }
  }
  equal('fixed-api-cases', apiCases, 6);
  equal('fixed-api-checks', checks - apiStart + 1, 122);

  equal('fixed-case-count', cases, 600);
  equal('fixed-check-count', checks + 1, 4946);
  emit(encode({kind: 'case-sensitive-scoped-dotall-profile', profile, actualWidth: width}));
  emit(encode({kind: 'case-sensitive-scoped-dotall', profile,
    cases, checks, expectedCases: 600, expectedChecks: 4946,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length, performanceTested: false}));

  const excluded = [
    ['changed-flags', '^((?i:' + string(E) + ')|' + string(SIGMA) + '|' + string(Z0) + ')!$', join(EC, bang)],
    ['lookaround', '^(?=' + string(E) + ')(' + string(E) + '|' + string(SIGMA) + '|' + string(Z0) + ')!$', join(EC, bang)],
  ];
  const observations = [];
  for (const [id, source, subject] of excluded) {
    for (const grammar of ['', 'u', 'v']) {
      for (const literal of [false, true]) {
        const flags = 'd' + grammar;
        try {
          const re = literal ? eval('/' + source + '/' + flags) : new RegExp(source, flags);
          observations.push({id, grammar, literal, actual: snapshot(re.exec(string(subject)))});
        } catch (caught) {
          observations.push({id, grammar, literal, error: caught.name});
        }
      }
    }
  }
  emit(encode({kind: 'excluded-case-sensitive-scoped-dotall-observations', cases: observations.length,
    gating: false, observations}));
  if (failureCount !== 0) throw Error('CS_SCOPED_DOTALL_ORACLE: ' + failureCount);
})();
