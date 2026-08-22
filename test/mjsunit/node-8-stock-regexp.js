// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

function matches(regexp, subject) {
  return Array.from(subject.matchAll(regexp), match => ({
    index: match.index,
    length: match[0].length,
  }));
}

const eAcute = '\u00e9';
const emoji = '\u{1f600}';
const subject = 'x' + eAcute + emoji;

assertEquals(1, /é/.exec(subject).index);
assertEquals(1, new RegExp(eAcute).exec(subject).index);
assertEquals(2, /😀/.exec(subject).index);
assertEquals([
  {index: 0, length: 1},
  {index: 1, length: 1},
  {index: 2, length: 1},
  {index: 3, length: 1},
], matches(/./g, subject));

const unicodeMatches = matches(/./gu, emoji);
assertEquals([{index: 0, length: 2}], unicodeMatches);

const match = /😀/.exec(subject);
assertSame(match[0], subject.slice(match.index, match.index + match[0].length));
