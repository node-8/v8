// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile correctness test. The runner checks the actual profile first.
(() => {
  const byteMode = String.fromCodePoint(233).length === 2;
  const intrinsicExec = RegExp.prototype.exec;
  const maxCalls = 4096;
  let slowPhase = false;
  let checks = 0;
  function equal(actual, expected, label) {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error('EMPTY_ADVANCEMENT_ASSERT ' + label + ': ' +
                      JSON.stringify({actual, expected}));
    }
  }
  function guard(count, label) {
    if (count > maxCalls) throw new Error('EMPTY_ADVANCEMENT_ASSERT bounded ' + label);
  }
  function positions(widths) {
    const result = [0];
    for (const width of widths) result.push(result[result.length - 1] + width);
    return result;
  }
  function partsAt(subject, offsets) {
    const parts = [];
    for (let i = 1; i < offsets.length; ++i) {
      parts.push(subject.slice(offsets[i - 1], offsets[i]));
    }
    return parts;
  }
  function indices(iterator, count, label) {
    const result = [];
    // Do not use Array.from on an iterator whose advancement is under test.
    for (let i = 0; i <= count; ++i) {
      const next = iterator.next();
      if (next.done) return result;
      equal(next.value[0], '', label + ' empty result');
      result.push(next.value.index);
    }
    throw new Error('EMPTY_ADVANCEMENT_ASSERT bounded iterator ' + label);
  }
  function slow(pattern, flags) {
    function wrap(re) {
      let calls = 0;
      re.exec = function(subject) {
        guard(++calls, 'delegated exec');
        return intrinsicExec.call(this, subject);
      };
      return re;
    }
    const re = wrap(new RegExp(pattern, flags));
    re.constructor = {
      [Symbol.species]: function(source, nextFlags) {
        return wrap(new RegExp(source, nextFlags));
      }
    };
    return re;
  }
  function custom(flags, subject) {
    let calls = 0;
    const seen = [];
    const re = {
      flags: 'g' + flags,
      global: true,
      unicode: flags === 'u',
      unicodeSets: flags === 'v',
      lastIndex: 0,
      exec(input) {
        guard(++calls, 'custom exec');
        equal(input, subject, 'custom subject');
        const index = this.lastIndex;
        if (index > subject.length) return null;
        seen.push(index);
        const match = [''];
        match.index = index;
        match.input = input;
        return match;
      }
    };
    re.constructor = {[Symbol.species]: function() { return re; }};
    return {re, seen};
  }
  function check(subject, offsets, flags, label, patterns, legacyOffsets) {
    const parts = partsAt(subject, offsets);
    equal(offsets[offsets.length - 1], subject.length, label + ' oracle length');
    const replaced = '|' + parts.join('|') + (parts.length ? '|' : '');
    const expectedMatches = offsets.map(() => '');
    for (const pattern of patterns) {
      for (const make of slowPhase ? [slow] : [(p, f) => new RegExp(p, f)]) {
        const kind = make === slow ? 'slow/species' : 'fast';
        const tag = label + '/' + flags + '/' + pattern + '/' + kind;
        const re = make(pattern, 'g' + flags);
        equal(re.flags, 'g' + flags, tag + ' flags unchanged');
        // Reuse the source/object to exercise the default source-tier-up path.
        for (let repeat = 0; repeat < 3; ++repeat) {
          equal(subject.match(re), expectedMatches, tag + ' match');
          equal(re.lastIndex, 0, tag + ' match resets index');
          equal(subject.replace(re, '|'), replaced, tag + ' string replace');
          const callbackOffsets = [];
          equal(subject.replace(re, (match, offset, input) => {
            guard(callbackOffsets.length + 1, 'replacement callback');
            equal(match, '', tag + ' callback empty');
            equal(input, subject, tag + ' callback subject');
            callbackOffsets.push(offset);
            return '|';
          }), replaced, tag + ' callback replace');
          equal(callbackOffsets, offsets, tag + ' callback offsets');
          equal(indices(subject.matchAll(re), offsets.length, tag), offsets,
                tag + ' matchAll');
          equal(subject.split(make(pattern, flags)), parts, tag + ' split');
        }
      }
    }
    if (!slowPhase) return;
    let item = custom(flags, subject);
    equal(RegExp.prototype[Symbol.match].call(item.re, subject), expectedMatches,
          label + ' custom match');
    equal(item.seen, offsets, label + ' custom match offsets');
    for (const callback of [false, true]) {
      item = custom(flags, subject);
      const callbackOffsets = [];
      const replacement = callback ? (match, offset) => {
        guard(callbackOffsets.length + 1, 'custom replacement callback');
        callbackOffsets.push(offset);
        return '|';
      } : '|';
      equal(RegExp.prototype[Symbol.replace].call(item.re, subject, replacement),
            replaced, label + ' custom replace');
      equal(item.seen, offsets, label + ' custom replace advancement');
      if (callback) equal(callbackOffsets, offsets, label + ' custom callback offsets');
    }
    item = custom(flags, subject);
    equal(indices(RegExp.prototype[Symbol.matchAll].call(item.re, subject),
                  offsets.length, label), offsets, label + ' custom matchAll');
    item = custom(flags, subject);
    // Preserve the existing stock runtime's u-only custom split flag check.
    // A delegated real /v exec still aligns surrogates; this plain exec does not.
    const customSplitParts = !byteMode && flags === 'v' ?
      partsAt(subject, legacyOffsets) : parts;
    equal(RegExp.prototype[Symbol.split].call(item.re, subject), customSplitParts,
          label + ' custom species split');
  }
  function checkCaptured(subject, offsets, flags) {
    const parts = partsAt(subject, offsets);
    const expectedReplacement = '|' + parts.join('|') + '|';
    for (const [pattern, capture] of [['(Q*)', ''], ['(Q)?', undefined]]) {
      const splitParts = [];
      for (let i = 0; i < parts.length; ++i) {
        if (i > 0) splitParts.push(capture);
        splitParts.push(parts[i]);
      }
      for (const make of slowPhase ? [slow] : [(p, f) => new RegExp(p, f)]) {
        const re = make(pattern, 'g' + flags);
        for (let repeat = 0; repeat < 3; ++repeat) {
          equal(subject.replace(re, '$1|'), expectedReplacement,
                'captured substitution/' + flags + '/' + pattern);
          const callbackOffsets = [];
          equal(subject.replace(re, (match, value, offset, input) => {
            guard(callbackOffsets.length + 1, 'captured callback');
            equal(match, '', 'captured callback match');
            equal(value, capture, 'captured callback value');
            equal(input, subject, 'captured callback input');
            callbackOffsets.push(offset);
            return '|';
          }), expectedReplacement, 'captured callback replacement');
          equal(callbackOffsets, offsets, 'captured callback byte offsets');
          equal(indices(subject.matchAll(re), offsets.length, 'captured matchAll'),
                offsets, 'captured matchAll offsets');
          equal(subject.split(make(pattern, flags)), splitParts, 'captured split');
        }
      }
    }
  }

  // Width tables are independent of RegExp, iteration, and advancement helpers.
  const cases = [
    ['', [], [], []],
    ['abZ', [1, 1, 1], [1, 1, 1], [1, 1, 1]],
    ['é中😀', [2, 3, 4], [1, 1, 1, 1], [1, 1, 2]],
    ['\0é', [1, 2], [1, 1], [1, 1]],
    [String.fromCodePoint(0xd800) + 'X' + String.fromCodePoint(0xdc00),
     [3, 1, 3], [1, 1, 1], [1, 1, 1]],
    [String.fromCodePoint(0xd800, 0xdc00), [3, 3], [1, 1], [2]],
    ['é'.repeat(300), Array(300).fill(2), Array(300).fill(1), Array(300).fill(1)],
  ];
  const prefix = 'A'.repeat(32);
  const suffix = 'Z'.repeat(32);
  const rope = prefix + cases[2][0] + suffix;
  cases.push([rope, [...Array(32).fill(1), 2, 3, 4, ...Array(32).fill(1)],
              Array(68).fill(1), [...Array(32).fill(1), 1, 1, 2, ...Array(32).fill(1)]]);
  cases.push([rope.slice(30, 30 + 2 + cases[2][0].length + 2),
              [1, 1, 2, 3, 4, 1, 1], Array(8).fill(1), [1, 1, 1, 1, 2, 1, 1]]);
  cases.push(['A'.repeat(300), Array(300).fill(1), Array(300).fill(1), Array(300).fill(1)]);
  if (byteMode) {
    const malformed = [
      [[0x80], [1]], [[0xc0, 0x80], [1, 1]], [[0xc2], [1]],
      [[0xe0, 0x80, 0x80], [1, 1, 1]], [[0xe0, 0xa0], [2]],
      [[0xe0, 0xa0, 0x80], [3]], [[0xed, 0x9f, 0xbf], [3]],
      [[0xed, 0xa0, 0x80], [3]], [[0xed, 0xbf, 0xbf], [3]],
      [[0xe4, 0xb8, 0x41], [2, 1]], [[0xe4, 0xb8], [2]],
      [[0xf0, 0x80, 0x80, 0x80], [1, 1, 1, 1]],
      [[0xf0, 0x90, 0x80], [3]], [[0xf0, 0x90, 0x80, 0x80], [4]],
      [[0xf4, 0x8f, 0xbf, 0xbf], [4]], [[0xf4, 0x90, 0x80, 0x80], [1, 1, 1, 1]],
      [[0xf5, 0xff, 0x41], [1, 1, 1]], [[0xe1, 0x80, 0xc2, 0x80], [2, 2]],
    ];
    for (const [bytes, widths] of malformed) cases.push([String.fromCharCode(...bytes), widths]);
  }
  for (const [subject, bytes, legacy, unicode] of cases) {
    const offsets = positions(byteMode ? bytes : legacy);
    equal(offsets[offsets.length - 1], subject.length, 'independent table byte/unit length');
    equal(partsAt(subject, offsets).join(''), subject, 'independent table value closure');
    if (!byteMode) {
      const unicodeOffsets = positions(unicode);
      equal(unicodeOffsets[unicodeOffsets.length - 1], subject.length,
            'independent table stock Unicode length');
    }
  }
  if (globalThis.EMPTY_ADVANCEMENT_EXPERIMENTAL_ONLY) {
    // Do not test unrelated Unicode-consuming experimental-engine syntax.
    // /l cannot be combined with /u or /v.
    equal('QQZ'.match(new RegExp('Q*', 'gl')), ['QQ', '', ''],
          'experimental ASCII consuming control');
    equal('QQZ'.replace(new RegExp('Q*', 'gl'), '|'), '||Z|',
          'experimental ASCII replacement control');
    for (slowPhase of [false, true]) {
      for (let i = 0; i < cases.length; ++i) {
        const [subject, bytes, legacy] = cases[i];
        // Stock has a separately recorded pre-existing experimental refill bug.
        // Keep stock below its 64-result buffer; node-8 must pass the full batch.
        if (!byteMode && subject.length >= 63) continue;
        check(subject, positions(byteMode ? bytes : legacy), 'l',
              'experimental-case-' + i, ['(?:)', 'Q*']);
      }
    }
    console.log('empty advancement experimental: ' + checks +
                ' checks passed; byteMode=' + byteMode);
    return;
  }
  // Installing custom species/exec may invalidate process-wide fast protectors.
  // Finish every genuine fast control before constructing any slow instance.
  for (slowPhase of [false, true]) {
    for (const flags of ['', 'u', 'v']) {
      for (let i = 0; i < cases.length; ++i) {
        const [subject, bytes, legacy, unicode] = cases[i];
        const widths = byteMode ? bytes : flags ? unicode : legacy;
        check(subject, positions(widths), flags, 'case-' + i,
              ['(?:)', 'Q*', '[Ω]*'], byteMode ? undefined : positions(legacy));
      }
      for (const i of [2, 6]) {
        const [subject, bytes, legacy, unicode] = cases[i];
        checkCaptured(subject, positions(byteMode ? bytes : flags ? unicode : legacy), flags);
      }
      // A custom exec can place lastIndex at a continuation or outside the input.
      const input = 'é中😀';
      const starts = [-1, NaN, 0, 1, 2.9, 5, 9, 10, 0x100000001,
                      2 ** 40, Number.MAX_SAFE_INTEGER, Infinity];
      for (const start of slowPhase ? starts : []) {
        const integer = Number.isNaN(start) || start < 0 ? 0 :
          Math.min(Math.floor(start), Number.MAX_SAFE_INTEGER);
        let next;
        if (byteMode) next = integer + ({0: 2, 2: 3, 5: 4}[integer] || 1);
        else next = integer + (flags && integer === 2 ? 2 : 1);
        for (const method of [Symbol.match, Symbol.replace]) {
          let calls = 0;
          let observed;
          const object = {
            flags: 'g' + flags,
            global: true, unicode: flags === 'u', unicodeSets: flags === 'v',
            exec() {
              guard(++calls, 'numeric custom exec');
              if (calls > 1) { observed = this.lastIndex; return null; }
              this.lastIndex = start;
              const result = [''];
              result.index = 0;
              return result;
            }
          };
          RegExp.prototype[method].call(object, input, '|');
          equal(observed, next, 'custom numeric lastIndex/' + flags + '/' + String(start));
        }
      }
      if (byteMode) {
        const interior = [
          [1, [1, 2, 5, 9]], [3, [3, 4, 5, 9]], [4, [4, 5, 9]],
          [6, [6, 7, 8, 9]], [7, [7, 8, 9]], [8, [8, 9]], [9, [9]], [10, []],
        ];
        for (const [start, expected] of interior) {
          for (const make of slowPhase ? [slow] : [(p, f) => new RegExp(p, f)]) {
            const re = make('(?:)', 'g' + flags);
            re.lastIndex = start;
            equal(indices(input.matchAll(re), expected.length, 'interior'), expected,
                  'explicit interior start/' + flags + '/' + start);
            equal(re.lastIndex, start, 'matchAll preserves caller index');
          }
        }
      }
      // Consuming matches must still preserve values and positions.
      equal('é中😀'.replace(new RegExp('中', 'g' + flags), '|'), 'é|😀', 'consuming replace');
      equal('AéZ'.match(new RegExp('é', 'g' + flags)), ['é'], 'consuming match');
    }
  }
  console.log('empty advancement: ' + checks + ' checks passed; byteMode=' + byteMode);
})();
