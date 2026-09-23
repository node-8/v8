// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile test; the external runner verifies the active profile first.
(() => {
  const byteMode = '\u00e9'.length === 2;
  let checks = 0;
  function encode(value) {
    return JSON.stringify(value, (_key, item) =>
        item === undefined ? {undefined: true} : item);
  }
  function equal(actual, expected, context) {
    ++checks;
    if (encode(actual) !== encode(expected)) {
      throw new Error(JSON.stringify({actual, expected, context}));
    }
  }
  function match(pattern, flags, subject, text, indices) {
    const re = new RegExp(pattern, 'd' + flags);
    equal(re.flags, 'd' + flags, pattern + ': flags');
    equal(re.source, new RegExp(pattern, flags).source, pattern + ': source');
    for (let repeat = 0; repeat < 3; ++repeat) {
      const found = re.exec(subject);
      equal(found && Array.from(found), text, pattern);
      if (text !== null) {
        equal(found?.index, indices[0][0], pattern + ': index');
        equal(found?.indices, indices, pattern + ': indices');
        equal(found?.input, subject, pattern + ': input');
      }
    }
  }

  // Put the smallest frozen red first so a failed pre-fix run is unambiguous.
  match('é(?=中)', 'u', 'é中', ['é'], [[0, byteMode ? 2 : 1]]);

  const common = [['a', 1, 1], ['é', 1, 2], ['中', 1, 3]];
  const supplementary = [['😀', 2, 4], ['\ud800', 1, 3], ['\udc00', 1, 3]];
  for (const flags of ['', 'u', 'v']) {
    const values = flags === '' ? common : common.concat(supplementary);
    for (const [value, units, bytes] of values) {
      const width = byteMode ? bytes : units;
      const contextWidth = byteMode ? 3 : 1;
      const end = width + contextWidth;
      match(`(${value})(?=(中))`, flags, value + '中', [value, value, '中'],
            [[0, width], [0, width], [width, end]]);
      match(`(?<=(${value}))(中)`, flags, value + '中', ['中', value, '中'],
            [[width, end], [0, width], [width, end]]);
      match(`${value}(?!A)`, flags, value + '中', [value], [[0, width]]);
      match(`(?<!A)(${value})`, flags, '#' + value, [value, value],
            [[1, 1 + width], [1, 1 + width]]);
      match(`A(?!${value})`, flags, 'A' + value, null);
      match(`(?<!${value})A`, flags, value + 'A', null);
      match(`(${value})(?=(?<=${value})(中))`, flags, value + '中',
            [value, value, '中'], [[0, width], [0, width], [width, end]]);
      match(`(?<=(${value})(?=中))(中)`, flags, value + '中',
            ['中', value, '中'], [[width, end], [0, width], [width, end]]);
      match(`${value}(?!(?<=${value})A)`, flags, value + '中', [value],
            [[0, width]]);
      match(`${value}(?!(?<=${value})A)`, flags, value + 'A', null);

      // A mandatory outer X keeps the root minimum positive despite the ref.
      match(`(?=(${value}))\\1X`, flags, value + 'X', [value + 'X', value],
            [[0, width + 1], [0, width]]);
      match(`(?=(${value}))\\1?X`, flags, value + 'X', [value + 'X', value],
            [[0, width + 1], [0, width]]);
      match(`(?<=\\1(${value}))中`, flags, value.repeat(2) + '中', ['中', value],
            [[width * 2, width * 2 + contextWidth], [width, width * 2]]);
      // Reading backward reaches the unmatched reference before its capture.
      match(`(?<=(${value})\\1)中`, flags, value + '中', ['中', value],
            [[width, end], [0, width]]);
      match(`(?:(?=(${value}))(${value})|X)+\\1Y`, flags, value + 'XY',
            [value + 'XY', undefined, undefined],
            [[0, width + 2], undefined, undefined]);
      match(`(?!((${value}))A)(${value})X`, flags, value + 'X',
            [value + 'X', undefined, undefined, value],
            [[0, width + 1], undefined, undefined, [0, width]]);

      // Lookahead is atomic; outer backtracking cannot shorten its capture.
      match(`(?=(${value}+))${value}*\\1X`, flags, value.repeat(2) + 'X',
            [value.repeat(2) + 'X', value.repeat(2)],
            [[0, width * 2 + 1], [0, width * 2]]);
      match(`(?=(${value}+))${value}\\1X`, flags, value.repeat(2) + 'X', null);
      match(`(?<=((?:${value})+))中$`, flags, value.repeat(2) + '中',
            ['中', value.repeat(2)],
            [[width * 2, width * 2 + contextWidth], [0, width * 2]]);
      match(`(?<=((?:${value})+?))中$`, flags, value.repeat(2) + '中',
            ['中', value], [[width * 2, width * 2 + contextWidth],
                           [width, width * 2]]);
      match(`(?<=((${value})+))中$`, flags, value.repeat(2) + '中',
            ['中', value.repeat(2), value],
            [[width * 2, width * 2 + contextWidth], [0, width * 2], [0, width]]);
      match(`^(${value})(?=中)中$`, flags, value + '中', [value + '中', value],
            [[0, end], [0, width]]);
      match(`^(${value})(?=中)中$`, flags, '#' + value + '中', null);
      match(`[a-c]+(?=${value})(${value})`, flags, 'abc' + value,
            ['abc' + value, value], [[0, width + 3], [3, width + 3]]);

      const named = new RegExp(`(?<=(?<before>${value}))(?<after>中)`,
                               'd' + flags).exec(value + '中');
      equal(named?.groups, {before: value, after: '中'}, 'named groups');
      equal(named?.indices.groups,
            {before: [0, width], after: [width, end]}, 'named indices');
      match(`(?=(?<part>${value}))\\k<part>X`, flags, value + 'X',
            [value + 'X', value], [[0, width + 1], [0, width]]);

      const prefix = '☃|';
      const first = byteMode ? 4 : 2;
      const subject = prefix + value + '中|' + value + '中';
      const second = first + end + 1;
      const pattern = `(${value})(?=中)`;
      const global = new RegExp(pattern, 'dg' + flags);
      const all = Array.from(subject.matchAll(global));
      equal(all.map(found => Array.from(found)), [[value, value], [value, value]],
            'matchAll text');
      equal(all.map(found => found.indices),
            [[[first, first + width], [first, first + width]],
             [[second, second + width], [second, second + width]]],
            'matchAll indices');
      equal(global.lastIndex, 0, 'matchAll original lastIndex');
      equal(subject.match(new RegExp(pattern, 'g' + flags)), [value, value],
            'global match');
      equal(subject.search(new RegExp(pattern, flags)), first, 'search');
      equal(subject.replace(new RegExp(pattern, 'g' + flags), '<$1>'),
            prefix + '<' + value + '>中|<' + value + '>中', 'replace template');
      const calls = [];
      equal(subject.replace(new RegExp(pattern, 'g' + flags),
                            (whole, capture, offset, input) => {
                              calls.push([whole, capture, offset]);
                              equal(input, subject, 'replace input');
                              return '@';
                            }), prefix + '@中|@中', 'replace callback');
      equal(calls, [[value, value, first], [value, value, second]], 'replace offsets');
      equal(subject.split(new RegExp(pattern, flags)),
            [prefix, value, '中|', value, '中'], 'split');

      const sticky = new RegExp(pattern, 'dy' + flags);
      sticky.lastIndex = first;
      equal(sticky.exec(subject)?.indices,
            [[first, first + width], [first, first + width]], 'sticky valid');
      equal(sticky.lastIndex, first + width, 'sticky lastIndex');
      equal(sticky.exec(subject), null, 'sticky failure');
      equal(sticky.lastIndex, 0, 'sticky reset');
      if (byteMode && bytes > 1) {
        const adjacent = value + '中|' + value + '中';
        sticky.lastIndex = 1;
        equal(sticky.exec(adjacent), null, 'sticky continuation rejected');
        equal(sticky.lastIndex, 0, 'sticky continuation reset');
        global.lastIndex = 1;
        const next = global.exec(adjacent);
        equal(next?.index, end + 1, 'global skips continuation candidates');
        equal(next?.indices[0], [end + 1, end + 1 + width], 'global next bounds');
      }
    }
  }

  const fieldWidth = byteMode ? 6 : 3;
  match('(?<=([A-Cé-ë中]{1,3}))!', 'u', 'Aé中!', ['!', 'Aé中'],
        [[fieldWidth, fieldWidth + 1], [0, fieldWidth]]);
  const shortWidth = byteMode ? 4 : 2;
  match('(?=([A-Cé-ë中]{2}))\\1!', 'u', 'A中!', ['A中!', 'A中'],
        [[0, shortWidth + 1], [0, shortWidth]]);
  match('^([é-ë]{1,3})(?=!)!$', 'u', 'éê!', ['éê!', 'éê'],
        [[0, shortWidth + 1], [0, shortWidth]]);

  // ASCII identity paths, including an unrelated nullable root, are unchanged.
  match('(A)(?=(B))', 'u', 'AB', ['A', 'A', 'B'], [[0, 1], [0, 1], [1, 2]]);
  match('(?<=A)B', 'u', 'AB', ['B'], [[1, 2]]);
  match('A(?!B)', 'u', 'AB', null);
  match('(?<!A)B', 'u', 'AB', null);
  match('(?=A)', 'u', 'A', [''], [[0, 0]]);
  match('(é)?', 'u', '', ['', undefined], [[0, 0], undefined]);

  // A malformed subject prefix is a separate byte boundary, not validation work.
  if (byteMode) {
    const raw = String.fromCharCode(0x80);
    match('é(?=中)', 'u', raw + 'é中', ['é'], [[1, 3]]);
    match('(?<=é)中', 'u', raw + 'é中', ['中'], [[3, 6]]);
  }

  // Report excluded functional gaps against the desired contract. Never assert
  // their current incorrect null/empty result as an accepted compatibility rule.
  const excluded = [
    ['nullable-ahead', '(?=é)', 'u', 'é', ['']],
    ['nullable-outer-reference', '(?=([é-ë]{2}))\\1', 'u', 'éê', ['éê', 'éê']],
    ['nullable-negative-search', '(?!(?:é|$))', 'u', 'é', null],
    ['decoder-dot-body', '(?=.)é', 'u', 'é', ['é']],
    ['negated-class-body', '(?=[^\\n])é', 'u', 'é', ['é']],
    ['ignore-case-body', '(?=é)é', 'iu', 'É', ['É']],
  ];
  const pending = [];
  for (const [id, pattern, flags, subject, desired] of excluded) {
    const result = new RegExp(pattern, flags).exec(subject);
    const actual = result && Array.from(result);
    if (!byteMode) equal(actual, desired, id + ': stock contract');
    else if (JSON.stringify(actual) !== JSON.stringify(desired)) {
      pending.push({id, pattern, flags, subject, desired, actual});
    }
  }
  console.log('lookaround excluded gaps: ' + JSON.stringify(pending));
  console.log(`nonempty lookarounds: ${checks} checks passed; byteMode=${byteMode}`);
})();
