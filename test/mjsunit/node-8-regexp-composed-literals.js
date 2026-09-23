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
  const values = ['\u00e9', '\u4e2d', 'a\u00e9Z', '\0\u00e9'];
  for (const flags of ['', 'u', 'v']) {
    const unicode = flags !== '';
    const inputs = unicode ? values.concat(['\u{1f600}', '\ud800', '\udc00']) : values;
    for (const value of inputs) {
      const forms = [
        [`(${value})`, value, [value]],
        [`(?:(?:(${value})))+`, value.repeat(3), [value]],
        [`(${value})+`, value.repeat(3), [value]],
        [`(${value}){2,3}`, value.repeat(3), [value]],
        [`(${value}){2,3}?`, value.repeat(3), [value], value.repeat(2)],
        [`(${value})?Z`, value + 'Z', [value]],
        [`(${value})?Z`, 'Z', [undefined]],
        [`((${value})|X)+`, value + 'X', ['X', undefined]],
        [`(${value}|)Z`, 'Z', ['']],
        [`[a-z]+(${value})[0-9]`, 'abc' + value + '7', [value]],
      ];
      for (const [pattern, subject, captures, expected = subject] of forms) {
        const re = new RegExp(pattern, 'd' + flags);
        equal(re.source, new RegExp(pattern).source);
        equal(re.flags, 'd' + flags);
        for (let count = 0; count < 4; ++count) {
          const match = re.exec(subject);
          equal(match && Array.from(match), [expected, ...captures]);
          equal(match?.index, 0);
          equal(match?.indices[0], [0, expected.length]);
          for (let i = 1; i <= captures.length; ++i) {
            if (captures[i - 1] !== undefined) {
              const [start, end] = match.indices[i];
              equal(subject.slice(start, end), captures[i - 1]);
            }
          }
        }
      }
      const anchored = new RegExp(`^(${value}){1,3}$`, flags);
      equal(anchored.test(value.repeat(2)), true);
      equal(anchored.test(value.repeat(4)), false);
      const prefix = '\u2603|';
      const subject = prefix + value.repeat(2) + '|' + value;
      for (const kind of ['g', 'y']) {
        const re = new RegExp(`(${value})+`, 'd' + kind + flags);
        re.lastIndex = prefix.length;
        const match = re.exec(subject);
        equal(match?.[0], value.repeat(2));
        equal(match?.[1], value);
        equal(match?.indices, [[prefix.length, prefix.length + value.length * 2],
                              [prefix.length + value.length, prefix.length + value.length * 2]]);
        equal(re.lastIndex, prefix.length + value.length * 2);
        if (kind === 'y') {
          equal(re.exec(subject), null);
          equal(re.lastIndex, 0);
        } else {
          equal(re.exec(subject)?.index, prefix.length + value.length * 2 + 1);
        }
      }
      equal(subject.replace(new RegExp(`(${value})+`, 'g' + flags), '<$1>'),
            prefix + '<' + value + '>|<' + value + '>');
      const named = new RegExp(`(?<value>${value})+`, 'd' + flags).exec(value.repeat(2));
      equal(named?.groups.value, value);
      equal(named?.indices.groups.value, [value.length, value.length * 2]);
      const empty = new RegExp(`(${value})*`, 'dg' + flags);
      equal(Array.from(empty.exec('X')), ['', undefined]);
      equal(empty.lastIndex, 0);
    }
  }
  // Escaped patterns can be ASCII even when their atoms are not.
  equal(/(\u00e9)+/u.exec('\u00e9\u00e9')?.[0], '\u00e9\u00e9');
  equal(/(\u{1f600})+/u.exec('\u{1f600}\u{1f600}')?.[1], '\u{1f600}');
  equal(/\q(\u00e9)+/.exec('q\u00e9')?.[0], 'q\u00e9');
  equal(/(\u00e9)+/y.exec('X\u00e9'), null);
  const interior = /(\u00e9)+/y;
  interior.lastIndex = 1;
  equal(interior.exec('\u00e9'), null);
  equal(interior.lastIndex, 0);
  // ASCII paths and the independent ignore-case literal repair remain intact.
  equal(/^(a|bc){1,3}$/.test('abcbc'), true);
  equal(Array.from(/^(?:(?:(a|bc))){1,3}$/d.exec('abcbc')),
        ['abcbc', 'bc']);
  equal(/^(?:(?:(a|bc))){1,3}$/d.exec('abcbc')?.indices,
        [[0, 5], [3, 5]]);
  equal(/^(?:(?:(a|bc))){1,3}$/.test('abcbcd'), false);
  equal(/(a)\1/i.exec('aA')?.[0], 'aA');
  equal(/\u00e9/iu.test('\u00c9'), true);
  console.log(`composed literals: ${checks} checks passed; byteMode=${byteMode}`);
})();
