// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Stock uses UTF-16 coordinates for the same expressions.
const regexp = /(?:^key=(( [\uFFFDA-C\u00e9]){1,3})!$|none)/du;
const subject = 'key= \uFFFD \u00e9!';
const match = regexp.exec(subject);
assertNotNull(match);
assertEquals([[0, 9], [4, 8], [6, 8]], Array.from(match.indices));
const field = /(?:^key=(([\uFFFDA-C\u00e9]){1,3})!$|none)/du;
assertNull(field.exec('key=' + String.fromCharCode(0xff) + '!'));
assertEquals([[0, 7], [4, 6], [5, 6]],
             Array.from(field.exec('key=\uFFFD\u00e9!').indices));
assertNull(field.exec('key=\u4e2d!'));
const fallback = field.exec('key=\uFFFD?none');
assertEquals([[6, 10], undefined, undefined], Array.from(fallback.indices));
assertEquals('key=\uFFFD?X', 'key=\uFFFD?none'.replace(field, 'X'));
