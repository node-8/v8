// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile correctness matrix. The runner verifies the actual profile and
// explicitly enables experimental engine controls in their dedicated variants.
(() => {
  const byteMode = '\u00e9'.length === 2;
  const engineControl = globalThis.nullableEngineControl === true;
  let checks = 0;
  let stockLegacyDifferences = 0;
  function encode(value) {
    return JSON.stringify(value, (_key, item) =>
        item === undefined ? {undefined: true} : item);
  }
  function equal(actual, expected, context) {
    ++checks;
    if (encode(actual) !== encode(expected)) {
      throw new Error(encode({actual, expected, context}));
    }
  }
  function match(pattern, flags, subject, text, indices,
                 legacyStockInterior = false) {
    const re = new RegExp(pattern, 'd' + flags);
    const context = '/' + pattern + '/' + flags;
    // The frozen stock engine itself searches the middle of a surrogate pair
    // for these nullable negative assertions, even with u/v. Preserve that
    // independently diagnosed observed control, NOT the node-8 target behavior.
    if (!byteMode && legacyStockInterior) {
      ++stockLegacyDifferences;
      equal(subject, '😀', 'known stock difference is narrowly scoped');
      text = [''];
      indices = [[1, 1]];
    }
    equal(re.flags, 'd' + flags, context + ': flags');
    equal(re.unicode, flags.includes('u'), context + ': observable unicode');
    for (let repeat = 0; repeat < 3; ++repeat) {
      const found = re.exec(subject);
      equal(found && Array.from(found), text, context);
      if (text !== null) {
        equal(found?.indices, indices, context + ': indices');
        equal(found?.index, indices[0][0], context + ': index');
        equal(found?.input, subject, context + ': input');
      }
    }
  }
  function startingAt(pattern, flags, subject, start, text, indices) {
    const re = new RegExp(pattern, 'dg' + flags);
    for (let repeat = 0; repeat < 3; ++repeat) {
      re.lastIndex = start;
      const found = re.exec(subject);
      equal(found && {text: Array.from(found), index: found.index,
                       indices: found.indices},
            text === null ? null : {text, index: indices[0][0], indices},
            pattern + ': explicit origin ' + start);
      equal(re.lastIndex, text === null ? 0 : indices[0][1],
            pattern + ': explicit origin lastIndex');
    }
  }

  // Independent exact oracles: both failed search progression and unchanged
  // ASCII AST publication are necessary, not just Unicode assertion lowering.
  match('(?!^|$)', 'u', 'é', null);
  match('(?!^)', 'u', 'é', [''], [[byteMode ? 2 : 1, byteMode ? 2 : 1]]);
  match('(?=é)', 'u', '中é', [''], [[byteMode ? 3 : 1, byteMode ? 3 : 1]]);

  const common = [['a', 1, 1], ['é', 1, 2], ['中', 1, 3]];
  const supplementary = [['😀', 2, 4], ['\ud800', 1, 3], ['\udc00', 1, 3]];
  for (const flags of ['', 'u', 'v']) {
    const values = flags === '' ? common : common.concat(supplementary);
    for (const [value, units, bytes] of values) {
      const width = byteMode ? bytes : units;
      const prefix = byteMode ? 3 : 1;
      const end = prefix + width;
      match(`(?=${value})`, flags, '☃' + value, [''], [[prefix, prefix]]);
      // Use '#' rather than 中 as the prefix when the sought value is 中.
      match(`(?<=${value})`, flags, '#' + value, [''], [[1 + width, 1 + width]]);
      match(`(?!${value}|$)`, flags, value, null, undefined, units === 2);
      match(`(?<!${value})(?!^)`, flags, value, null, undefined, units === 2);
      match(`(?=(${value}))`, flags, '#' + value, ['', value],
            [[1, 1], [1, 1 + width]]);
      match(`(?<=(${value}))`, flags, '#' + value, ['', value],
            [[1 + width, 1 + width], [1, 1 + width]]);
      match(`(?=(?<=中)(${value}))`, flags, '中' + value, ['', value],
            [[prefix, prefix], [prefix, end]]);
      match(`(?<=(${value})(?=中))`, flags, value + '中', ['', value],
            [[width, width], [0, width]]);
      match(`(?!((${value}))X)(?=${value})`, flags, '#' + value,
            ['', undefined, undefined], [[1, 1], undefined, undefined]);
      match(`(?:(?=(${value}))A|(?=(X)))`, flags, value + '中X',
            ['', undefined, 'X'],
            [[width + prefix, width + prefix], undefined,
             [width + prefix, width + prefix + 1]]);

      // Conservative root min_match is zero for references, including forward
      // and unmatched references. Their capture coordinates must remain bytes.
      match(`(?=(${value}))\\1`, flags, '#' + value, [value, value],
            [[1, 1 + width], [1, 1 + width]]);
      match(`\\1(?=(${value}))`, flags, '#' + value, ['', value],
            [[1, 1], [1, 1 + width]]);
      match(`(?<=\\1(${value}))`, flags, value.repeat(2), ['', value],
            [[2 * width, 2 * width], [width, 2 * width]]);
      match(`(?<=(${value})\\1)`, flags, value, ['', value],
            [[width, width], [0, width]]);
      match(`(?=(${value}+))${value}*\\1`, flags, value.repeat(2),
            [value.repeat(2), value.repeat(2)], [[0, 2 * width], [0, 2 * width]]);
      match(`(?=(${value}+?))`, flags, value.repeat(2), ['', value],
            [[0, 0], [0, width]]);
      match(`(?<=(${value}+))$`, flags, value.repeat(2),
            ['', value.repeat(2)], [[2 * width, 2 * width], [0, 2 * width]]);
      match(`(?<=(${value}+?))$`, flags, value.repeat(2), ['', value],
            [[2 * width, 2 * width], [width, 2 * width]]);
      match(`(?:${value})?(?=!)`, flags, '#' + value + '!', [value],
            [[1, 1 + width]]);
      match(`(?:${value})??(?=!)`, flags, '#' + value + '!', [value],
            [[1, 1 + width]]);
      match(`(?:(?=${value})|$)`, flags, '#', [''], [[1, 1]]);
      match(`^(?=${value})`, flags, value, [''], [[0, 0]]);
      match(`^(?=${value})`, flags, '#' + value, null);
      match(`(?=${value})$`, flags, value, null);
      // Bounded end-anchor positioning must not silently choose a new origin.
      match(`(?:${value})?(?<!X)$`, flags, '☃', [''],
            [[byteMode ? 3 : 1, byteMode ? 3 : 1]]);

      const named = new RegExp(`(?=(?<part>${value}))\\k<part>?`,
                               'd' + flags).exec('#' + value);
      equal(named?.groups, {part: value}, 'named capture');
      equal(named?.indices.groups, {part: [1, 1 + width]}, 'named capture bounds');
      equal(named?.index, 1, 'search prefix outside capture zero');

      const sticky = new RegExp(`(?=${value})`, 'dy' + flags);
      sticky.lastIndex = 1;
      equal(sticky.exec('#' + value)?.indices, [[1, 1]], 'sticky empty capture');
      equal(sticky.lastIndex, 1, 'sticky empty lastIndex unchanged');
      sticky.lastIndex = 0;
      equal(sticky.exec('#' + value), null, 'sticky no search');
      equal(sticky.lastIndex, 0, 'sticky failed reset');
      const global = new RegExp(`(?=${value})`, 'dg' + flags);
      global.lastIndex = 1;
      equal(global.exec('#' + value)?.indices, [[1, 1]], 'global requested origin');
      equal(global.lastIndex, 1, 'global empty exec does not advance');
    }

    for (const [value, units, bytes] of values) {
      const width = byteMode ? bytes : units;
      match('(?!^|$)', flags, value, null, undefined, units === 2);
      match('(?!^)', flags, value, [''], [[width, width]], units === 2);
      match('(?<!^)', flags, value, [''], [[width, width]], units === 2);
      match('(?:(?=^)(?=X)|(?<!^)(?!$))', flags, value, null, undefined, units === 2);
      match('(?:^(?=X)|(?<!^)(?=$))', flags, value, [''], [[width, width]]);
    }
    match('(?!^)', flags, '', null);
    match('(?=$)', flags, '', [''], [[0, 0]]);
    match('^(?=$)', flags, '', [''], [[0, 0]]);
    match('(?:(?=X)|)', flags, '', [''], [[0, 0]]);

    // BMP subjects deliberately also provide equivalent default-grammar stock
    // controls. No expected offset is read back from candidate results.
    const subject = 'é中é';
    const positions = byteMode ? [2, 5, 7] : [1, 2, 3];
    const all = Array.from(subject.matchAll(new RegExp('(?!^)', 'dg' + flags)));
    equal(all.map(m => m.index), positions, 'matchAll scalar positions');
    equal(all.map(m => m.indices), positions.map(p => [[p, p]]), 'matchAll d bounds');
    equal(subject.match(new RegExp('(?!^)', 'g' + flags)), ['', '', ''], 'global match');
    equal(subject.search(new RegExp('(?!^)', flags)), positions[0], 'search first');
    equal(subject.replace(new RegExp('(?!^)', 'g' + flags), '|'),
          'é|中|é|', 'replace template');
    const offsets = [];
    equal(subject.replace(new RegExp('(?!^)', 'g' + flags), (whole, offset, input) => {
      equal(whole, '', 'callback empty text');
      equal(input, subject, 'callback input');
      offsets.push(offset);
      return '|';
    }), 'é|中|é|', 'replace callback');
    equal(offsets, positions, 'callback offsets');
    equal(subject.split(new RegExp('(?!^)', flags)), ['é', '中', 'é'], 'split');
    equal(subject.replace(new RegExp('(?=é)', 'g' + flags), '!'),
          '!é中!é', 'positive empty replace');
  }

  match('(?=([A-Cé-ë中]{2}))\\1', 'u', '#A中', ['A中', 'A中'],
        [[1, byteMode ? 5 : 3], [1, byteMode ? 5 : 3]]);
  match('(?<=([A-Cé-ë中]{2}))$', 'u', 'A中', ['', 'A中'],
        [[byteMode ? 4 : 2, byteMode ? 4 : 2], [0, byteMode ? 4 : 2]]);
  // Previously supported paths: nonempty lookaround, class specialization,
  // nullable non-lookaround and a byte atom must retain their existing results.
  match('é(?=中)', 'u', 'é中', ['é'], [[0, byteMode ? 2 : 1]]);
  match('([é-ë]+)!', 'u', 'éê!', ['éê!', 'éê'],
        [[0, byteMode ? 5 : 3], [0, byteMode ? 4 : 2]]);
  match('(é)?', 'u', '', ['', undefined], [[0, 0], undefined]);
  match('abc', '', 'éabc', ['abc'], [[byteMode ? 2 : 1, byteMode ? 5 : 4]]);

  // End-anchored max=0/1/multibyte shortcuts must stay bounded without moving
  // the requested origin backwards or missing a decoder boundary near the end.
  const prefixes = [['x'.repeat(64), 64],
                    ['😀'.repeat(8), byteMode ? 32 : 16]];
  if (byteMode) {
    prefixes.push(['x'.repeat(64) + String.fromCharCode(0xe1, 0x80), 66]);
    prefixes.push(['x'.repeat(64) + String.fromCharCode(0xf0, 0x90, 0x80), 67]);
  }
  for (const flags of ['', 'u', 'v']) {
    for (const [prefix, size] of prefixes) {
      match('(?<=A)$', flags, prefix + 'A', [''], [[size + 1, size + 1]]);
      match('(?<=A)$', flags, prefix, null);
      match('(?<=A)B?$', flags, prefix + 'AB', ['B'], [[size + 1, size + 2]]);
      match('(?<=A)B?$', flags, prefix + 'A', [''], [[size + 1, size + 1]]);
      match('(?<=A)B?$', flags, prefix + 'B', null);
      const eWidth = byteMode ? 2 : 1;
      match('(?:é)?(?<!X)$', flags, prefix + 'é', ['é'], [[size, size + eWidth]]);
      match('(?:é)?(?<!X)$', flags, prefix + '☃', [''],
            [[size + (byteMode ? 3 : 1), size + (byteMode ? 3 : 1)]]);
      startingAt('(?<=A)$', flags, prefix + 'A', size + 1,
                 [''], [[size + 1, size + 1]]);
      startingAt('(?<=A)B?$', flags, prefix + 'AB', size + 1,
                 ['B'], [[size + 1, size + 2]]);
      startingAt('(?<=A)B?$', flags, prefix + 'AB', size + 2, null);
      startingAt('(?:é)?(?<!X)$', flags, prefix + 'é', size + eWidth,
                 [''], [[size + eWidth, size + eWidth]]);
      startingAt('(?:é)?(?<!X)$', flags, prefix + 'é', size + eWidth + 1, null);
      if (byteMode) {
        startingAt('(?:é)?(?<!X)$', flags, prefix + 'é', size + 1,
                   [''], [[size + 2, size + 2]]);
        startingAt('(?:B)?(?<!X)$', flags, prefix + '😀', size + 1,
                   [''], [[size + 4, size + 4]]);
      }
    }
  }

  // Graph simplification can delete an AST-nullable branch. These cases keep
  // the proven nonempty Boyer-Moore route, including an exception at start zero.
  const longPrefix = 'x'.repeat(64) + '😀';
  const longStart = byteMode ? 68 : 66;
  match('(?:(?=[])|ZZZZ)', 'v', longPrefix + 'ZZZZ', ['ZZZZ'],
        [[longStart, longStart + 4]]);
  match('(?:(?=[])|é中)', 'v', longPrefix + 'é中', ['é中'],
        [[longStart, longStart + (byteMode ? 5 : 2)]]);
  match('(?:(?=[])|ZZZZ)', 'v', longPrefix, null);
  for (const flags of ['', 'u', 'v']) {
    startingAt('(?:^|(?=Z)ZZZZ)', flags, longPrefix + 'ZZZZ', 0, [''], [[0, 0]]);
    startingAt('(?:^|(?=Z)ZZZZ)', flags, longPrefix + 'ZZZZ', 1,
               ['ZZZZ'], [[longStart, longStart + 4]]);
    startingAt('(?:^|(?=é)é中)', flags, longPrefix + 'é中', 1,
               ['é中'], [[longStart, longStart + (byteMode ? 5 : 2)]]);
  }

  if (byteMode) {
    // Raw-byte tables independently specify maximal-subpart widths, including
    // restricted second bytes, truncated prefixes and invalid later bytes.
    const rows = [
      [[0x41], [1]], [[0xc3, 0xa9], [2]], [[0xe4, 0xb8, 0xad], [3]],
      [[0xf0, 0x9f, 0x98, 0x80], [4]], [[0xed, 0xa0, 0x80], [3]],
      [[0x80], [1]], [[0xc0, 0x80], [1, 2]], [[0xff], [1]],
      [[0xc2], [1]], [[0xe1, 0x80], [2]], [[0xf0, 0x90, 0x80], [3]],
      [[0xe1, 0x80, 0x41], [2, 3]], [[0xf0, 0x90, 0x80, 0x41], [3, 4]],
      [[0xf0, 0x90, 0x41, 0x80], [2, 3, 4]],
      [[0xe0, 0x80, 0x80], [1, 2, 3]], [[0xf0, 0x80, 0x80, 0x80], [1, 2, 3, 4]],
      [[0xf4, 0x90, 0x80, 0x80], [1, 2, 3, 4]],
      [[0xf4, 0x8f, 0xbf, 0xbf], [4]], [[0xc2, 0x41], [1, 2]],
    ];
    for (const flags of ['', 'u', 'v']) {
      for (const [bytes, ends] of rows) {
        const subject = String.fromCharCode(...bytes);
        match('(?!^)', flags, subject, [''], [[ends[0], ends[0]]]);
        const found = Array.from(subject.matchAll(new RegExp('(?!^)', 'dg' + flags)));
        equal(found.map(m => m.index), ends, 'malformed progression ' + bytes);
        const internal = ends.filter(p => p < bytes.length);
        const notEnds = new RegExp('(?!^|$)', 'd' + flags).exec(subject);
        equal(notEnds?.index, internal[0], 'malformed nonend boundary ' + bytes);
      }
      for (const subject of ['é', '中', '😀', '\ud800']) {
        for (let start = 1; start <= subject.length + 1; ++start) {
          for (const mode of ['g', 'y']) {
            const re = new RegExp('(?!^)', 'd' + mode + flags);
            re.lastIndex = start;
            const found = re.exec(subject);
            const inBounds = start <= subject.length;
            equal(found && found.index, inBounds ? start : null, 'explicit byte entry');
            equal(re.lastIndex, inBounds ? start : 0, 'explicit entry lastIndex');
          }
          if (start < subject.length) {
            const re = new RegExp('(?<!^)(?!$)', 'dg' + flags);
            re.lastIndex = start;
            equal(Array.from(subject.matchAll(re)).map(m => m.index),
                  Array.from({length: subject.length - start}, (_, i) => start + i),
                  'interior continuation origin');
          }
        }
      }
    }
  }

  if (engineControl) {
    // No d/u/v flags: experimental eligibility must be exercised rather than
    // incidentally rejected by an unsupported public flag.
    for (const pattern of ['(?!^|$)', '(?<!^)(?!$)']) {
      equal(new RegExp(pattern).exec('é'), null, 'experimental default exclusion');
    }
    const fallback = new RegExp('(?:(a+)+b|(?<!^)(?!$))');
    const result = fallback.exec('aaaaé');
    equal(result?.index, 1, 'fallback preserves first legal candidate');
    equal(new RegExp('(?:(a?){0,3}b|(?<!^)(?!$))').exec('é'), null,
          'fallback cannot introduce interior candidate');
    const captureless = '(?<!^)';
    let linear;
    let error;
    try { linear = new RegExp(captureless, 'l'); } catch (caught) { error = caught; }
    if (byteMode) {
      equal(error instanceof SyntaxError, true, 'explicit linear rejected');
      equal(linear, undefined, 'no silent backtracking linear object');
    } else {
      equal(error, undefined, 'stock explicit linear unchanged');
      equal(linear.exec('a').index, 1, 'stock linear execution');
    }
    equal(new RegExp('a+', 'l').exec('aa')[0], 'aa', 'unrelated linear supported');
  }

  console.log(JSON.stringify({kind: 'nullable-lookarounds', byteMode,
                              engineControl, stockLegacyDifferences, checks}));
})();
