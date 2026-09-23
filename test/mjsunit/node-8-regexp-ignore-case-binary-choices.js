// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile correctness test; the external driver verifies intended profile.
// Three-plus-choice observations remain separate from binary-choice acceptance.
'use strict';

(() => {
  const actualWidth = String.fromCodePoint(233).length;
  if (actualWidth !== 1 && actualWidth !== 2) throw Error('Unknown string profile');
  const byte = actualWidth === 2;
  const profile = byte ? 'node8' : 'stock';
  const emit = typeof print === 'function' ? print : console.log;

  const fixture = (bytes, stock) => ({bytes, stock});
  const ascii = text => {
    const values = Array.from(text, ch => ch.charCodeAt(0));
    if (values.some(value => value > 127)) throw Error('Non-ASCII fixture');
    return fixture(values, values);
  };
  const join = (...parts) => fixture(parts.flatMap(p => p.bytes),
                                    parts.flatMap(p => p.stock));
  const selected = value => byte ? value.bytes : value.stock;
  const string = value => String.fromCharCode(...selected(value));
  const units = value => {
    const values = [];
    for (let i = 0; i < value.length; ++i) values.push(value.charCodeAt(i));
    return values;
  };
  const E = fixture([0xc3, 0xa9], [0x00e9]);
  const EC = fixture([0xc3, 0x89], [0x00c9]);
  const K = fixture([0xe2, 0x84, 0xaa], [0x212a]);
  const S = fixture([0xc5, 0xbf], [0x017f]);
  const SIGMA = fixture([0xce, 0xa3], [0x03a3]);
  const FINAL_SIGMA = fixture([0xcf, 0x82], [0x03c2]);
  const DESERET = fixture([0xf0, 0x90, 0x90, 0x80], [0xd801, 0xdc00]);
  const SMALL_DESERET = fixture([0xf0, 0x90, 0x90, 0xa8], [0xd801, 0xdc28]);
  const CJK = fixture([0xe4, 0xb8, 0xad], [0x4e2d]);
  const SHARP_S = fixture([0xc3, 0x9f], [0x00df]);
  const CAPITAL_SHARP_S = fixture([0xe1, 0xba, 0x9e], [0x1e9e]);
  const H = fixture([0xed, 0xa0, 0x80], [0xd800]);
  const L = fixture([0xed, 0xb0, 0x80], [0xdc00]);
  const U = fixture([0xf0, 0x90, 0x80, 0x80], [0xd800, 0xdc00]);
  const RAW_FF = fixture([0xff], [0x00ff]);
  const SNOW = fixture([0xe2, 0x98, 0x83], [0x2603]);
  const e = byte ? 2 : 1;
  const h = byte ? 3 : 1;
  const astral = byte ? 4 : 2;
  let checks = 0;
  let cases = 0;
  let failureCount = 0;
  const failures = [];
  const failedCases = new Set();
  const encode = value => JSON.stringify(value, (_key, item) =>
    item === undefined ? {undefined: true} : item);
  function equal(label, actual, expected, caseId = label) {
    ++checks;
    if (encode(actual) === encode(expected)) return;
    ++failureCount;
    failedCases.add(caseId);
    if (failures.length < 32) failures.push({label, actual, expected});
  }
  for (const [label, value] of Object.entries({E, EC, K, S, SIGMA, FINAL_SIGMA, CJK,
      DESERET, SMALL_DESERET, SHARP_S, CAPITAL_SHARP_S, H, L, U, RAW_FF, SNOW})) {
    equal('fixture-' + label, units(string(value)), selected(value));
  }

  function snapshot(match) {
    if (match === null) return null;
    return {
      values: Array.from(match, value => value === undefined ? undefined : units(value)),
      index: match.index,
      indices: Array.from(match.indices),
      groups: match.groups === undefined ? null : Object.fromEntries(
        Object.entries(match.groups).map(([name, value]) => [name,
          value === undefined ? undefined : units(value)])),
      groupIndices: match.indices.groups === undefined ? null : match.indices.groups,
      input: units(match.input),
    };
  }
  function wanted(subject, text, indices, names) {
    if (text === null) return null;
    return {values: text.map(value => value === undefined ? undefined : selected(value)),
      index: indices[0][0], indices,
      groups: names === undefined ? null : Object.fromEntries(
        Object.entries(names).map(([name, capture]) => [name,
          text[capture] === undefined ? undefined : selected(text[capture])])),
      groupIndices: names === undefined ? null : Object.fromEntries(
        Object.entries(names).map(([name, capture]) => [name, indices[capture]])),
      input: selected(subject)};
  }
  function compile(id, source, flags, literal) {
    let re;
    let error;
    try { re = literal ? eval('/' + source + '/' + flags) : new RegExp(source, flags); }
    catch (caught) { error = caught.name; }
    equal(id + ':compile', error, undefined, id);
    if (error !== undefined) return undefined;
    equal(id + ':source', units(re.source), units(source), id);
    equal(id + ':flags', re.flags, Array.from(flags).sort().join(''), id);
    equal(id + ':observable-mode', [re.ignoreCase, re.unicode, re.unicodeSets],
          [true, flags.includes('u'), flags.includes('v')], id);
    return re;
  }
  function sample(id, source, flags, subject, text, indices,
                  literal, start = 0, names) {
    ++cases;
    id += ':' + flags + ':' + (literal ? 'literal' : 'constructor');
    const re = compile(id, source, flags, literal);
    if (re === undefined) return;
    const input = string(subject);
    const expected = wanted(subject, text, indices, names);
    for (let repeat = 0; repeat < 4; ++repeat) {
      re.lastIndex = start;
      equal(id + ':exec-' + repeat, snapshot(re.exec(input)), expected, id);
      if (flags.includes('g') || flags.includes('y')) {
        equal(id + ':lastIndex-' + repeat, re.lastIndex,
              text === null ? 0 : indices[0][1], id);
      }
    }
    if (text !== null) {
      for (let capture = 0; capture < text.length; ++capture) {
        if (text[capture] === undefined) {
          equal(id + ':missing-index-' + capture, indices[capture], undefined, id);
          continue;
        }
        const [begin, end] = indices[capture];
        equal(id + ':fixed-slice-' + capture, units(input.slice(begin, end)),
              selected(text[capture]), id);
      }
    }
  }

  const observations = [];
  for (const grammar of ['', 'u', 'v']) {
    const flags = 'di' + grammar;
    const unicodeFold = byte || grammar !== '';
    for (const literal of [false, true]) {
      const ex = join(EC, ascii('X'));
      const sy = join(FINAL_SIGMA, ascii('Y'));
      const aE = join(ascii('a'), EC);
      const bS = join(ascii('b'), FINAL_SIGMA);
      const source = '(' + string(E) + 'X|' + string(SIGMA) + 'Y)';
      sample('existing-capture-control', '^(' + string(E) + ')$', flags, EC,
             [EC, EC], [[0, e], [0, e]], literal);
      sample('ascii-binary-common-prefixes', '^(abc|abd)$', flags, ascii('aBd'),
             [ascii('aBd'), ascii('aBd')], [[0, 3], [0, 3]], literal);
      sample('first-unicode-branch', '^(?:a' + string(E) + '|b' + string(SIGMA) + ')$',
             flags, aE, [aE], [[0, 1 + e]], literal);
      sample('second-unicode-branch', '^(?:a' + string(E) + '|b' + string(SIGMA) + ')$',
             flags, bS, [bS], [[0, 1 + e]], literal);
      sample('outer-capture', '^(a' + string(E) + '|b' + string(SIGMA) + ')$', flags,
             bS, [bS, bS], [[0, 1 + e], [0, 1 + e]], literal);
      sample('longer-branch-first', '(' + string(E) + 'X|' + string(E) + ')', flags,
             ex, [ex, ex], [[0, 1 + e], [0, 1 + e]], literal);
      sample('shorter-branch-first', '(' + string(E) + '|' + string(E) + 'X)', flags,
             ex, [EC, EC], [[0, e], [0, e]], literal);
      const yz = join(EC, ascii('YZ'));
      sample('backtracking-clears-left-capture',
             '^(?:(' + string(E) + ')X|(' + string(E) + ')Y)Z$', flags, yz,
             [yz, undefined, EC], [[0, e + 2], undefined, [0, e]], literal);
      sample('named-unmatched-left-capture',
             '^(?:(?<left>' + string(E) + ')X|(?<right>' + string(SIGMA) + ')Y)$',
             flags, sy, [sy, undefined, FINAL_SIGMA],
             [[0, e + 1], undefined, [0, e]], literal, 0, {left: 1, right: 2});
      sample('nested-right-branch-capture', '^(((' + string(E) + 'X))|(' +
             string(SIGMA) + 'Y))$', flags, sy,
             [sy, sy, undefined, undefined, sy],
             [[0, e + 1], [0, e + 1], undefined, undefined, [0, e + 1]], literal);
      sample('same-flags-group', '^(?i:(a' + string(E) + '|b' + string(SIGMA) + '))$',
             flags, bS, [bS, bS], [[0, e + 1], [0, e + 1]], literal);
      const aDeseret = join(ascii('a'), SMALL_DESERET);
      sample('nested-binary-common-prefixes', '^(a' + string(E) + '|(?:a' +
             string(SIGMA) + '|a' + string(DESERET) + '))$', flags, aDeseret,
             unicodeFold ? [aDeseret, aDeseret] : null,
             [[0, astral + 1], [0, astral + 1]], literal);
      const foldedPrefix = join(ascii('A'), EC);
      sample('equivalent-fold-branches-preserve-first-capture',
             '^(?:(a' + string(E) + ')|(A' + string(EC) + '))$', flags, foldedPrefix,
             [foldedPrefix, foldedPrefix, undefined],
             [[0, e + 1], [0, e + 1], undefined], literal);
      const kx = join(K, ascii('x'));
      const longSy = join(S, ascii('y'));
      const k = byte ? 3 : 1;
      const s = byte ? 2 : 1;
      sample('kelvin-branch', '(kX|sY)', flags, kx,
             unicodeFold ? [kx, kx] : null, [[0, k + 1], [0, k + 1]], literal);
      sample('long-s-branch', '(kX|sY)', flags, longSy,
             unicodeFold ? [longSy, longSy] : null, [[0, s + 1], [0, s + 1]], literal);
      sample('long-s-branch-captures', '^(?:(k)X|(s)Y)$', flags, longSy,
             unicodeFold ? [longSy, undefined, S] : null,
             [[0, s + 1], undefined, [0, s]], literal);
      sample('empty-choice-under-consuming-anchors', '^A(|' + string(E) + ')Z$',
             flags, ascii('aZ'), [ascii('aZ'), ascii('')], [[0, 2], [1, 1]], literal);
      const decorated = join(ascii('a'), EC, ascii('z'));
      sample('empty-choice-backtracks-to-consuming', '^A(|' + string(E) + ')Z$',
             flags, decorated, [decorated, EC], [[0, e + 2], [1, e + 1]], literal);
      sample('empty-choice-priority', '^A(|' + string(E) + ')', flags, aE,
             [ascii('a'), ascii('')], [[0, 1], [1, 1]], literal);
      sample('consuming-choice-priority', '^A(' + string(E) + '|)', flags, aE,
             [aE, EC], [[0, e + 1], [1, e + 1]], literal);

      const pair = join(H, L);
      const pairX = join(pair, ascii('X'));
      const scalarY = join(U, ascii('Y'));
      const pairChoice = '^((' + string(pair) + ')X|(' + string(U) + ')Y)$';
      sample('raw-pair-branch-own', pairChoice, flags, pairX,
             [pairX, pairX, pair, undefined],
             [[0, 2 * h + 1], [0, 2 * h + 1], [0, 2 * h], undefined], literal);
      sample('scalar-branch-own', pairChoice, flags, scalarY,
             [scalarY, scalarY, undefined, U],
             [[0, astral + 1], [0, astral + 1], undefined, [0, astral]], literal);
      const scalarX = join(U, ascii('X'));
      sample('raw-pair-branch-rejects-scalar', pairChoice, flags, scalarX,
             byte ? null : [scalarX, scalarX, U, undefined],
             [[0, 3], [0, 3], [0, 2], undefined], literal);
      const pairY = join(pair, ascii('Y'));
      sample('scalar-branch-rejects-raw-pair', pairChoice, flags, pairY,
             byte ? null : [pairY, pairY, undefined, pair],
             [[0, 3], [0, 3], undefined, [0, 2]], literal);
      const sticky = join(ascii('x'), ex, ascii('y'));
      sample('sticky-leading-start', source, flags + 'y', sticky,
             [ex, ex], [[1, e + 2], [1, e + 2]], literal, 1);
      sample('sticky-interior-start', source, flags + 'y', sticky,
             null, undefined, literal, 2);
      const later = join(ascii('x'), ex, ascii('|'), sy);
      const laterStart = byte ? 5 : 4;
      sample('global-interior-start', source, flags + 'g', later,
             [sy, sy], [[laterStart, laterStart + e + 1],
                        [laterStart, laterStart + e + 1]], literal, 2);
      sample('raw-ff-subject-prefix', source, flags, join(RAW_FF, ex),
             [ex, ex], [[1, e + 2], [1, e + 2]], literal);
      sample('no-full-fold', '^(' + string(SHARP_S) + 'X|' + string(SHARP_S) + 'Y)$',
             flags, ascii('SSx'), null, undefined, literal);
      sample('no-branch-matches', '^' + source + '$', flags, ascii('bad'),
             null, undefined, literal);

      ++cases;
      const id = 'global-branch-capture-state:' + grammar + ':' +
          (literal ? 'literal' : 'constructor');
      const globalSource = '(?:(' + string(E) + ')X|(' + string(SIGMA) + ')Y)';
      const re = compile(id, globalSource, flags + 'g', literal);
      if (re !== undefined) {
        const subject = join(SNOW, ascii('|'), ex, ascii('|'), sy);
        const starts = byte ? [4, 8] : [2, 5];
        for (let index = 0; index < 2; ++index) {
          const begin = starts[index];
          const range = [begin, begin + e + 1];
          const texts = index === 0 ? [ex, EC, undefined] : [sy, undefined, FINAL_SIGMA];
          const indices = index === 0 ? [range, [begin, begin + e], undefined] :
              [range, undefined, [begin, begin + e]];
          equal(id + ':match-' + index, snapshot(re.exec(string(subject))),
                wanted(subject, texts, indices), id);
          equal(id + ':lastIndex-' + index, re.lastIndex, range[1], id);
        }
        equal(id + ':done', re.exec(string(subject)), null, id);
        equal(id + ':reset', re.lastIndex, 0, id);
      }

      // Non-gating source-shape observations. They do not prove support for
      // broad ClassRanges or /v ClassSet leaves. See the source-audit report.
      for (const [name, pattern, subject, text, indices] of [
        ['three-single-ascii', '^(a|b|c)$', ascii('B'),
         [ascii('B'), ascii('B')], [[0, 1], [0, 1]]],
        ['three-single-unicode', '^(' + string(E) + '|' + string(SIGMA) + '|' +
         string(CJK) + ')$', EC, [EC, EC], [[0, e], [0, e]]],
        ['three-single-fold-to-wide', '^(k|s|x)$', K,
         unicodeFold ? [K, K] : null, [[0, k], [0, k]]],
        ['three-ascii-common-prefixes', '^(abc|abd|abe)$', ascii('aBe'),
         [ascii('aBe'), ascii('aBe')], [[0, 3], [0, 3]]],
        ['three-unicode-common-prefixes', '^(a' + string(E) + '|a' +
         string(SIGMA) + '|a' + string(DESERET) + ')$', aDeseret,
         unicodeFold ? [aDeseret, aDeseret] : null,
         [[0, astral + 1], [0, astral + 1]]],
        ['three-equivalent-fold-captures', '^(?:(a' + string(E) + ')|(A' +
         string(EC) + ')|(a' + string(SIGMA) + '))$', foldedPrefix,
         [foldedPrefix, foldedPrefix, undefined, undefined],
         [[0, e + 1], [0, e + 1], undefined, undefined]],
        ['nested-three-under-binary', '^((?:a' + string(E) + '|a' +
         string(SIGMA) + '|a' + string(DESERET) + ')|bc)$', aDeseret,
         unicodeFold ? [aDeseret, aDeseret] : null,
         [[0, astral + 1], [0, astral + 1]]],
      ]) {
        let actual;
        let error;
        try {
          const observed = literal ? eval('/' + pattern + '/' + flags) :
              new RegExp(pattern, flags);
          actual = snapshot(observed.exec(string(subject)));
        } catch (caught) { error = caught.name; }
        observations.push({id: name + ':' + flags + ':' + (literal ? 'literal' : 'constructor'),
          acceptance: false, error, actual, desired: wanted(subject, text, indices)});
      }
    }
  }
  equal('fixed-case-count', cases, 186);
  equal('fixed-observation-count', observations.length, 42);
  emit(encode({kind: 'source-shape-observations', observations}));
  emit(encode({kind: 'scope', rootMinMatch: 'positive', excluded: ['quantifiers',
    'original disjunctions with three or more branches, including nested choices',
    'backreferences', 'lookaround/reverse', 'broad classes and v ClassSet nodes',
    'changed-flags groups', 'word/multiline boundaries', 'U+FFFD/malformed patterns',
    'whole-root nullable matches'], observationsAreAcceptance: false}));
  emit(encode({kind: 'ignore-case-binary-choices', profile, cases, checks,
    passed: failureCount === 0, failureCount, failedCases: Array.from(failedCases),
    failures, failureDetailsTruncated: failureCount > failures.length}));
  if (failureCount !== 0) {
    throw Error('IGNORE_CASE_BINARY_CHOICE_ASSERT: ' + failureCount + ' failures');
  }
})();
