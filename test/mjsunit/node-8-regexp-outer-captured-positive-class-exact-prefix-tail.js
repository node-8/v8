// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics

const raw = (...input) => String.fromCharCode(...input);
const bytes = value =>
    Array.from({length: value.length}, (_, i) => value.charCodeAt(i));
const eAcute = String.fromCodePoint(0xe9);
const eCircumflex = String.fromCodePoint(0xea);

const exact = /([A-C\u00e9-\u00eb]{2})xy/du.exec(eAcute + eCircumflex + 'xy');
assertNotNull(exact);
assertEquals(bytes(eAcute + eCircumflex), bytes(exact[1]));
assertEquals([[0, 6], [0, 4]], Array.from(exact.indices));
assertNull(/([A-C\u00e9-\u00eb]{2})xy/du.exec(eAcute + 'xy'));

const prefixed = /key=([A-C\u00e9-\u00eb]{2})\r\n/du.exec(
    'key=' + eAcute + eCircumflex + '\r\n');
assertNotNull(prefixed);
assertEquals([[0, 10], [4, 8]], Array.from(prefixed.indices));

const eightScalars = 'A' + eAcute + 'BC' + eCircumflex + 'ABC';
const upperBound =
    /p=([A-C\u00e9-\u00eb]{8})z/du.exec('p=' + eightScalars + 'z');
assertNotNull(upperBound);
assertEquals(bytes(eightScalars), bytes(upperBound[1]));
assertEquals([[0, 13], [2, 12]], Array.from(upperBound.indices));

const lazySpelling =
    /k=([A-C\u00e9-\u00eb]{2}?)xy/du.exec('k=' + eAcute + eCircumflex + 'xy');
assertNotNull(lazySpelling);
assertEquals([[0, 8], [2, 6]], Array.from(lazySpelling.indices));

const malformedSubject =
    raw(0x80, 0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
const malformed = /k=([A-C\u00e9-\u00eb]{2})xy/dgu;
malformed.lastIndex = 1;
const malformedMatch = malformed.exec(malformedSubject);
assertNotNull(malformedMatch);
assertEquals([[1, 9], [3, 7]], Array.from(malformedMatch.indices));
assertEquals(9, malformed.lastIndex);

const all = Array.from(('k=' + eAcute + eCircumflex + 'xyk=A' + eAcute + 'xy')
                           .matchAll(/k=([A-C\u00e9-\u00eb]{2})xy/dgu));
assertEquals([[0, 8], [8, 15]], all.map(match => match.indices[0]));
assertEquals([[2, 6], [10, 13]], all.map(match => match.indices[1]));

const replacementCalls = [];
assertEquals(
    'Y',
    ('key=' + eAcute + eCircumflex + '\r\n')
        .replace(
            /key=([A-C\u00e9-\u00eb]{2})\r\n/gu, (match, value, offset) => {
              replacementCalls.push([offset, bytes(match), bytes(value)]);
              return 'Y';
            }));
assertEquals(
    [[
      0, bytes('key=' + eAcute + eCircumflex + '\r\n'),
      bytes(eAcute + eCircumflex)
    ]],
    replacementCalls);

function decodeScalar(input, position) {
  const first = input[position];
  if (first < 0x80) return {codePoint: first, width: 1};
  if (first < 0xc2 || first > 0xf4) return {codePoint: 0xfffd, width: 1};
  let width = 2;
  let secondFrom = 0x80;
  let secondTo = 0xbf;
  if (first >= 0xe0) {
    width = 3;
    if (first === 0xe0) secondFrom = 0xa0;
  }
  if (first >= 0xf0) {
    width = 4;
    if (first === 0xf0) secondFrom = 0x90;
    if (first === 0xf4) secondTo = 0x8f;
  }
  if (position + 1 >= input.length || input[position + 1] < secondFrom ||
      input[position + 1] > secondTo) {
    return {codePoint: 0xfffd, width: 1};
  }
  for (let offset = 2; offset < width; ++offset) {
    if (position + offset >= input.length || input[position + offset] < 0x80 ||
        input[position + offset] > 0xbf) {
      return {codePoint: 0xfffd, width: offset};
    }
  }
  let codePoint;
  if (width === 2) {
    codePoint = ((first & 0x1f) << 6) | (input[position + 1] & 0x3f);
  } else if (width === 3) {
    codePoint = ((first & 0x0f) << 12) | ((input[position + 1] & 0x3f) << 6) |
        (input[position + 2] & 0x3f);
  } else {
    codePoint = ((first & 0x07) << 18) | ((input[position + 1] & 0x3f) << 12) |
        ((input[position + 2] & 0x3f) << 6) | (input[position + 3] & 0x3f);
  }
  return {codePoint, width};
}

function inClass(codePoint) {
  return (codePoint >= 0x61 && codePoint <= 0x63) ||
      (codePoint >= 0xe9 && codePoint <= 0xeb);
}

function expectedSearch(input, start) {
  for (let candidate = start; candidate + 3 < input.length; ++candidate) {
    if (input[candidate] !== 0x6b || input[candidate + 1] !== 0x3d) continue;
    const captureStart = candidate + 2;
    let end = captureStart;
    let valid = true;
    for (let count = 0; count < 2; ++count) {
      if (end >= input.length) {
        valid = false;
        break;
      }
      const scalar = decodeScalar(input, end);
      if (!inClass(scalar.codePoint)) {
        valid = false;
        break;
      }
      end += scalar.width;
    }
    if (valid && end + 1 < input.length && input[end] === 0x78 &&
        input[end + 1] === 0x79) {
      return {match: [candidate, end + 2], capture: [captureStart, end]};
    }
  }
  return null;
}

const corpora = [
  [0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79],
  [0x80, 0x6b, 0x3d, 0x61, 0xc3, 0xa9, 0x78, 0x79],
  [0xe2, 0x82, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xff, 0x6b, 0x3d, 0xc3, 0xa9, 0x61, 0x78, 0x79],
  [0xed, 0xa0, 0x80, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xe0, 0x80, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xf0, 0x80, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
  [0xef, 0xbf, 0xbd, 0x6b, 0x3d, 0x61, 0x62, 0x78, 0x79],
];
let randomState = 0xe7132a09;
for (let sample = 0; sample < 200; ++sample) {
  const input = [];
  const length = 4 + (sample % 21);
  for (let i = 0; i < length; ++i) {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    input.push(randomState >>> 24);
  }
  input.push(0x6b, 0x3d, 0xc3, 0xa9, 0xc3, 0xaa, 0x78, 0x79);
  corpora.push(input);
}

const oracle = /k=([a-c\u00e9-\u00eb]{2})xy/dug;
for (const input of corpora) {
  const value = raw(...input);
  for (let start = 0; start <= input.length; ++start) {
    const expected = expectedSearch(input, start);
    oracle.lastIndex = start;
    const match = oracle.exec(value);
    if (expected === null) {
      assertNull(match);
      assertEquals(0, oracle.lastIndex);
    } else {
      assertNotNull(match);
      assertEquals(expected.match, match.indices[0]);
      assertEquals(expected.capture, match.indices[1]);
      assertEquals(
          input.slice(expected.match[0], expected.match[1]), bytes(match[0]));
      assertEquals(
          input.slice(expected.capture[0], expected.capture[1]),
          bytes(match[1]));
      assertEquals(expected.match[1], oracle.lastIndex);
    }
  }
}

// Complete exact patterns retain their existing executor.
const complete = /([A-C\u00e9-\u00eb]{2})/du.exec(eAcute + eCircumflex);
assertEquals([[0, 4], [0, 4]], Array.from(complete.indices));
