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
  const cases = [
    ['[A-C\\u00e9-\\u00eb\\u4e2d]', 'A', '\u4e2d', ['', 'u']],
    ['[\\u00e9-\\u00eb]', '\u00e9', '\u00eb', ['', 'u']],
    ['[\\u007e-\\u0081]', '\u007e', '\u0081', ['', 'u']],
    ['[\\u07fe-\\u0801]', '\u07fe', '\u0801', ['', 'u']],
    ['[A-C\\u{1f600}-\\u{1f601}]', 'B', '\u{1f601}', ['u']],
    ['[\\ud800-\\ud802A]', 'A', '\ud802', ['u']],
    ['[\\u{10fffd}-\\u{10ffff}]', '\u{10fffd}', '\u{10ffff}', ['u']],
  ];
  for (const [cls, first, last, flagsList] of cases) {
    const field = first + last;
    for (const flags of flagsList) {
      const forms = [
        [`none|key=((${cls}){2})!`, 'key=' + field + '!', [field, last]],
        [`^key=((${cls}){1,3})!$`, 'key=' + field + '!', [field, last]],
        [`key=((${cls})+)!$`, 'key=' + field + '!', [field, last]],
        [`key=((${cls}+))!`, 'key=' + field + '!', [field, field]],
        [`(?:key=(${cls}{2})!|other=(${cls}{2})!)`, 'other=' + field + '!',
         [undefined, field]],
        [`((?:key=(${cls}{2})!|none))`, 'key=' + field + '!',
         ['key=' + field + '!', field]],
        [`((${cls}){1,3}?)${last}!`, field + last + '!', [field, last]],
        [`(${cls})?Z`, 'Z', [undefined]],
        [`(${cls}|)Z`, 'Z', ['']],
      ];
      for (const [pattern, subject, captures] of forms) {
        const re = new RegExp(pattern, 'd' + flags);
        equal(re.flags, 'd' + flags);
        equal(re.source, new RegExp(pattern, flags).source);
        for (let count = 0; count < 4; ++count) {
          const match = re.exec(subject);
          equal(match && Array.from(match), [subject, ...captures]);
          equal(match?.indices[0], [0, subject.length]);
          for (let i = 1; i <= captures.length; ++i) {
            if (captures[i - 1] === undefined) {
              equal(match.indices[i], undefined);
            } else {
              const [start, end] = match.indices[i];
              equal(subject.slice(start, end), captures[i - 1]);
            }
          }
        }
      }
      const prefix = '\u2603|';
      // End-only anchoring uses the rebuilt byte maximum, not code-unit width.
      const ended = new RegExp(`(${cls}{2})${last}$`, 'd' + flags)
          .exec(prefix + field + last);
      equal(ended?.indices, [[prefix.length, prefix.length + field.length + last.length],
                            [prefix.length, prefix.length + field.length]]);
      equal(new RegExp(`^${cls}{2}$`, flags).test(first), false);
      equal(new RegExp(`^${cls}{2}$`, flags).test(first + '!'), false);
      const subject = prefix + field + '!|' + field + '!';
      for (const kind of ['g', 'y']) {
        const re = new RegExp(`((${cls})+)!`, 'd' + kind + flags);
        re.lastIndex = prefix.length;
        const match = re.exec(subject);
        equal(match && Array.from(match), [field + '!', field, last]);
        equal(match?.indices, [[prefix.length, prefix.length + field.length + 1],
                              [prefix.length, prefix.length + field.length],
                              [prefix.length + first.length, prefix.length + field.length]]);
        equal(re.lastIndex, prefix.length + field.length + 1);
        if (kind === 'y') {
          equal(re.exec(subject), null);
          equal(re.lastIndex, 0);
        } else {
          equal(re.exec(subject)?.index, prefix.length + field.length + 2);
          equal(re.exec(subject), null);
          equal(re.lastIndex, 0);
        }
      }
      const named = new RegExp(`(?<run>(?<part>${cls})+)!`, 'd' + flags)
          .exec(field + '!');
      equal(named?.groups, {run: field, part: last});
      equal(named?.indices.groups, {run: [0, field.length], part: [first.length, field.length]});
      equal((field + '!').replace(new RegExp(`(${cls})+!`, flags), '<$1>'), '<' + last + '>');
    }
  }
  const sticky = /([A-C\u00e9-\u00eb])+!/dyu;
  sticky.lastIndex = 1;
  equal(sticky.exec('\u00e9!'), null);
  equal(sticky.lastIndex, 0);
  const anchored = /^(?:key=([A-C\u00e9-\u00eb]+)!|none)/dgu;
  anchored.lastIndex = 1;
  equal(anchored.exec('key=\u00e9!'), null);
  equal(anchored.lastIndex, 0);
  console.log(`positive class composition: ${checks} checks passed; byteMode=${byteMode}`);
})();
