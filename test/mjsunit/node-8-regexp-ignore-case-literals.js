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
  const pairs = [
    ['AbC', 'aBc'], ['\u00e9', '\u00c9'], ['\u00ff', '\u0178'],
    ['\u4e2d', '\u4e2d'], ['\u{1f600}', '\u{1f600}'],
    ['\u03a3', '\u03c2'], ['\u03c2', '\u03c3'],
    ['\u00df', '\u1e9e', true], ['k', '\u212a', true],
    ['\u212a', 'K', true], ['s', '\u017f', true],
    ['\u{10400}', '\u{10428}', true],
    ['A\u00e9\u4e2d\u{1f600}Z', 'a\u00c9\u4e2d\u{1f600}z'],
    ['A\u{10400}Z', 'a\u{10428}z', true],
    ['\uD800', '\uD800'], ['\uDC00', '\uDC00'], ['a\0b', 'A\0B'],
  ];
  const prefix = '\u2603|\u2603|';
  for (const flags of ['i', 'iu', 'iv', 'im', 'is']) {
    for (const [pattern, value, unicodeOnly] of pairs) {
      const matches = !unicodeOnly || byteMode ||
          flags.includes('u') || flags.includes('v');
      const regex = new RegExp(pattern, flags);
      equal(regex.flags, flags);
      equal(regex.unicode, flags.includes('u'));
      equal(regex.unicodeSets, flags.includes('v'));
      equal(regex.ignoreCase, true);
      equal(regex.source, new RegExp(pattern).source);
      // Reuse one expression across interpretation and tier-up.
      for (let i = 0; i < 4; ++i) equal(regex.test(value), matches);
      equal(regex.test('unrelated'), false);
      if (!matches) continue;
      const subject = prefix + value + '|' + value;
      for (const kind of ['g', 'y']) {
        const re = new RegExp(pattern, 'd' + kind + flags);
        re.lastIndex = prefix.length;
        const result = re.exec(subject);
        equal(result?.[0], value);
        equal(result?.index, prefix.length);
        equal(result?.indices, [[prefix.length, prefix.length + value.length]]);
        equal(re.lastIndex, prefix.length + value.length);
        equal(subject.slice(result.index, re.lastIndex), value);
        if (kind === 'g') {
          equal(re.exec(subject)?.index, prefix.length + value.length + 1);
        } else {
          equal(re.exec(subject), null);
          equal(re.lastIndex, 0);
        }
      }
      equal(subject.replace(new RegExp(pattern, 'g' + flags), '!'), prefix + '!|!');
      const offsets = [];
      subject.replace(new RegExp(pattern, 'g' + flags), (match, offset) => {
        equal(match, value);
        offsets.push(offset);
        return match;
      });
      equal(offsets, [prefix.length, prefix.length + value.length + 1]);
    }
    for (const [pattern, value] of [
      ['\u00df', 'ss'], ['i', '\u0130'], ['i', '\u0131'],
      ['\u00c0', '\u00e1'], ['\u00e9', '\u00ea'],
      ['\u{1f600}', '\u{1f601}'],
    ]) equal(new RegExp(pattern, flags).test(value), false);
  }
  // Legacy syntax remains available without an observable implicit u flag.
  equal(new RegExp('\\q\u00e9', 'i').test('q\u00c9'), true);
  equal(new RegExp('\\u00e9', 'i').test('\u00c9'), true);
  equal(/[\u00e9]/i.test('\u00c9'), true);
  equal(/\u{10400}/iu.test('\u{10428}'), true);
  // A sticky search must not begin inside a valid multibyte character.
  const sticky = /\u00e9/iy;
  sticky.lastIndex = 1;
  equal(sticky.exec('\u00c9'), null);
  equal(sticky.lastIndex, 0);
  console.log(`ignore-case literals: ${checks} checks passed; byteMode=${byteMode}`);
})();
