// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile correctness test; the external driver verifies intended profile.
// Only the non-ASCII-only partition gates this narrow quantifier slice.
// ASCII/mixed, future forms and excluded-shape observations remain visible.
'use strict';

(() => {
  const width = String.fromCodePoint(233).length;
  if (width !== 1 && width !== 2) throw Error('Unknown string profile');
  const byte = width === 2;
  const profile = byte ? 'node8' : 'stock';
  const focus = 'non-ascii-only';
  const options = ['--observe-excluded'];
  const emit = typeof print === 'function' ? print : console.log;
  const fixture = (bytes, stock) => ({bytes, stock});
  const ascii = text => {
    const data = Array.from(text, ch => ch.charCodeAt(0));
    if (data.some(value => value > 127)) throw Error('Non-ASCII fixture');
    return fixture(data, data);
  };
  const join = (...parts) => fixture(parts.flatMap(p => p.bytes),
                                    parts.flatMap(p => p.stock));
  const selected = value => byte ? value.bytes : value.stock;
  const string = value => String.fromCharCode(...selected(value));
  const units = value => {
    const result = [];
    for (let i = 0; i < value.length; ++i) result.push(value.charCodeAt(i));
    return result;
  };
  const E = fixture([0xc3, 0xa9], [0x00e9]);
  const EC = fixture([0xc3, 0x89], [0x00c9]);
  const K = fixture([0xe2, 0x84, 0xaa], [0x212a]);
  const S = fixture([0xc5, 0xbf], [0x017f]);
  const H = fixture([0xed, 0xa0, 0x80], [0xd800]);
  const L = fixture([0xed, 0xb0, 0x80], [0xdc00]);
  const U = fixture([0xf0, 0x90, 0x80, 0x80], [0xd800, 0xdc00]);
  const D = fixture([0xf0, 0x90, 0x90, 0x80], [0xd801, 0xdc00]);
  const DL = fixture([0xf0, 0x90, 0x90, 0xa8], [0xd801, 0xdc28]);
  const SIGMA = fixture([0xce, 0xa3], [0x03a3]);
  const SMALL_SIGMA = fixture([0xcf, 0x83], [0x03c3]);
  const FINAL_SIGMA = fixture([0xcf, 0x82], [0x03c2]);
  const SHARP_S = fixture([0xc3, 0x9f], [0x00df]);
  const CAPITAL_SHARP_S = fixture([0xe1, 0xba, 0x9e], [0x1e9e]);
  const FF = fixture([0xff], [0x00ff]);
  const CONT = fixture([0x80], [0x0080]);
  const BAD = fixture([0xc3, 0x28], [0x00c3, 0x0028]);
  const TRUNC = fixture([0xc3], [0x00c3]);
  const bang = ascii('!');
  const empty = ascii('');
  const aRun = ascii('aAA');
  const kRun = join(ascii('k'), K);
  const sRun = join(ascii('s'), S);
  const kkRun = join(ascii('KK'), K, ascii('kk'), K);
  const ssRun = join(ascii('ss'), S, ascii('SS'), S);
  const fourK = join(ascii('k'), K, ascii('k'), K);
  const eRun = join(EC, E);
  const hRun = join(H, H);
  const lRun = join(L, L);
  const scalarRun = join(U, U);
  const pairRun = join(H, L, H, L);
  const dRun = join(DL, DL);
  const sigmaRun = join(SMALL_SIGMA, FINAL_SIGMA);
  const eThree = join(EC, E, EC);
  const hThree = join(H, H, H);
  const sharpSmallFirst = join(SHARP_S, CAPITAL_SHARP_S);
  const sharpCapitalFirst = join(CAPITAL_SHARP_S, SHARP_S);
  let checks = 0;
  let cases = 0;
  let failureCount = 0;
  const failures = [];
  const failedCases = new Set();
  let phase = 'primary';
  let activePartition = null;
  let infrastructureFailures = 0;
  const partitions = Object.fromEntries(['ascii-only', 'mixed', 'non-ascii-only'].map(
    name => [name, {cases: 0, checks: 0, differenceCount: 0,
      differingCases: [], differences: []}]));
  const encode = value => JSON.stringify(value, (_key, item) =>
    item === undefined ? {undefined: true} : item);
  function equal(label, actual, expected, id = label) {
    ++checks;
    const partition = phase === 'primary' && activePartition !== null ?
      partitions[activePartition] : null;
    if (partition !== null) ++partition.checks;
    if (encode(actual) === encode(expected)) return;
    ++failureCount;
    failedCases.add(id);
    if (failures.length < 40) failures.push({label, actual, expected});
    if (partition !== null) {
      ++partition.differenceCount;
      if (!partition.differingCases.includes(id)) partition.differingCases.push(id);
      if (partition.differences.length < 20) partition.differences.push({label, actual, expected});
    } else if (phase === 'primary') {
      ++infrastructureFailures;
    }
  }
  for (const [name, value] of Object.entries({E, EC, K, S, H, L, U, D, DL,
      SIGMA, SMALL_SIGMA, FINAL_SIGMA, SHARP_S, CAPITAL_SHARP_S,
      FF, CONT, BAD, TRUNC})) {
    equal('fixture-' + name, units(string(value)), selected(value));
  }

  // Conditions are independently specified stock/Unicode grammar rules, not
  // values observed from the candidate engine. Numeric intervals are fixtures.
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = '', start = 0, names) =>
    ({id, source, subject, values, bytes, stock, condition, extraFlags, start, names});
  const rows = [
    row('ascii-control', '^(a+)!$', join(aRun, bang),
        [join(aRun, bang), aRun], [[0, 4], [0, 3]], [[0, 4], [0, 3]]),
    row('ascii-unicode-tail', '^(a+)' + string(E) + '$', join(aRun, EC),
        [join(aRun, EC), aRun], [[0, 5], [0, 3]], [[0, 4], [0, 3]]),
    row('named-outer', '^A(?<x>k+)Z$', join(ascii('aK'), K, ascii('kz')),
        [join(ascii('aK'), K, ascii('kz')), join(ascii('K'), K, ascii('k'))],
        [[0, 7], [1, 6]], [[0, 5], [1, 4]], 'unicode', '', 0, {x: 1}),
    row('nested-outer', '^((k+))!$', join(ascii('K'), K, bang),
        [join(ascii('K'), K, bang), join(ascii('K'), K), join(ascii('K'), K)],
        [[0, 5], [0, 4], [0, 4]], [[0, 3], [0, 2], [0, 2]], 'unicode'),
    row('kelvin-greedy-rollback', '^(k+)(k)!$', join(kRun, ascii('K!')),
        [join(kRun, ascii('K!')), kRun, ascii('K')],
        [[0, 6], [0, 4], [4, 5]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('long-s-greedy-rollback', '^(s+)(s)!$', join(sRun, ascii('S!')),
        [join(sRun, ascii('S!')), sRun, ascii('S')],
        [[0, 5], [0, 3], [3, 4]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('kelvin-two-mixed-exits', '^(k+)(k)!$', join(kkRun, ascii('K!')),
        [join(kkRun, ascii('K!')), kkRun, ascii('K')],
        [[0, 12], [0, 10], [10, 11]], [[0, 8], [0, 6], [6, 7]], 'unicode'),
    row('long-s-two-mixed-exits', '^(s+)(s)!$', join(ssRun, ascii('s!')),
        [join(ssRun, ascii('s!')), ssRun, ascii('s')],
        [[0, 10], [0, 8], [8, 9]], [[0, 8], [0, 6], [6, 7]], 'unicode'),
    row('greedy-literal-tail', '^(k+)K!$', join(kRun, ascii('K!')),
        [join(kRun, ascii('K!')), kRun],
        [[0, 6], [0, 4]], [[0, 4], [0, 2]], 'unicode'),
    row('lazy-literal-tail', '^(k+?)K!$', join(kRun, ascii('K!')),
        [join(kRun, ascii('K!')), kRun],
        [[0, 6], [0, 4]], [[0, 4], [0, 2]], 'unicode'),
    row('bounded-greedy', '^(k{2,3})K!$', join(kRun, ascii('K!')),
        [join(kRun, ascii('K!')), kRun],
        [[0, 6], [0, 4]], [[0, 4], [0, 2]], 'unicode'),
    row('bounded-lazy', '^(k{2,3}?)K!$', join(kRun, ascii('K!')),
        [join(kRun, ascii('K!')), kRun],
        [[0, 6], [0, 4]], [[0, 4], [0, 2]], 'unicode'),
    row('exact-two', '^(k{2})!$', join(ascii('K'), K, bang),
        [join(ascii('K'), K, bang), join(ascii('K'), K)],
        [[0, 5], [0, 4]], [[0, 3], [0, 2]], 'unicode'),
    row('greedy-minimum-two', '^(k{2,})K!$', join(kRun, ascii('K!')),
        [join(kRun, ascii('K!')), kRun],
        [[0, 6], [0, 4]], [[0, 4], [0, 2]], 'unicode'),
    row('greedy-minimum-three', '^(k{3,})K!$', join(fourK, ascii('K!')),
        [join(fourK, ascii('K!')), fourK],
        [[0, 10], [0, 8]], [[0, 6], [0, 4]], 'unicode'),
    row('minimum-failure', '^(k{2,})!$', join(K, bang), null),
    row('maximum-failure', '^(k{1,2})!$', join(ascii('K'), K, ascii('k!')), null),
    row('tail-failure', '^(k+)!$', join(kRun, ascii('?')), null),
    row('star-empty', '^(k*)!$', bang, [bang, empty],
        [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('star-mixed', '^(k*)!$', join(kRun, bang), [join(kRun, bang), kRun],
        [[0, 5], [0, 4]], [[0, 3], [0, 2]], 'unicode'),
    row('star-lazy-retry', '^(k*?)K!$', join(K, ascii('K!')),
        [join(K, ascii('K!')), K], [[0, 5], [0, 3]], [[0, 3], [0, 1]], 'unicode'),
    row('optional-empty', '^(k?)!$', bang, [bang, empty],
        [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('optional-one', '^(k?)!$', join(K, bang), [join(K, bang), K],
        [[0, 4], [0, 3]], [[0, 2], [0, 1]], 'unicode'),
    row('optional-two-failure', '^(k?)!$', ascii('kK!'), null),
    row('unicode-prefix', '^' + string(E) + '(k+)!$', join(EC, K, bang),
        [join(EC, K, bang), K], [[0, 6], [2, 5]], [[0, 3], [1, 2]], 'unicode'),
    row('raw-lone-high', '^(' + string(H) + '+)!$', join(hRun, bang),
        [join(hRun, bang), hRun], [[0, 7], [0, 6]], [[0, 3], [0, 2]]),
    row('raw-lone-low', '^(' + string(L) + '+)!$', join(lRun, bang),
        [join(lRun, bang), lRun], [[0, 7], [0, 6]], [[0, 3], [0, 2]]),
    row('raw-high-before-low', '^(' + string(H) + '+)' + string(L) + '!$',
        join(hRun, L, bang), [join(hRun, L, bang), hRun],
        [[0, 10], [0, 6]], [[0, 4], [0, 2]], 'byte-or-stock-legacy'),
    row('raw-scalar-repetition', '^(' + string(U) + '+)!$', join(scalarRun, bang),
        [join(scalarRun, bang), scalarRun],
        [[0, 9], [0, 8]], [[0, 5], [0, 4]], 'unicode'),
    row('scalar-not-raw-pairs', '^(' + string(U) + '+)!$', join(pairRun, bang),
        [join(pairRun, bang), pairRun],
        [[0, 13], [0, 12]], [[0, 5], [0, 4]], 'stock-unicode'),
    row('supplementary-simple-fold', '^(' + string(D) + '+)!$', join(dRun, bang),
        [join(dRun, bang), dRun], [[0, 9], [0, 8]], [[0, 5], [0, 4]], 'unicode'),
    row('malformed-ff-subject', '^(k+)!$', join(ascii('k'), FF, bang), null),
    row('malformed-continuation-subject', '^(k+)!$', join(ascii('k'), CONT, bang), null),
    row('malformed-second-byte-subject', '^(' + string(E) + '+)!$',
        join(EC, BAD, bang), null),
    row('truncated-subject', '^(' + string(E) + '+)$', join(EC, TRUNC), null),
    row('bmp-repetition', '^(' + string(E) + '+)!$', join(EC, E, EC, bang),
        [join(EC, E, EC, bang), join(EC, E, EC)],
        [[0, 7], [0, 6]], [[0, 4], [0, 3]]),
    row('counter-greedy', '^(k{4,6})K!$', join(fourK, ascii('K!')),
        [join(fourK, ascii('K!')), fourK],
        [[0, 10], [0, 8]], [[0, 6], [0, 4]], 'unicode'),
    row('counter-lazy', '^(k{4,6}?)K!$', join(fourK, ascii('K!')),
        [join(fourK, ascii('K!')), fourK],
        [[0, 10], [0, 8]], [[0, 6], [0, 4]], 'unicode'),
    row('ascii-hex-escape', '^(\\x61+)!$', join(aRun, bang),
        [join(aRun, bang), aRun], [[0, 4], [0, 3]], [[0, 4], [0, 3]]),
    row('fixed-lone-escape', '^(\\uD800+)!$', join(hRun, bang),
        [join(hRun, bang), hRun], [[0, 7], [0, 6]], [[0, 3], [0, 2]]),
    row('global-start-zero', '^(' + string(E) + '+)!$', join(eRun, bang),
        [join(eRun, bang), eRun], [[0, 5], [0, 4]], [[0, 3], [0, 2]], 'all', 'g'),
    row('global-nonzero-origin', '^(' + string(E) + '+)!$', join(eRun, bang),
        null, undefined, undefined, 'all', 'g', 1),
    row('sticky-start-zero', '^(' + string(E) + '+)!$', join(eRun, bang),
        [join(eRun, bang), eRun], [[0, 5], [0, 4]], [[0, 3], [0, 2]], 'all', 'y'),
    row('sticky-nonzero-origin', '^(' + string(E) + '+)!$', join(eRun, bang),
        null, undefined, undefined, 'all', 'y', 1),
    row('named-global-sticky', '^(?<x>' + string(E) + '+)!$', join(eRun, bang),
        [join(eRun, bang), eRun], [[0, 5], [0, 4]], [[0, 3], [0, 2]],
        'all', 'gy', 0, {x: 1}),
    row('bmp-greedy-rollback', '^(' + string(E) + '+)(' + string(E) + ')!$',
        join(eThree, bang), [join(eThree, bang), eRun, EC],
        [[0, 7], [0, 4], [4, 6]], [[0, 4], [0, 2], [2, 3]]),
    row('bmp-minimum-two', '^(' + string(E) + '{2,})' + string(E) + '!$',
        join(eThree, bang), [join(eThree, bang), eRun],
        [[0, 7], [0, 4]], [[0, 4], [0, 2]]),
    row('bmp-minimum-three', '^(' + string(E) + '{3,})' + string(E) + '!$',
        join(eThree, E, bang), [join(eThree, E, bang), eThree],
        [[0, 9], [0, 6]], [[0, 5], [0, 3]]),
    row('bmp-star-zero', '^(' + string(E) + '*)!$', bang, [bang, empty],
        [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('bmp-minimum-failure', '^(' + string(E) + '{2,})!$', join(EC, bang), null),
    row('bmp-wrong-character', '^(' + string(E) + '+)!$', ascii('E!'), null),
    row('bmp-tail-failure', '^(' + string(E) + '+)!$', join(eRun, ascii('?')), null),
    row('sigma-greedy-rollback', '^(' + string(SIGMA) + '+)(' + string(SIGMA) + ')!$',
        join(sigmaRun, SIGMA, bang), [join(sigmaRun, SIGMA, bang), sigmaRun, SIGMA],
        [[0, 7], [0, 4], [4, 6]], [[0, 4], [0, 2], [2, 3]]),
    row('sigma-minimum-three', '^(' + string(SIGMA) + '{3,})!$',
        join(sigmaRun, SIGMA, bang), [join(sigmaRun, SIGMA, bang), join(sigmaRun, SIGMA)],
        [[0, 7], [0, 6]], [[0, 4], [0, 3]]),
    row('sigma-star-zero', '^(' + string(SIGMA) + '*)!$', bang, [bang, empty],
        [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('sigma-minimum-failure', '^(' + string(SIGMA) + '{2,})!$', join(FINAL_SIGMA, bang), null),
    row('deseret-greedy-rollback', '^(' + string(D) + '+)(' + string(D) + ')!$',
        join(dRun, D, bang), [join(dRun, D, bang), dRun, D],
        [[0, 13], [0, 8], [8, 12]], [[0, 7], [0, 4], [4, 6]], 'unicode'),
    row('deseret-minimum-two', '^(' + string(D) + '{2,})' + string(D) + '!$',
        join(dRun, D, bang), [join(dRun, D, bang), dRun],
        [[0, 13], [0, 8]], [[0, 7], [0, 4]], 'unicode'),
    row('deseret-minimum-three', '^(' + string(D) + '{3,})!$',
        join(dRun, D, bang), [join(dRun, D, bang), join(dRun, D)],
        [[0, 13], [0, 12]], [[0, 7], [0, 6]], 'unicode'),
    row('deseret-star-zero', '^(' + string(D) + '*)!$', bang, [bang, empty],
        [[0, 1], [0, 0]], [[0, 1], [0, 0]], 'unicode'),
    row('deseret-minimum-failure', '^(' + string(D) + '{2,})!$', join(DL, bang), null),
    row('raw-high-greedy-rollback', '^(' + string(H) + '+)(' + string(H) + ')!$',
        join(hThree, bang), [join(hThree, bang), hRun, H],
        [[0, 10], [0, 6], [6, 9]], [[0, 4], [0, 2], [2, 3]]),
    row('raw-high-minimum-three', '^(' + string(H) + '{3,})!$',
        join(hThree, bang), [join(hThree, bang), hThree],
        [[0, 10], [0, 9]], [[0, 4], [0, 3]]),
    row('raw-high-star-zero', '^(' + string(H) + '*)!$', bang, [bang, empty],
        [[0, 1], [0, 0]], [[0, 1], [0, 0]]),
    row('non-ascii-malformed-ff', '^(' + string(E) + '+)!$', join(EC, FF, bang), null),
    row('sharp-s-small-first-rollback', '^(' + string(SHARP_S) + '+)(' +
        string(SHARP_S) + ')!$', join(sharpSmallFirst, SHARP_S, bang),
        [join(sharpSmallFirst, SHARP_S, bang), sharpSmallFirst, SHARP_S],
        [[0, 8], [0, 5], [5, 7]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('sharp-s-capital-first-rollback', '^(' + string(SHARP_S) + '+)(' +
        string(SHARP_S) + ')!$', join(sharpCapitalFirst, CAPITAL_SHARP_S, bang),
        [join(sharpCapitalFirst, CAPITAL_SHARP_S, bang), sharpCapitalFirst, CAPITAL_SHARP_S],
        [[0, 9], [0, 5], [5, 8]], [[0, 4], [0, 2], [2, 3]], 'unicode'),
    row('sharp-s-small-first-tail-failure', '^(' + string(SHARP_S) + '+)(' +
        string(SHARP_S) + ')!$', join(sharpSmallFirst, SHARP_S, ascii('?')), null),
    row('sharp-s-capital-first-tail-failure', '^(' + string(SHARP_S) + '+)(' +
        string(SHARP_S) + ')!$', join(sharpCapitalFirst, CAPITAL_SHARP_S, ascii('?')), null),
    row('grouped-raw-scalar-repetition', '^((?:' + string(U) + ')+)!$',
        join(scalarRun, bang), [join(scalarRun, bang), scalarRun],
        [[0, 9], [0, 8]], [[0, 5], [0, 4]]),
    row('grouped-deseret-repetition', '^((?:' + string(D) + ')+)!$',
        join(dRun, bang), [join(dRun, bang), dRun],
        [[0, 9], [0, 8]], [[0, 5], [0, 4]], 'unicode'),
    row('same-flags-quantified-body', '^((?i:' + string(E) + ')+)!$',
        join(eRun, bang), [join(eRun, bang), eRun],
        [[0, 5], [0, 4]], [[0, 3], [0, 2]]),
    row('same-flags-root-wrapper', '(?i:^(' + string(E) + '+)!$)',
        join(eRun, bang), [join(eRun, bang), eRun],
        [[0, 5], [0, 4]], [[0, 3], [0, 2]]),
  ];
  const futureIds = new Set([
    'lazy-literal-tail', 'bounded-greedy', 'bounded-lazy', 'exact-two',
    'maximum-failure', 'star-lazy-retry', 'optional-empty', 'optional-one',
    'optional-two-failure', 'counter-greedy', 'counter-lazy',
  ]);
  const asciiIds = new Set(['ascii-control', 'ascii-unicode-tail', 'ascii-hex-escape']);
  const nonAsciiIds = new Set([
    'raw-lone-high', 'raw-lone-low', 'raw-high-before-low', 'raw-scalar-repetition',
    'scalar-not-raw-pairs', 'supplementary-simple-fold', 'malformed-second-byte-subject',
    'truncated-subject', 'bmp-repetition', 'fixed-lone-escape', 'global-start-zero',
    'global-nonzero-origin', 'sticky-start-zero', 'sticky-nonzero-origin',
    'named-global-sticky', 'bmp-greedy-rollback', 'bmp-minimum-two',
    'bmp-minimum-three', 'bmp-star-zero', 'bmp-minimum-failure', 'bmp-wrong-character',
    'bmp-tail-failure', 'sigma-greedy-rollback', 'sigma-minimum-three', 'sigma-star-zero',
    'sigma-minimum-failure', 'deseret-greedy-rollback', 'deseret-minimum-two',
    'deseret-minimum-three', 'deseret-star-zero', 'deseret-minimum-failure',
    'raw-high-greedy-rollback', 'raw-high-minimum-three', 'raw-high-star-zero',
    'non-ascii-malformed-ff', 'singleton-bmp-class',
    'sharp-s-small-first-rollback', 'sharp-s-capital-first-rollback',
    'sharp-s-small-first-tail-failure', 'sharp-s-capital-first-tail-failure',
    'grouped-raw-scalar-repetition', 'grouped-deseret-repetition',
    'same-flags-quantified-body', 'same-flags-root-wrapper',
  ]);

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
    if (condition === 'unicode') return byte || grammar !== '';
    if (condition === 'byte-or-stock-legacy') return byte || grammar === '';
    if (condition === 'stock-unicode') return !byte && grammar !== '';
    throw Error('Unknown fixed-oracle condition');
  }
  function sample(item, grammar, literal) {
    ++cases;
    activePartition = asciiIds.has(item.id) ? 'ascii-only' :
      nonAsciiIds.has(item.id) ? 'non-ascii-only' : 'mixed';
    if (phase === 'primary') ++partitions[activePartition].cases;
    const flags = 'di' + grammar + item.extraFlags;
    const id = item.id + ':' + flags + ':' + (literal ? 'literal' : 'constructor');
    let re;
    let error;
    try { re = literal ? eval('/' + item.source + '/' + flags) :
      new RegExp(item.source, flags); }
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
    if (item.extraFlags !== '' && text !== null) {
      equal(id + ':next-anchored-exec', re.exec(string(item.subject)), null, id);
      equal(id + ':next-lastIndex-reset', re.lastIndex, 0, id);
    }
  }
  for (const grammar of ['', 'u', 'v']) {
    for (const literal of [false, true]) {
      for (const item of rows) {
        if (!futureIds.has(item.id)) sample(item, grammar, literal);
      }
    }
  }
  // /v bracket ClassSet syntax is observational, not a qualified singleton.
  for (const grammar of ['', 'u']) {
    for (const literal of [false, true]) {
      sample(row('singleton-k-class', '^([k]+)!$', join(kRun, bang),
                 [join(kRun, bang), kRun], [[0, 5], [0, 4]], [[0, 3], [0, 2]],
                 'unicode'), grammar, literal);
      sample(row('singleton-bmp-class', '^([' + string(E) + ']+)!$', join(eRun, bang),
                 [join(eRun, bang), eRun], [[0, 5], [0, 4]], [[0, 3], [0, 2]]),
             grammar, literal);
    }
  }
  activePartition = null;
  equal('fixed-case-count', cases, 380);
  equal('fixed-check-count', checks + 1, 3096);
  const primaryFailureCount = focus === 'all' ? failureCount :
    infrastructureFailures + partitions[focus].differenceCount;
  emit(encode({kind: 'quantified-singleton-profile', profile, actualWidth: width}));
  emit(encode({kind: 'ignore-case-nonascii-quantifiers', profile, cases, checks,
    expectedCases: 380, expectedChecks: 3096, focus,
    focusedPassed: primaryFailureCount === 0, allDesiredOraclesMet: failureCount === 0,
    focusedFailureCount: primaryFailureCount, infrastructureFailures, partitions,
    failureCount, failedCases: Array.from(failedCases), failures,
    failureDetailsTruncated: failureCount > failures.length,
    scope: 'Anchored consuming roots, one greedy unbounded scalar/singleton quantifier with min 0..3, outer captures only, no original disjunction',
    performanceTested: false}));

  checks = 0;
  phase = 'future';
  cases = 0;
  failureCount = 0;
  failures.length = 0;
  failedCases.clear();
  for (const grammar of ['', 'u', 'v']) {
    for (const literal of [false, true]) {
      for (const item of rows) {
        if (futureIds.has(item.id)) sample(item, grammar, literal);
      }
    }
  }
  equal('future-case-count', cases, 66);
  equal('future-check-count', checks + 1, 530);
  emit(encode({kind: 'future-quantifier-diagnostics', profile, gating: false,
    cases, checks, expectedCases: 66, expectedChecks: 530,
    desiredOraclesMet: failureCount === 0, differenceCount: failureCount,
    differingCases: Array.from(failedCases), differences: failures,
    differenceDetailsTruncated: failureCount > failures.length,
    note: 'Correct desired outcomes are retained; current failures are not declared correct or used to reject the primary slice'}));

  if (options.includes('--observe-excluded')) {
    const excluded = [
      ['nullable-root', '^(k*)$', empty],
      ['inner-capture', '^((k)+)!$', join(kRun, bang)],
      ['nested-quantifiers', '^(?:k+)+!$', join(kRun, bang)],
      ['quantified-choice', '^(?:k|' + string(K) + ')+!$', join(kRun, bang)],
      ['broad-class', '^([ks]+)!$', join(K, S, bang)],
      ['unanchored', '(k+)!', join(ascii('x'), K, bang)],
      ['changed-flags', '^(?-i:k+)!$', ascii('k!')],
      ['lookaround', '^(k+)(?=!)!$', join(kRun, bang)],
      ['backreference', '^(k+)\\1!$', ascii('kk!')],
      ['nullable-body', '^(?:k?)*!$', bang],
      ['v-singleton-classset', '^([k]+)!$', join(K, bang)],
      ['multiple-quantifiers', '^(k+)(s+)!$', join(K, S, bang)],
      ['non-ascii-choice-before-quantifier', '^(?:' + string(E) + '|' +
        string(SIGMA) + ')(' + string(E) + '+)!$', join(EC, E, EC, bang)],
      ['non-ascii-choice-after-quantifier', '^(' + string(E) + '+)(?:' +
        string(E) + '|' + string(SIGMA) + ')!$', join(EC, E, EC, bang)],
      ['second-non-ascii-quantifier', '^(' + string(E) + '+)(' +
        string(SIGMA) + '+)!$', join(EC, SMALL_SIGMA, bang)],
      ['changed-flags-in-non-ascii-body', '^((?-i:' + string(E) + ')+)!$',
        join(eRun, bang)],
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
    emit(encode({kind: 'excluded-observations', cases: observations.length,
      qualification: 'No expected result or correctness verdict for these excluded shapes',
      observations}));
  }
  if (primaryFailureCount !== 0) {
    throw Error('QUANTIFIED_SINGLETON_ORACLE: ' + primaryFailureCount);
  }
})();
