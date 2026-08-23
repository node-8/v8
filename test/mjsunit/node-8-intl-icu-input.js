// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const formatter = new Intl.ListFormat('zh', {
  style: 'long',
  type: 'conjunction',
});

const formatted = formatter.format(['甲', '乙']);
assertEquals('甲和乙', formatted);

const conjunctionIndex = formatted.indexOf('和');
assertEquals('甲', formatted.slice(0, conjunctionIndex));
assertEquals('乙', formatted.slice(conjunctionIndex + '和'.length));

const parts = formatter.formatToParts(['é', '中', '😀']);
assertEquals(
    ['element', 'literal', 'element', 'literal', 'element'],
    parts.map(({type}) => type));
assertEquals(['é', '、', '中', '和', '😀'], parts.map(({value}) => value));
assertEquals(
    formatter.format(['é', '中', '😀']),
    parts.map(({value}) => value).join(''));

const loneSurrogate = String.fromCodePoint(0xd800);
assertEquals(loneSurrogate + '和中', formatter.format([loneSurrogate, '中']));
