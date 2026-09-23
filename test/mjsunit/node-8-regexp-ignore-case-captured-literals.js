// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile correctness test. The external runner verifies the intended
// profile; standalone mjsunit runs use the actual String coordinate system.
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
  for (const [label, value] of Object.entries({E, EC, K, S, SIGMA, FINAL_SIGMA,
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
    return {values: text.map(selected), index: indices[0][0], indices,
      groups: names === undefined ? null : Object.fromEntries(
        Object.entries(names).map(([name, capture]) => [name, selected(text[capture])])),
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
        const [begin, end] = indices[capture];
        equal(id + ':fixed-slice-' + capture, units(input.slice(begin, end)),
              selected(text[capture]), id);
      }
    }
  }

  for (const grammar of ['', 'u', 'v']) {
    const flags = 'di' + grammar;
    const unicodeFold = byte || grammar !== '';
    for (const literal of [false, true]) {
      sample('ascii-capture-control', '^A(b)Z$', flags, ascii('abz'),
             [ascii('abz'), ascii('b')], [[0, 3], [1, 2]], literal);
      sample('ascii-only-unanchored-control', '(abc)', flags, ascii('ABC'),
             [ascii('ABC'), ascii('ABC')], [[0, 3], [0, 3]], literal);
      sample('ascii-only-named-anchor-control', '^(?<x>abc)$', flags, ascii('ABC'),
             [ascii('ABC'), ascii('ABC')], [[0, 3], [0, 3]], literal, 0, {x: 1});
      sample('ascii-only-same-flags-group', '^(?i:(abc))$', flags, ascii('ABC'),
             [ascii('ABC'), ascii('ABC')], [[0, 3], [0, 3]], literal);
      sample('existing-bare-fold-control', string(E), flags, EC,
             [EC], [[0, e]], literal);
      sample('anchored-bmp-capture', '^(' + string(E) + ')$', flags, EC,
             [EC, EC], [[0, e], [0, e]], literal);
      sample('empty-capture-before-consuming-body', '^()(' + string(E) + ')$',
             flags, EC, [EC, ascii(''), EC], [[0, e], [0, 0], [0, e]], literal);
      sample('empty-capture-after-consuming-body', '(' + string(E) + ')()',
             flags, EC, [EC, EC, ascii('')], [[0, e], [0, e], [e, e]], literal);
      sample('nested-empty-captures', '^(())(' + string(E) + ')$', flags, EC,
             [EC, ascii(''), ascii(''), EC],
             [[0, e], [0, 0], [0, 0], [0, e]], literal);
      const decorated = join(ascii('a'), EC, ascii('z'));
      sample('named-capture', '^A(?<x>' + string(E) + ')Z$', flags, decorated,
             [decorated, EC], [[0, 2 + e], [1, 1 + e]], literal, 0, {x: 1});
      for (const [nameId, name] of [['bmp', E], ['astral', DESERET]]) {
        sample('unicode-name-' + nameId,
               '^A(?<' + string(name) + '>' + string(E) + ')Z$', flags, decorated,
               [decorated, EC], [[0, 2 + e], [1, 1 + e]], literal, 0,
               {[string(name)]: 1});
      }
      sample('transparent-group', '^(?:A(' + string(E) + ')Z)$', flags, decorated,
             [decorated, EC], [[0, 2 + e], [1, 1 + e]], literal);
      sample('explicit-same-flags-group', '^(?i:A(' + string(E) + ')Z)$', flags,
             decorated, [decorated, EC], [[0, 2 + e], [1, 1 + e]], literal);
      sample('nested-sigma', '^((' + string(SIGMA) + '))$', flags, FINAL_SIGMA,
             [FINAL_SIGMA, FINAL_SIGMA, FINAL_SIGMA],
             [[0, e], [0, e], [0, e]], literal);
      sample('kelvin-and-long-s', '^(k)(s)$', flags, join(K, S),
             unicodeFold ? [join(K, S), K, S] : null,
             byte ? [[0, 5], [0, 3], [3, 5]] : [[0, 2], [0, 1], [1, 2]], literal);
      sample('supplementary-fold', '^(' + string(DESERET) + ')$', flags,
             SMALL_DESERET, unicodeFold ? [SMALL_DESERET, SMALL_DESERET] : null,
             [[0, astral], [0, astral]], literal);
      sample('sharp-s-simple-fold', '^(' + string(SHARP_S) + ')$', flags,
             CAPITAL_SHARP_S, unicodeFold ? [CAPITAL_SHARP_S, CAPITAL_SHARP_S] : null,
             byte ? [[0, 3], [0, 3]] : [[0, 1], [0, 1]], literal);
      for (const nonFold of ['ss', 'SS']) {
        sample('no-full-fold-' + nonFold, '^(' + string(SHARP_S) + ')$', flags,
               ascii(nonFold), null, undefined, literal);
      }
      sample('raw-ff-prefix', '(' + string(E) + ')', flags, join(RAW_FF, EC),
             [EC, EC], [[1, 1 + e], [1, 1 + e]], literal);
      const pair = join(H, L);
      sample('independent-wtf8-pair', '^(' + string(pair) + ')$', flags, pair,
             [pair, pair], [[0, 2 * h], [0, 2 * h]], literal);
      sample('raw-pair-is-not-scalar', '^(' + string(pair) + ')$', flags, U,
             byte ? null : [U, U], [[0, 2], [0, 2]], literal);
      sample('scalar-is-not-raw-pair', '^(' + string(U) + ')$', flags, pair,
             byte ? null : [pair, pair], [[0, 2], [0, 2]], literal);
      sample('fixed-escape-pair', '^(\\uD800\\uDC00)$', flags, U,
             [U, U], [[0, astral], [0, astral]], literal);
      sample('fixed-escape-is-not-raw-pair', '^(\\uD800\\uDC00)$', flags, pair,
             byte ? null : [pair, pair], [[0, 2], [0, 2]], literal);
      sample('lone-surrogate', '^(' + string(H) + ')$', flags, H,
             [H, H], [[0, h], [0, h]], literal);
      const sticky = join(ascii('x'), EC, ascii('y'));
      sample('sticky-leading-start', '(' + string(E) + ')', flags + 'y', sticky,
             [EC, EC], [[1, 1 + e], [1, 1 + e]], literal, 1);
      // Offset 2 is a continuation byte in node-8 and the following y in stock.
      sample('sticky-interior-start', '(' + string(E) + ')', flags + 'y', sticky,
             null, undefined, literal, 2);
      const later = join(ascii('x'), EC, ascii('|'), EC);
      const laterStart = byte ? 4 : 3;
      sample('global-interior-start', '(' + string(E) + ')', flags + 'g', later,
             [EC, EC], [[laterStart, laterStart + e], [laterStart, laterStart + e]],
             literal, 2);

      ++cases;
      const id = 'global-sequence:' + grammar + ':' + (literal ? 'literal' : 'constructor');
      const re = compile(id, '(' + string(E) + ')', flags + 'g', literal);
      if (re !== undefined) {
        const subject = join(SNOW, ascii('|'), EC, ascii('|'), E);
        const starts = byte ? [4, 7] : [2, 4];
        for (let index = 0; index < 2; ++index) {
          const value = index === 0 ? EC : E;
          const range = [starts[index], starts[index] + e];
          equal(id + ':match-' + index, snapshot(re.exec(string(subject))),
                wanted(subject, [value, value], [range, range]), id);
          equal(id + ':lastIndex-' + index, re.lastIndex, range[1], id);
        }
        equal(id + ':done', re.exec(string(subject)), null, id);
        equal(id + ':reset', re.lastIndex, 0, id);
        const offsets = [];
        const replaced = string(subject).replace(re, (_match, _capture, offset) => {
          offsets.push(offset);
          return '!';
        });
        equal(id + ':replace-offsets', offsets, starts, id);
        equal(id + ':replace-value', units(replaced),
              selected(join(SNOW, ascii('|!|!'))), id);
      }
    }
  }

  // These bracket spellings are ClassRanges. In /v they are ClassSet nodes,
  // not the singleton leaves used by bare astral/surrogate pattern characters.
  for (const grammar of ['', 'u']) {
    for (const literal of [false, true]) {
      sample('singleton-bmp-class', '^([' + string(E) + '])$', 'di' + grammar,
             EC, [EC, EC], [[0, e], [0, e]], literal);
      sample('singleton-astral-class', '^([' + string(DESERET) + '])$',
             'di' + grammar, SMALL_DESERET,
             byte || grammar !== '' ? [SMALL_DESERET, SMALL_DESERET] : null,
             [[0, astral], [0, astral]], literal);
    }
  }
  equal('fixed-case-count', cases, 194);
  emit(encode({kind: 'scope', excluded: ['quantifiers', 'alternation', 'lookaround',
    'backreferences', 'changed-flags groups', 'word/multiline boundaries',
    'non-singleton classes', 'v ClassSet nodes', 'U+FFFD or malformed patterns'],
    note: 'Raw FF is subject data only. No desired null oracle for excluded features.'}));
  emit(encode({kind: 'ignore-case-captured-literals', profile, cases, checks, passed: failureCount === 0,
    failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length}));
  if (failureCount !== 0) {
    throw Error('IGNORE_CASE_CAPTURE_ASSERT: ' + failureCount + ' failures');
  }
})();
