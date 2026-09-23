// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Ordinary JavaScript syntax; the guarded runner supplies optional type-tag
// inspection separately. Expected bytes never come from RegExp or a decoder.
(() => {
  const byteMode = String.fromCodePoint(233).length === 2;
  const red = globalThis.bytePatternRed === true;
  const engineControl = globalThis.bytePatternEngineControl === true;
  let checks = 0;
  const failures = [];
  const units = s => Array.from({length: s.length}, (_, i) => s.charCodeAt(i));
  const fixture = (bytes, utf16) => String.fromCharCode(...(byteMode ? bytes : utf16));
  const E = fixture([0xf0, 0x9f, 0x98, 0x80], [0xd83d, 0xde00]);
  const F = fixture([0xf0, 0x9f, 0x98, 0x81], [0xd83d, 0xde01]);
  const H = fixture([0xed, 0xa0, 0x80], [0xd800]);
  const J = fixture([0xed, 0xa0, 0x81], [0xd801]);
  const L = fixture([0xed, 0xb0, 0x80], [0xdc00]);
  const U = fixture([0xf0, 0x90, 0x80, 0x80], [0xd800, 0xdc00]);
  const T = fixture([0xf0, 0x90, 0x90, 0x80], [0xd801, 0xdc00]);
  const C = fixture([0xc3, 0xa9], [0xe9]);
  const Z = fixture([0xe4, 0xb8, 0xad], [0x4e2d]);
  const e = byteMode ? 4 : 2;
  const h = byteMode ? 3 : 1;
  const c = byteMode ? 2 : 1;
  const z = byteMode ? 3 : 1;
  const syntax = 'syntax-error';
  function encode(value) {
    return JSON.stringify(value, (_key, item) => item === undefined ? {undefined: true} : item);
  }
  function equal(actual, expected, id) {
    ++checks;
    if (encode(actual) === encode(expected)) return;
    const failure = {id, actual, expected};
    if (red) failures.push(failure);
    else throw Error('BYTE_PATTERN_ASSERT ' + encode(failure));
  }
  function sample(id, pattern, flags, subject, text, indices, literal = false, start) {
    let re;
    let error;
    try { re = literal ? eval('/' + pattern + '/' + flags) : new RegExp(pattern, flags); }
    catch (caught) { error = caught.name; }
    equal(error, text === syntax ? 'SyntaxError' : undefined, id + ': compilation');
    if (error || text === syntax) return;
    equal(units(re.source), units(pattern), id + ': source');
    equal(re.flags, Array.from(flags).sort().join(''), id + ': flags');
    equal(re.unicode, flags.includes('u'), id + ': unicode');
    equal(re.unicodeSets, flags.includes('v'), id + ': unicodeSets');
    for (let repeat = 0; repeat < 3; ++repeat) {
      if (flags.includes('g') || flags.includes('y')) re.lastIndex = start ?? 0;
      const found = re.exec(subject);
      const actual = found && {
        text: Array.from(found, value => value === undefined ? undefined : units(value)),
        index: found.index, indices: found.indices, input: units(found.input),
      };
      const wanted = text === null ? null : {
        text: text.map(value => value === undefined ? undefined : units(value)),
        index: indices[0][0], indices: flags.includes('d') ? indices : undefined,
        input: units(subject),
      };
      equal(actual, wanted, id + ': match');
      if (flags.includes('g') || flags.includes('y')) {
        equal(re.lastIndex, text === null ? 0 : indices[0][1], id + ': lastIndex');
      }
    }
    return re;
  }
  function whole(id, pattern, flags, subject, width, capture = false, literal = false) {
    sample(id, pattern, flags, subject, capture ? [subject, subject] : [subject],
           capture ? [[0, width], [0, width]] : [[0, width]], literal);
  }

  if (red) {
    sample('default-quantifier', '^' + E + '+$', 'd', E + E,
           byteMode ? [E + E] : null, [[0, 8]]);
    sample('default-capture', '^a(' + E + '+)b$', 'd', 'a' + E + E + 'b',
           byteMode ? ['a' + E + E + 'b', E + E] : null, [[0, 10], [1, 9]]);
    sample('default-range', '^([' + E + '-' + F + ']+)$', 'd', E + F,
           byteMode ? [E + F, E + F] : syntax, [[0, 8], [0, 8]], true);
    sample('escaped-lone', '^a(\\uD800+)b$', 'd', 'a' + H + H + 'b',
           ['a' + H + H + 'b', H + H], [[0, 2 + 2 * h], [1, 1 + 2 * h]]);
    sample('raw-pair-own', '^(' + H + L + ')$', 'du', H + L,
           [H + L, H + L], [[0, 2 * h], [0, 2 * h]]);
    sample('literal-pair-own', '^(' + H + L + ')$', 'du', H + L,
           [H + L, H + L], [[0, 2 * h], [0, 2 * h]], true);
    console.log(encode({kind: 'byte-pattern-red', byteMode, checks, failures}));
    return;
  }

  for (const grammar of ['', 'u', 'v']) {
    const flags = 'd' + grammar;
    const unicodeCharacters = byteMode || grammar !== '';
    for (const literal of [false, true]) {
      sample('astral-plus', '^' + E + '+$', flags, E + E,
             unicodeCharacters ? [E + E] : null, [[0, 2 * e]], literal);
      sample('captured-astral', '^a(' + E + '+)b$', flags, 'a' + E + E + 'b',
             unicodeCharacters ? ['a' + E + E + 'b', E + E] : null,
             [[0, 2 + 2 * e], [1, 1 + 2 * e]], literal);
      sample('capture-repeated', '^(' + E + '){2}$', flags, E + E,
             [E + E, E], [[0, 2 * e], [e, 2 * e]], literal);
      sample('one-not-two', '^' + E + '{2}$', flags, E, null, undefined, literal);
      sample('astral-class', '^([' + E + '])$', flags, E,
             unicodeCharacters ? [E, E] : null, [[0, e], [0, e]], literal);
      sample('astral-range', '^([' + E + '-' + F + ']+)$', flags, E + F,
             unicodeCharacters ? [E + F, E + F] : syntax,
             [[0, 2 * e], [0, 2 * e]], literal);
      sample('astral-range-negative', '^([' + E + '-' + F + ']+)$', flags, U,
             unicodeCharacters ? null : syntax, undefined, literal);
      sample('reversed-range', '[' + F + '-' + E + ']', flags, '', syntax, undefined, literal);
      sample('escaped-pair-plus', '^(\\uD83D\\uDE00+)$', flags, E + E,
             unicodeCharacters ? [E + E, E + E] : null,
             [[0, 2 * e], [0, 2 * e]], literal);
      sample('escaped-pair-range', '^([\\uD83D\\uDE00-\\uD83D\\uDE01])$', flags, F,
             unicodeCharacters ? [F, F] : syntax, [[0, e], [0, e]], literal);
      sample('escaped-lone-plus', '^a(\\uD800+)b$', flags, 'a' + H + H + 'b',
             ['a' + H + H + 'b', H + H], [[0, 2 + 2 * h], [1, 1 + 2 * h]], literal);
      whole('escaped-surrogate-range', '^([\\uD800-\\uD801])$', flags, J, h, true, literal);
      whole('negative-astral-class', '^([^' + E + '])$', flags, H, h, true, literal);
      sample('negative-astral-reject', '^([^' + E + '])$', flags, E, null, undefined, literal);
      sample('alternative-optional', '^(?:' + E + '|' + F + ')(' + E + '?)$', flags, F + E,
             [F + E, E], [[0, 2 * e], [e, 2 * e]], literal);

      // A raw pair and an escaped pair are different source constructions.
      for (const [id, pattern, rawPair] of [
        ['raw-pair', H + L, true], ['raw-scalar', U, false],
        ['fixed-escape-pair', '\\uD800\\uDC00', false],
      ]) {
        const source = '^(' + pattern + ')$';
        const positive = byteMode && rawPair ? H + L : U;
        const width = byteMode ? (rawPair ? 6 : 4) : 2;
        whole(id, source, flags, positive, width, true, literal);
        if (byteMode) sample(id + '-identity-negative', source, flags,
                            rawPair ? U : H + L, null, undefined, literal);
      }
      for (const pattern of [H + '\\uDC00', '\\uD800' + L,
                             ...(grammar ? ['\\u{D800}\\u{DC00}', '\\uD800\\u{DC00}'] : [])]) {
        const accepts = byteMode || grammar === '';
        sample('mixed-boundaries', '^(' + pattern + ')$', flags, H + L,
               accepts ? [H + L, H + L] : null, [[0, 2 * h], [0, 2 * h]], literal);
        if (byteMode) sample('mixed-not-scalar', '^(' + pattern + ')$', flags, U,
                            null, undefined, literal);
      }
      for (const [subject, width, stockUnicode] of [[H, h, false], [L, h, false], [U, e, true]]) {
        const accepts = byteMode || grammar === '' ? !stockUnicode : stockUnicode;
        sample('raw-class-identity', '^([' + H + L + '])$', flags, subject,
               accepts ? [subject, subject] : null, [[0, width], [0, width]], literal);
      }
      whole('nonadjacent-surrogates', '^(' + H + 'A' + L + ')$', flags,
            H + 'A' + L, 2 * h + 1, true, literal);
      sample('raw-pair-quantifier-binding', '^(' + H + L + '{2})$', flags,
             H + L + L, byteMode || grammar === '' ? [H + L + L, H + L + L] : null,
             [[0, 3 * h], [0, 3 * h]], literal);
    }

    // These legacy grammar controls carry separate default and strict oracles.
    const legacy = [
      ['identity-astral', '^\\' + E + '+$', E + E, 2 * e, byteMode],
      ['identity-octal', '^\\q\\141' + E + '+$', 'qa' + E + E, 2 + 2 * e, byteMode],
      ['identity-k', '^\\k<z>' + E + '$', 'k<z>' + E, 4 + e, true],
      ['invalid-hex-reset', '^' + E + '\\xZ$', E + 'xZ', e + 2, true],
      ['invalid-unicode-reset', '^' + E + '\\u0G00$', E + 'u0G00', e + 5, true],
      ['interval-reset', '^' + E + '{2,' + Z + '}$', E + '{2,' + Z + '}',
       e + (byteMode ? 7 : 5), true],
      ['decimal-identity', '^' + E + '\\8$', E + '8', e + 1, true],
      ['class-endpoint', '^[a-\\d]' + E + '$', '-' + E, e + 1, true],
      ['class-control', '^[\\c_]' + E + '$', '\x1f' + E, e + 1, true],
      ['quantified-lookahead', '^(?=' + E + ')?' + E + '$', E, e, true],
    ];
    for (const [id, pattern, subject, width, accepted] of legacy) {
      for (const literal of [false, true]) {
        sample(id, pattern, flags, subject, grammar ? syntax : accepted ? [subject] : null,
               [[0, width]], literal);
      }
    }
    sample('literal-braces', '^](' + E + ')}$', flags, ']' + E + '}',
           grammar ? syntax : [']' + E + '}', E], [[0, e + 2], [1, e + 1]]);
    sample('decimal-reset-octal', '^\\2' + E + '(a)$', flags, '\x02' + E + 'a',
           grammar ? syntax : ['\x02' + E + 'a', 'a'], [[0, e + 2], [e + 1, e + 2]]);
    sample('braced-legacy', '^\\u{2}$', flags, 'uu', grammar ? null : ['uu'], [[0, 2]]);
    if (grammar) whole('braced-unicode', '^\\u{2}$', flags, '\x02', 1);
    sample('property-legacy', '^\\p{ASCII}$', flags, 'p{ASCII}',
           grammar ? null : ['p{ASCII}'], [[0, 8]]);
    if (grammar) whole('property-unicode', '^\\p{ASCII}$', flags, 'A', 1);
    whole('hex-character', '^\\xE9$', flags, C, c);

    whole('forward-reference', '^\\1(' + E + ')$', flags, E, e, true);
    sample('capture-prescan', '^(' + E + ')\\2(' + C + ')$', flags, E + C,
           [E + C, E, C], [[0, e + c], [0, e], [e, e + c]]);
    for (const [name, key] of [[T, T], ['\\u{10400}', T], ['\\uD801\\uDC00', T],
                               ['a\\u0062' + T, 'ab' + T], [T + '\\u0062', T + 'b']]) {
      const re = sample('named-reset', '^(?<' + name + '>' + E + ')\\k<' + name + '>$',
                        flags, E + E, [E + E, E], [[0, 2 * e], [0, e]]);
      const m = re.exec(E + E);
      equal(Object.keys(m.groups).map(units), [units(key)], 'named key bytes');
      equal(units(m.groups[key]), units(E), 'named value bytes');
      equal(m.indices.groups[key], [0, e], 'named index');
      for (const literal of [false, true]) {
        sample('named-forward-after-astral', '^' + E + '\\k<' + name + '>(?<' + name + '>' + C + ')$',
               flags, E + C, [E + C, C], [[0, e + c], [e, e + c]], literal);
      }
    }
    sample('lone-name', '^(?<\\uD800>' + E + ')$', flags, E, syntax);
    sample('raw-pair-name', '^(?<' + H + L + '>' + E + ')$', flags, E,
           byteMode ? syntax : [E, E], [[0, e], [0, e]]);
    for (const literal of [false, true]) {
      for (const tail of ['x', 'u']) {
        sample('escape-at-eof', E + '\\' + tail, flags, E + tail,
               grammar ? syntax : [E + tail], [[0, e + 1]], literal);
      }
      for (const incomplete of ['^(?<' + T, '^(?<a\\u00']) {
        sample('name-at-eof', incomplete, flags, '', syntax, undefined, literal);
      }
    }

    const pair = H + L;
    const subject = E + pair + '|' + pair;
    const bounds = byteMode ? [[4, 10], [11, 17]] : [[2, 4], [5, 7]];
    const re = new RegExp('(' + pair + ')', 'dg' + grammar);
    const found = Array.from(subject.matchAll(re));
    equal(found.map(m => units(m[1])), [units(pair), units(pair)], 'global pair text');
    equal(found.map(m => m.indices), bounds.map(p => [p, p]), 'global pair indices');
    const offsets = [];
    equal(subject.replace(re, (_whole, _capture, offset) => {
      offsets.push(offset); return 'X';
    }), E + 'X|X', 'replacement closure');
    equal(offsets, byteMode ? [4, 11] : [2, 5], 'callback byte offsets');
    sample('sticky-exact', '(' + pair + ')', 'dy' + grammar, subject, [pair, pair],
           [bounds[0], bounds[0]], false, byteMode ? 4 : 2);
    if (byteMode) sample('sticky-interior', '(' + pair + ')', 'dy' + grammar,
                         subject, null, undefined, false, 5);
  }

  // These omit d/u/v so initial experimental eligibility is actually tested.
  if (engineControl) {
    const tag = globalThis.bytePatternEngineTag;
    const ascii = sample('linear-ascii-control', '^([a-z]{2})X$', 'l', 'abX',
                         ['abX', 'ab'], [[0, 3], [0, 2]]);
    equal(tag(ascii), 'EXPERIMENTAL', 'ASCII linear engine route');
    sample('linear-reference-rejected', '^(a)\\1$', 'l', 'aa', syntax);
    const astral = sample('experimental-astral', '^a(' + E + '+)b$', '', 'a' + E + E + 'b',
                          byteMode ? ['a' + E + E + 'b', E + E] : null,
                          [[0, 10], [1, 9]]);
    const pair = sample('experimental-raw-pair', '^(' + H + L + ')$', '', H + L,
                        [H + L, H + L], [[0, 2 * h], [0, 2 * h]]);
    for (const re of [astral, pair]) {
      equal(!byteMode || tag(re) !== 'EXPERIMENTAL', true, 'nonASCII initial engine gate');
    }
    for (const [pattern, subject, width, capture] of [
      [C, C, c, false], ['[' + C + ']', C, c, false],
      ['^([' + C + ']+)$', C + C, 2 * c, true],
      ['^(?:' + C + '|' + C + C + ')X$', C + C + 'X', 2 * c + 1, false],
    ]) {
      const re = sample('experimental-BMP', pattern, '', subject,
                        capture ? [subject, subject] : [subject],
                        capture ? [[0, width], [0, width]] : [[0, width]]);
      equal(!byteMode || tag(re) !== 'EXPERIMENTAL', true, 'BMP initial engine gate');
    }
    for (const [pattern, subject, width] of [[C, C, c], [E, E, e], [H, H, h], ['[' + C + ']', C, c]]) {
      const re = sample('linear-nonASCII', pattern, 'l', subject,
                        byteMode ? syntax : [subject], [[0, width]]);
      if (!byteMode) equal(tag(re), 'EXPERIMENTAL', 'stock nonASCII linear route');
    }
  }

  // JS String-literal construction remains different from raw concatenation.
  equal(units('\uD800\uDC00'), units(U), 'JS adjacent escape pairing unchanged');
  equal(units(H + L), byteMode ? [0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80] : [0xd800, 0xdc00],
        'concatenation identity unchanged');
  if (byteMode) {
    const R = String.fromCharCode(0xe1, 0x80);
    const B = String.fromCharCode(0xff);
    const canonicalR = String.fromCharCode(0xc3, 0xa1, 0xc2, 0x80);
    const canonicalB = String.fromCharCode(0xc3, 0xbf);
    for (const [raw, width, canonical, canonicalWidth, escaped, classes] of [
      [R, 2, canonicalR, 4, '\\xE1\\x80', '[\\xE1][\\x80]'],
      [B, 1, canonicalB, 2, '\\xFF', '[\\xFF]'],
    ]) {
      for (const grammar of ['', 'u', 'v']) {
        for (const [needle, size, alternate] of [
          [raw, width, canonical], [raw + E, width + 4, canonical + E],
          [E + raw, width + 4, E + canonical], [raw + H + L, width + 6, raw + U],
          [H + L + raw, width + 6, U + raw],
          ['ab' + raw + E + 'cd', width + 8, 'ab' + canonical + E + 'cd'],
          [raw + C, width + 2, canonical + C], [C + raw, width + 2, C + canonical],
          ['ab' + raw + C + 'cd', width + 6, 'ab' + canonical + C + 'cd'],
        ]) {
          sample('malformed-plain-atom', needle, 'd' + grammar, Z + needle + '!',
                 [needle], [[3, 3 + size]]);
          sample('malformed-not-canonical', needle, 'd' + grammar, Z + alternate + '!', null);
          if (typeof globalThis.bytePatternTypeTag === 'function') {
            equal(globalThis.bytePatternTypeTag(new RegExp(needle, grammar)), 'ATOM',
                  'mixed malformed literal route');
          }
        }
        for (const pattern of [escaped + E, classes + E]) {
          sample('escaped-canonical-not-raw', pattern, 'd' + grammar, raw + E, null);
          whole('escaped-canonical', pattern, 'd' + grammar, canonical + E, canonicalWidth + 4);
        }
      }
    }
    const encoded = String.fromCharCode(0xc3, 0xa1, 0xc2, 0x80);
    whole('hex-not-malformed-pattern', '\\xE1\\x80', 'd', encoded, 4);
  }

  if (typeof globalThis.bytePatternTypeTag === 'function') {
    for (const [source, text, width, stockTag, byteTag = 'ATOM'] of [
      ['abcdef', 'abcdef', 6, 'ATOM'], ['ab' + C + 'cd', 'ab' + C + 'cd', 4 + c, 'ATOM'],
      ['ab' + E + 'cd', 'ab' + E + 'cd', 4 + e, 'ATOM'],
      ['ab' + H + L + 'cd', 'ab' + H + L + 'cd', 4 + 2 * h, 'ATOM'],
      ['ab\\uD800\\uDC00cd', 'ab' + U + 'cd', 4 + e, 'ATOM'],
      ['(?:ab' + E + 'cd)', 'ab' + E + 'cd', 4 + e, 'IRREGEXP'],
      ['ab(?:' + E + H + ')cd', 'ab' + E + H + 'cd', 4 + e + h, 'IRREGEXP'],
      ['ab' + H + '\\uDC00cd', 'ab' + H + L + 'cd', 4 + 2 * h, 'ATOM'],
      ['aaaaaa', 'aaaaaa', 6, 'IRREGEXP', 'IRREGEXP'],
      ['\\x61'.repeat(6), 'aaaaaa', 6, 'IRREGEXP', 'IRREGEXP'],
      ['[a]'.repeat(6), 'aaaaaa', 6, 'IRREGEXP', 'IRREGEXP'],
      ['(?:aaaaaa)', 'aaaaaa', 6, 'IRREGEXP', 'IRREGEXP'],
      ['aa', 'aa', 2, 'ATOM'],
    ]) {
      const re = sample('literal-search-result', source, 'd', Z + text + '!',
                        [text], [[z, z + width]]);
      equal(globalThis.bytePatternTypeTag(re), byteMode ? byteTag : stockTag,
            'literal AtomCompile: ' + source);
    }
    for (const [source, flags] of [['(' + E + ')', ''], ['^' + E + '$', ''],
                                  [E + '+', ''], [E + '|' + F, ''],
                                  [E, 'y'], ['(?m:abcdef)', '']]) {
      equal(globalThis.bytePatternTypeTag(new RegExp(source, flags)), 'IRREGEXP',
            'nonliteral routing: ' + source);
    }
    equal(globalThis.bytePatternTypeTag(new RegExp('\ufffd')),
          byteMode ? 'IRREGEXP' : 'ATOM', 'decoder-sensitive replacement routing');
  }
  console.log(JSON.stringify({kind: 'byte-pattern-character-formation', byteMode, checks,
                             engineControl,
                             typeTags: typeof globalThis.bytePatternTypeTag === 'function'}));
})();
