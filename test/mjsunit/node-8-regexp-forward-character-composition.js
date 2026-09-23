// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Independent character/byte oracles. For flagless node-8 Unicode matching,
// stock controls explicitly use u; no legacy grammar feature is used here.
(() => {
  const byteMode = String.fromCodePoint(233).length === 2;
  const engineControl = globalThis.forwardEngineControl === true;
  let checks = 0;
  const raw = (...bytes) => String.fromCharCode(...bytes);
  const units = value => Array.from({length: value.length}, (_, i) => value.charCodeAt(i));
  function encode(value) {
    return JSON.stringify(value, (_key, item) =>
      item === undefined ? {undefined: true} : item);
  }
  function equal(actual, expected, context) {
    ++checks;
    if (encode(actual) !== encode(expected)) {
      throw new Error('FORWARD_CHARACTER_ASSERT ' + encode({actual, expected, context}));
    }
  }
  function semanticFlags(flags) {
    return !byteMode && !flags.includes('u') && !flags.includes('v') ? flags + 'u' : flags;
  }
  function match(pattern, flags, subject, text, indices, start) {
    const mode = semanticFlags(flags);
    const re = new RegExp(pattern, 'd' + mode);
    equal(re.flags, Array.from('d' + mode).sort().join(''), 'observable flags: ' + pattern);
    for (let repeat = 0; repeat < 3; ++repeat) {
      if (start !== undefined) re.lastIndex = start;
      const found = re.exec(subject);
      equal(found && Array.from(found, item => item === undefined ? undefined : units(item)),
            text && text.map(item => item === undefined ? undefined : units(item)),
            pattern + '/' + flags + ': text');
      if (text !== null) {
        equal(found?.indices, indices, pattern + ': indices');
        equal(found?.index, indices[0][0], pattern + ': index');
        equal(found?.input, subject, pattern + ': input');
      }
      if (flags.includes('g') || flags.includes('y')) {
        equal(re.lastIndex, text === null ? 0 : indices[0][1], pattern + ': lastIndex');
      }
    }
  }
  function collect(re, subject, limit) {
    const iterator = subject.matchAll(re);
    const rows = [];
    for (let i = 0; i <= limit; ++i) {
      const next = iterator.next();
      if (next.done) return rows;
      rows.push(next.value);
    }
    throw new Error('FORWARD_CHARACTER_ASSERT bounded iterator');
  }
  function loopCase(prefix, atom, body, width, flags) {
    const subject = prefix + body + 'b';
    const end = prefix.length + width;
    // Keep the uncaptured shapes that can take fixed-loop optimizations, and
    // independently check an outer capture without changing the loop body.
    match('^' + prefix + atom + 'b$', flags, subject, [subject], [[0, end + 1]]);
    match('^' + prefix + '(' + atom + ')b$', flags, subject, [subject, body],
          [[0, end + 1], [prefix.length, end]]);
    match('^' + prefix + atom + 'b$', flags, prefix + body + 'c', null);
    match('^' + prefix + '(' + atom + ')b$', flags, prefix + body + 'c', null);
  }
  function boundedNegated(value, width, flags) {
    match('^([^q]{1,2})$', flags, value, [value, value], [[0, width], [0, width]]);
    for (const atom of ['[^q]{1,2}', '[^q]+?']) {
      match('^(' + atom + ')X$', flags, value + 'AX', [value + 'AX', value + 'A'],
            [[0, width + 2], [0, width + 1]]);
    }
    match('([^q]{1,2})X', flags, 'q' + value + 'AX', [value + 'AX', value + 'A'],
          [[1, width + 3], [1, width + 2]]);
  }
  function builtinComplements(value, width, flags) {
    for (const atom of ['\\D', '\\W', '\\S']) {
      match('^a(' + atom + ')b$', flags, 'a' + value + 'b', ['a' + value + 'b', value],
            [[0, width + 2], [1, width + 1]]);
      for (const repeated of [atom + '+', '[' + atom + ']{1,2}']) {
        const pair = value + value;
        match('^a(' + repeated + ')b$', flags, 'a' + pair + 'b', ['a' + pair + 'b', pair],
              [[0, width * 2 + 2], [1, width * 2 + 1]]);
      }
    }
  }
  function denseNegated(count) {
    return '[^' + Array.from({length: count}, (_, i) =>
      '\\x' + (i * 2).toString(16).padStart(2, '0')).join('') + ']';
  }
  function denseComposition(atom, value, width, flags) {
    match('^a(' + atom + ')b$', flags, 'a' + value + 'b', ['a' + value + 'b', value],
          [[0, width + 2], [1, width + 1]]);
    // One decoded character cannot become two matches through a low-seven-bit
    // alias in the ASCII dispatch table, including malformed prefixes.
    match('^a(' + atom + '{2})b$', flags, 'a' + value + 'b', null);
    match('^z(' + atom + '+)!$', flags, 'z' + value + '!!', ['z' + value + '!!', value + '!'],
          [[0, width + 3], [1, width + 2]]);
  }

  // The shortest frozen red is intentionally first.
  match('^a(.)b$', 'u', 'aéb', ['aéb', 'é'],
        [[0, byteMode ? 4 : 3], [1, byteMode ? 3 : 2]]);
  const values = [['A', 1, 1], ['é', 1, 2], ['中', 1, 3], ['😀', 2, 4],
                  ['\ud800', 1, 3], ['\udc00', 1, 3], ['\ufffd', 1, 3], ['\0', 1, 1]];
  for (const flags of ['', 'u', 'v']) {
    equal(new RegExp('a', flags).flags, flags, 'requested flags stay observable');
    for (const [value, utf16, bytes] of values) {
      const width = byteMode ? bytes : utf16;
      const cjk = byteMode ? 3 : 1;
      match('^a(.)b$', flags, 'a' + value + 'b', ['a' + value + 'b', value],
            [[0, width + 2], [1, width + 1]]);
      match('^a([^q])b$', flags, 'a' + value + 'b', ['a' + value + 'b', value],
            [[0, width + 2], [1, width + 1]]);
      match('^key=([^&]{2})!$', flags, 'key=' + value + '中!',
            ['key=' + value + '中!', value + '中'],
            [[0, 5 + width + cjk], [4, 4 + width + cjk]]);
      match('^(.{2})$', flags, value + '中', [value + '中', value + '中'],
            [[0, width + cjk], [0, width + cjk]]);
      match('^(.)(?=.)(.)$', flags, value + 'A', [value + 'A', value, 'A'],
            [[0, width + 1], [0, width], [width, width + 1]]);
      match('^(?:(.)X|([^&])Y)$', flags, value + 'Y', [value + 'Y', undefined, value],
            [[0, width + 1], undefined, [0, width]]);
      match('^(?!(.)X)(.)Y$', flags, value + 'Y', [value + 'Y', undefined, value],
            [[0, width + 1], undefined, [0, width]]);
      for (const repeat of ['.*', '.*?']) {
        match(`^(${repeat})(.)!$`, flags, value + 'A!', [value + 'A!', value, 'A'],
              [[0, width + 2], [0, width], [width, width + 1]]);
      }
      match('^((.)?)!$', flags, value + '!', [value + '!', value, value],
            [[0, width + 1], [0, width], [0, width]]);
      match('^(?=(.))(.)(?!.)$', flags, value, [value, value, value],
            [[0, width], [0, width], [0, width]]);
      const named = new RegExp('^a(?<part>.)b$', 'd' + semanticFlags(flags)).exec('a' + value + 'b');
      equal(named?.groups, {part: value}, 'named capture text');
      equal(named?.indices.groups, {part: [1, 1 + width]}, 'named capture bounds');
    }
    for (const [line, width] of [['\n', 1], ['\r', 1], ['\u2028', byteMode ? 3 : 1],
                                 ['\u2029', byteMode ? 3 : 1]]) {
      match('^a(.)b$', flags, 'a' + line + 'b', null);
      match('^a(.)b$', 's' + flags, 'a' + line + 'b', ['a' + line + 'b', line],
            [[0, width + 2], [1, width + 1]]);
      match('^a([\\s\\S])b$', flags, 'a' + line + 'b', ['a' + line + 'b', line],
            [[0, width + 2], [1, width + 1]]);
    }
    match('^a(.)b$', flags, 'a\u0085b', ['a\u0085b', '\u0085'],
          [[0, byteMode ? 4 : 3], [1, byteMode ? 3 : 2]]);
    match('^((.)?)!$', flags, '!', ['!', '', undefined], [[0, 1], [0, 0], undefined]);
    match('^(.*)!$', flags, '!', ['!', ''], [[0, 1], [0, 0]]);
    match('^(.)$', flags, '', null);
    match('(?=.)', flags, '', null);
    match('(?=.)', flags, 'é', [''], [[0, 0]]);
    match('(?!.)', flags, 'é', [''], [[byteMode ? 2 : 1, byteMode ? 2 : 1]]);
    match('(?:[^é])X', flags, 'éX', null);
    match('(?:[\ufffd])X', flags, 'éX', null);
    match('(?:^|[^é])X', flags, 'éX', null);
    match('(?:^|[\ufffd])X', flags, 'éX', null);
    match('([^é])ZZZZ', flags, 'éZZZZ', null);
    match('(?:^|[^é])ZZZZ', flags, 'éZZZZ', null);
    match('^([^\ufffd])!$', flags, 'é!', ['é!', 'é'],
          [[0, byteMode ? 3 : 2], [0, byteMode ? 2 : 1]]);
    const prefix = 'x'.repeat(32);
    match('(x?)(.)$', flags, prefix + '😀', ['x😀', 'x', '😀'],
          [[31, byteMode ? 36 : 34], [31, 32], [32, byteMode ? 36 : 34]]);
    match('a?((?:.){1,2})$', flags, prefix + 'é😀', ['é😀', 'é😀'],
          [[32, byteMode ? 38 : 35], [32, byteMode ? 38 : 35]]);
    const body = 'é中😀';
    const ends = byteMode ? [0, 2, 5, 9] : [0, 1, 2, 4];
    const all = collect(new RegExp('(.)', 'dg' + semanticFlags(flags)), body, 3);
    equal(all.map(m => m[1]), ['é', '中', '😀'], 'global captured characters');
    equal(all.map(m => m.indices), ends.slice(1).map((end, i) =>
      [[ends[i], end], [ends[i], end]]), 'global captured bounds');
    equal(body.replace(new RegExp('(.)', 'g' + semanticFlags(flags)), '<$1>'),
          '<é><中><😀>', 'capture replacement closure');
    equal(('aéb中c').split(new RegExp('([^a-c])', semanticFlags(flags))),
          ['a', 'é', 'b', '中', 'c'], 'captured split');
    for (const [prefix, atom, bodies] of [
      ['a', '.*', [['', 0, 0], ['A', 1, 1], ['é', 1, 2], ['éA', 2, 3],
                   ['Aé', 2, 3], ['éAbZ', 4, 5]]],
      ['', '(?:a.)*', [['', 0, 0], ['aA', 2, 2], ['aé', 2, 3], ['aéaA', 4, 5],
                      ['aAaé', 4, 5], ['abaé', 4, 5]]],
      ['', '(?:..)*', [['', 0, 0], ['AA', 2, 2], ['éA', 2, 3], ['Aé', 2, 3],
                      ['é中', 2, 5], ['aé中a', 4, 7]]],
    ]) {
      for (const [body, utf16, bytes] of bodies) {
        loopCase(prefix, atom, body, byteMode ? bytes : utf16, flags);
      }
    }
    for (const [value, utf16, bytes] of [['A', 1, 1], ['é', 1, 2], ['😀', 2, 4]]) {
      boundedNegated(value, byteMode ? bytes : utf16, flags);
    }
    match('ZZZZ(.)', flags, 'éZZZZ中', ['ZZZZ中', '中'],
          byteMode ? [[2, 9], [6, 9]] : [[1, 6], [5, 6]]);
    // These regex sources contain only ASCII even without u/v. The holes at
    // NBSP and BOM in \S must not make its surrogate/astral membership unsafe.
    for (const [value, utf16, bytes] of [['é', 1, 2], ['😀', 2, 4], ['\ud800', 1, 3]]) {
      builtinComplements(value, byteMode ? bytes : utf16, flags);
    }
    for (const [atom, ascii, excluded] of [
      ['\\D', 'A', ['7']],
      ['\\W', '!', ['A', '7', '_']],
      ['\\S', 'A', [' ', '\u00a0', '\ufeff']],
    ]) {
      match('^a(' + atom + ')b$', flags, 'a' + ascii + 'b', ['a' + ascii + 'b', ascii],
            [[0, 3], [1, 2]]);
      for (const value of excluded) match('^a(' + atom + ')b$', flags, 'a' + value + 'b', null);
    }
    for (const count of [16, 17, 64]) {
      const atom = denseNegated(count);
      const ascii = count === 64 ? Array.from({length: 128}, (_, i) => i) :
        [0, 1, count * 2 - 2, count * 2 - 1, 126, 127];
      for (const code of ascii) {
        const value = raw(code);
        const accepted = code % 2 === 1 || code >= count * 2;
        match('^(' + atom + ')$', flags, value, accepted ? [value, value] : null,
              accepted ? [[0, 1], [0, 1]] : undefined);
      }
      for (const [value, utf16, bytes] of [
        ['!', 1, 1], ['é', 1, 2], ['😀', 2, 4], ['\ud800', 1, 3],
      ]) denseComposition(atom, value, byteMode ? bytes : utf16, flags);
    }
  }

  if (byteMode) {
    // Every entry is exactly one malformed maximal subpart at EOF or before
    // ASCII. Expected captures are original bytes, never normalized U+FFFD.
    const malformed = [[0x80], [0xc0], [0xc1], [0xf5], [0xff], [0xc2], [0xe0],
                       [0xe1, 0x80], [0xed, 0xa0], [0xf0, 0x90],
                       [0xf0, 0x90, 0x80], [0xf4, 0x8f, 0xbf]];
    for (const flags of ['', 'u', 'v']) {
      for (const bytes of malformed) {
        const value = raw(...bytes);
        const width = bytes.length;
        for (const atom of ['.', '[^é]', '[\ufffd]', '\ufffd', '\\uFFFD']) {
          match(`^a(${atom})b$`, flags, 'a' + value + 'b', ['a' + value + 'b', value],
                [[0, width + 2], [1, width + 1]]);
          match(`^(${atom})$`, flags, value, [value, value], [[0, width], [0, width]]);
        }
        for (const atom of ['\ufffd', '\\uFFFD']) {
          match(atom, flags, value, [value], [[0, width]]);
          match('a' + atom + 'b', flags, 'a' + value + 'b', ['a' + value + 'b'], [[0, width + 2]]);
        }
        match('^a([^\ufffd])b$', flags, 'a' + value + 'b', null);
        match('^(?=([\ufffd]))(.)$', flags, value, [value, value, value],
              [[0, width], [0, width], [0, width]]);
      }
      const valid = [[0xc2, 0x80], [0xdf, 0xbf], [0xe0, 0xa0, 0x80],
                     [0xed, 0x9f, 0xbf], [0xed, 0xa0, 0x80], [0xed, 0xbf, 0xbf],
                     [0xef, 0xbf, 0xbf], [0xf0, 0x90, 0x80, 0x80],
                     [0xf4, 0x8f, 0xbf, 0xbf]];
      for (const bytes of valid) {
        const value = raw(...bytes);
        match('^a(.)b$', flags, 'a' + value + 'b', ['a' + value + 'b', value],
              [[0, bytes.length + 2], [1, bytes.length + 1]]);
        match('^a([\ufffd])b$', flags, 'a' + value + 'b', null);
        match('(?:[\ufffd])X', flags, value + 'X', null);
      }
      // A noncontinuation ends the malformed subpart without consuming the
      // following valid character. These tables are independent of the engine.
      for (const [bad, good] of [
        [[0xc2], [0xc3, 0xa9]],
        [[0xe1, 0x80], [0xc3, 0xa9]],
        [[0xf0, 0x90, 0x80], [0xe4, 0xb8, 0xad]],
      ]) {
        const first = raw(...bad);
        const second = raw(...good);
        const whole = first + second;
        for (const pattern of ['^(.)(.)$', '^([\ufffd])(.)$']) {
          match(pattern, flags, whole, [whole, first, second],
                [[0, bad.length + good.length], [0, bad.length],
                 [bad.length, bad.length + good.length]]);
        }
      }
      const endMalformed = raw(0xe1, 0x80);
      builtinComplements(endMalformed, 2, flags);
      for (const count of [16, 17, 64]) {
        for (const bytes of [[0x80], [0x81], [0xe1, 0x81], [0xf1, 0x81, 0x81]]) {
          denseComposition(denseNegated(count), raw(...bytes), bytes.length, flags);
        }
      }
      match('ZZZZ([\ufffd])X', flags, 'éZZZZ' + endMalformed + 'X',
            ['ZZZZ' + endMalformed + 'X', endMalformed], [[2, 9], [6, 8]]);
      match('([\ufffd])X', flags, 'é' + endMalformed + 'X',
            [endMalformed + 'X', endMalformed], [[2, 5], [2, 4]]);
      match('ZZZZ([^é])X', flags, 'éZZZZéX', null);
      match('((?:.){1,2})$', flags, 'x'.repeat(32) + 'é' + endMalformed,
            ['é' + endMalformed, 'é' + endMalformed], [[32, 36], [32, 36]]);
      match('(.?)$', flags, 'x'.repeat(32) + endMalformed,
            [endMalformed, endMalformed], [[32, 34], [32, 34]]);
      boundedNegated(endMalformed, 2, flags);
      for (const [prefix, atom, bodies] of [
        ['a', '.*', [[endMalformed, 2], [endMalformed + 'A', 3], ['A' + endMalformed, 3]]],
        ['', '(?:a.)*', [['a' + endMalformed, 3], ['a' + endMalformed + 'aA', 5],
                        ['aAa' + endMalformed, 5]]],
        ['', '(?:..)*', [[endMalformed + 'A', 3], ['A' + endMalformed, 3],
                        [endMalformed + 'AéA', 6], ['A' + endMalformed + 'Aé', 6]]],
      ]) {
        for (const [body, width] of bodies) loopCase(prefix, atom, body, width, flags);
      }
      // Restricted second-byte failures consume only the lead, then each
      // standalone continuation; they cannot be grouped as a longer prefix.
      for (const bytes of [[0xe0, 0x9f, 0x80], [0xf0, 0x8f, 0xbf, 0x80],
                           [0xf4, 0x90, 0x80, 0x80]]) {
        const subject = raw(...bytes);
        const found = collect(new RegExp('([\ufffd])', 'dg' + flags), subject, bytes.length);
        equal(found.map(m => units(m[1])), bytes.map(byte => [byte]), 'restricted second-byte text');
        equal(found.map(m => m.indices), bytes.map((_, i) => [[i, i + 1], [i, i + 1]]),
              'restricted second-byte bounds');
      }
      const mixed = raw(0x61, 0xe1, 0x80, 0x62, 0xf0, 0x90, 0x80, 0x63, 0xc0, 0x80, 0x64);
      const badBounds = [[1, 3], [4, 7], [8, 9], [9, 10]];
      const wanted = [[0xe1, 0x80], [0xf0, 0x90, 0x80], [0xc0], [0x80]];
      for (const pattern of ['(\ufffd)', '([\ufffd])']) {
        const found = collect(new RegExp(pattern, 'dg' + flags), mixed, 4);
        equal(found.map(m => units(m[1])), wanted, 'mixed raw captures');
        equal(found.map(m => m.indices), badBounds.map(pair => [pair, pair]), 'mixed raw bounds');
        const offsets = [];
        equal(mixed.replace(new RegExp(pattern, 'g' + flags), (whole, capture, offset) => {
          offsets.push(offset);
          equal(units(whole), units(capture), 'replacement retains capture bytes');
          return 'X';
        }), 'aXbXcXXd', 'malformed replacement result');
        equal(offsets, [1, 4, 8, 9], 'malformed callback offsets');
      }
      match('([^é]+)X', 'y' + flags, 'éX', [raw(0xa9) + 'X', raw(0xa9)],
            [[1, 3], [1, 2]], 1);
      match('([^é]+)X', 'g' + flags, 'éX', null, undefined, 0);
      match('([^é]+)X', 'g' + flags, 'éX', [raw(0xa9) + 'X', raw(0xa9)],
            [[1, 3], [1, 2]], 1);
      for (let start = 1; start < 4; ++start) {
        const capture = raw(...[0xf0, 0x9f, 0x98, 0x80].slice(start));
        match('(.+?)X', 'y' + flags, '😀X', [capture + 'X', capture],
              [[start, 5], [start, 4]], start);
      }
      match('(.)$', 'y' + flags, 'é', null, undefined, 2);
      match('(.*)$', 'y' + flags, 'é', ['', ''], [[2, 2], [2, 2]], 2);
    }
  }

  if (engineControl) {
    // These explicit no-u/v/d controls actually exercise initial eligibility.
    equal(Array.from(new RegExp('^([a-z]{2})X$').exec('abX')), ['abX', 'ab'],
          'experimental ASCII composition stays eligible');
    const asciiLinear = new RegExp('^([a-z]{2})X$', 'l');
    equal(Array.from(asciiLinear.exec('abX')), ['abX', 'ab'], 'ASCII linear positive control');
    equal(asciiLinear.flags, 'l', 'ASCII linear flag remains observable');
    const found = new RegExp('^a(.)b$').exec('aéb');
    equal(found && Array.from(found), ['aéb', 'é'], 'experimental dot composition');
    equal(new RegExp('(?:[^é])X').exec('éX'), null, 'experimental search boundary');
    const malformed = byteMode ? raw(0xe1, 0x80) : '\ufffd';
    equal(units(new RegExp('\ufffd').exec(malformed)?.[0] ?? ''), units(malformed),
          'experimental replacement atom routing');
    let linear;
    let error;
    try { linear = new RegExp('^a(.)b$', 'l'); } catch (caught) { error = caught; }
    if (byteMode) {
      equal(error instanceof SyntaxError, true, 'decoder-sensitive linear rejected');
      equal(linear, undefined, 'no disguised backtracking linear object');
    } else {
      equal(error, undefined, 'stock linear eligibility unchanged');
      equal(linear.exec('aéb')[0], 'aéb', 'stock linear dot');
    }
  }

  const excluded = [
    ['reverse-consumer', '(?<=.)(.)', 'u', 'é中', ['中', '中']],
    ['decoded-reference', '^(.)\\1$', 'u', 'éé', ['éé', 'é']],
    ['ignore-case', '^(.)é$', 'iu', '中É', ['中É', '中']],
    ['legacy-astral-class', '^([😀])$', '', '😀', ['😀', '😀']],
    ['legacy-negated-astral-class', '^([^😀])$', '', 'é', ['é', 'é']],
  ];
  const pending = [];
  for (const [id, pattern, flags, subject, desired] of excluded) {
    const actual = new RegExp(pattern, semanticFlags(flags)).exec(subject);
    const text = actual && Array.from(actual, units);
    const expected = desired.map(units);
    if (!byteMode) equal(text, expected, 'excluded stock Unicode control: ' + id);
    else if (encode(text) !== encode(expected)) pending.push({id, actual: text, desired: expected});
  }
  console.log(JSON.stringify({kind: 'forward-character-excluded', pending}));
  console.log(JSON.stringify({kind: 'forward-character-composition', byteMode, engineControl, checks}));
})();
