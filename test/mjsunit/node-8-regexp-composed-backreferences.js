// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Dual-profile test; the external runner verifies the active profile first.
(() => {
  const byteMode = '\u00e9'.length === 2;
  let checks = 0;
  function equal(actual, expected) {
    ++checks;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(JSON.stringify({actual, expected}));
    }
  }
  function match(pattern, flags, subject, expected, captures, index = 0) {
    const re = new RegExp(pattern, 'd' + flags);
    equal(re.source, new RegExp(pattern, flags).source);
    equal(re.flags, 'd' + flags);
    equal(re.unicode, flags === 'u');
    for (let iteration = 0; iteration < 4; ++iteration) {
      const result = re.exec(subject);
      equal(result && Array.from(result), [expected, ...captures]);
      equal(result?.index, index);
      equal(result?.indices[0], [index, index + expected.length]);
      for (let i = 1; i <= captures.length; ++i) {
        if (captures[i - 1] === undefined) {
          equal(result.indices[i], undefined);
        } else {
          const [start, end] = result.indices[i];
          equal(subject.slice(start, end), captures[i - 1]);
        }
      }
    }
  }
  const bmp = ['a', '\u00e9', '\u4e2d', 'a\u00e9Z', '\0\u00e9'];
  for (const flags of ['', 'u', 'v']) {
    const values = flags ? bmp.concat(['\u{1f600}', '\ud800', '\udc00']) : bmp;
    for (const value of values) {
      const pair = value.repeat(2);
      const triple = value.repeat(3);
      const forms = [
        [`(${value})\\1`, pair, pair, [value]],
        [`\\1(${value})`, value, value, [value]],
        [`(${value}\\1)`, value, value, [value]],
        [`((${value})\\2)\\1`, pair.repeat(2), pair.repeat(2), [pair, value]],
        [`(${value})+\\1`, triple, triple, [value]],
        [`(${value})+?\\1`, triple, pair, [value]],
        [`(${value})\\1{2}`, triple, triple, [value]],
        [`(${value})\\1*`, triple, triple, [value]],
        [`(${value})?X\\1`, 'X', 'X', [undefined]],
        [`(?:((${value}))|X)+\\1\\2`, value + 'X', value + 'X',
         [undefined, undefined]],
        [`(${value}){0}\\1`, '', '', [undefined]],
        [`((${value})?)*\\2`, '', '', [undefined, undefined]],
        [`^(${value})\\1$`, pair, pair, [value]],
        [`(?:none|(${value})\\1)`, pair, pair, [value]],
        [`[a-c]+(${value})\\1[0-9]?`, 'abc' + pair + '7', 'abc' + pair + '7',
         [value]],
      ];
      for (const [pattern, subject, expected, captures] of forms) {
        match(pattern, flags, subject, expected, captures);
      }
      const prefix = '\u2603|';
      match(`(${value})\\1$`, flags, prefix + pair, pair, [value], prefix.length);
      equal(new RegExp(`^(${value})\\1$`, flags).test(value + '!'), false);
      equal(new RegExp(`^(${value})\\1$`, flags).test(value), false);
      const named = new RegExp(`(?<\u540d>${value})\\k<\u540d>`, 'd' + flags).exec(pair);
      equal(named && Array.from(named), [pair, value]);
      equal(named?.groups, {'\u540d': value});
      equal(named?.indices.groups, {'\u540d': [0, value.length]});

      const subject = prefix + pair + '|' + pair;
      const first = prefix.length;
      const second = first + pair.length + 1;
      for (const kind of ['g', 'y']) {
        const re = new RegExp(`(${value})\\1`, 'd' + kind + flags);
        re.lastIndex = first;
        const result = re.exec(subject);
        equal(result && Array.from(result), [pair, value]);
        equal(result?.indices, [[first, first + pair.length],
                                [first, first + value.length]]);
        equal(re.lastIndex, first + pair.length);
        if (kind === 'g') {
          equal(re.exec(subject)?.index, second);
          equal(re.lastIndex, second + pair.length);
        }
        equal(re.exec(subject), null);
        equal(re.lastIndex, 0);
      }
      const global = new RegExp(`(${value})\\1`, 'g' + flags);
      equal(subject.replace(global, '<$1>'), prefix + '<' + value + '>|<' + value + '>');
      const calls = [];
      equal(subject.replace(global, (whole, captured, offset, input) => {
        calls.push([whole, captured, offset, input]);
        return '!';
      }), prefix + '!|!');
      equal(calls, [[pair, value, first, subject], [pair, value, second, subject]]);
      const all = Array.from(subject.matchAll(new RegExp(`(${value})\\1`, 'dg' + flags)));
      equal(all.map(result => [result[0], result[1], result.index]),
            [[pair, value, first], [pair, value, second]]);
      equal(all.map(result => result.indices),
            [[[first, first + pair.length], [first, first + value.length]],
             [[second, second + pair.length], [second, second + value.length]]]);
    }
  }

  for (const flags of ['', 'u']) {
    for (const field of ['A\u4e2d\u00e9', '\u00eb\u00e9', '\u007f\u0080', '\u07ff\u0800']) {
      const cls = field.startsWith('A') ? '[A-C\u00e9-\u00eb\u4e2d]' :
          field.startsWith('\u00eb') ? '[\u00e9-\u00eb]' :
          field.startsWith('\u007f') ? '[\u007e-\u0081]' : '[\u07fe-\u0801]';
      match(`(${cls}+)\\1`, flags, field.repeat(2), field.repeat(2), [field]);
      match(`((${cls}){2,3})\\1`, flags, field.repeat(2), field.repeat(2),
            [field, field.endsWith('\u00e9') ? '\u00e9' : field.endsWith('\u0080') ? '\u0080' : '\u0800']);
    }
  }
  for (const flags of ['u', 'v']) {
    for (const value of ['\u00e9', '\u4e2d']) {
      const result = new RegExp('(?:(?<n>\u00e9)|(?<n>\u4e2d))\\k<n>', 'd' + flags)
          .exec(value.repeat(2));
      equal(result && Array.from(result), value === '\u00e9' ?
            [value.repeat(2), value, undefined] : [value.repeat(2), undefined, value]);
      equal(result?.groups, {n: value});
      equal(result?.indices.groups, {n: [0, value.length]});
    }
  }
  equal(/(\u00e9)\1/u.exec('\u00e9\u00ea'), null);
  equal(/(\u00e9)\1/iu.exec('xx'), null);
  equal(/(a)\1/i.exec('aA')?.[0], 'aA');
  const sticky = /(\u00e9)\1/dyu;
  sticky.lastIndex = 1;
  equal(sticky.exec('\u00e9\u00e9'), null);
  equal(sticky.lastIndex, 0);
  console.log(`composed backreferences: ${checks} checks passed; byteMode=${byteMode}`);
})();
