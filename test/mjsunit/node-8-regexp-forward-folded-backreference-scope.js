// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Independent fixed scope oracles; the primary frozen suite is unchanged.
'use strict';

(() => {
  const width = String.fromCodePoint(233).length;
  if (width !== 1 && width !== 2) throw Error('Unknown string profile');
  const byte = width === 2;
  const profile = byte ? 'node8' : 'stock';
  const emit = typeof print === 'function' ? print : console.log;
  const fixture = (bytes, stock) => ({bytes, stock});
  const ascii = text => {
    const data = Array.from(text, ch => ch.charCodeAt(0));
    if (data.some(value => value > 127)) throw Error('Non-ASCII fixture');
    return fixture(data, data);
  };
  const join = (...parts) => fixture(parts.flatMap(p => p.bytes),
                                    parts.flatMap(p => p.stock));
  const selected = value => value === undefined ? undefined : byte ? value.bytes : value.stock;
  const string = value => String.fromCharCode(...selected(value));
  const units = value => {
    const result = [];
    for (let i = 0; i < value.length; ++i) result.push(value.charCodeAt(i));
    return result;
  };
  const E = fixture([0xc3,0xa9],[0xe9]);
  const EC = fixture([0xc3,0x89],[0xc9]);
  const LS = fixture([0xe2,0x80,0xa8],[0x2028]);
  const PS = fixture([0xe2,0x80,0xa9],[0x2029]);
  const empty = ascii('');
  let checks = 0, cases = 0, failureCount = 0;
  const failures = [], failedCases = new Set();
  const encode = value => JSON.stringify(value, (_key,item) =>
    item === undefined ? {undefined:true} : item);
  function equal(label, actual, expected, id = label) {
    ++checks;
    if (encode(actual) === encode(expected)) return;
    ++failureCount;
    failedCases.add(id);
    if (failures.length < 40) failures.push({label,actual,expected});
  }
  for (const [name,value] of Object.entries({E,EC,LS,PS})) {
    equal('fixture-' + name, units(string(value)), selected(value));
  }

  const C=fixture([0xe4,0xb8,0xad],[0x4e2d]);
  const A=fixture([0xf0,0x9f,0x98,0x80],[0xd83d,0xde00]);
  const K=fixture([0xe2,0x84,0xaa],[0x212a]);
  const S=fixture([0xc5,0xbf],[0x17f]);
  const R=fixture([0xef,0xbf,0xbd],[0xfffd]);
  const raw=bytes=>fixture(bytes,bytes);
  const row=(id,source,subject,values,bytes,stock,
             condition='all',extraFlags='i',start=0,names)=>
    ({id,source,subject,values,bytes,stock,condition,extraFlags,start,names});
  const e=string(E),pair=join(E,E),double=join(EC,EC);
  const rows=[
    row('global-sensitive-k','^(?-i:(k))\\1$',join(ascii('k'),K),
      [join(ascii('k'),K),ascii('k')],[[0,4],[0,1]],[[0,2],[0,1]],'unicode'),
    row('local-sensitive-k','^(k)(?i:\\1)$',join(ascii('k'),K),
      [join(ascii('k'),K),ascii('k')],[[0,4],[0,1]],[[0,2],[0,1]],'unicode',''),
    row('global-sensitive-s','^(?-i:(s))\\1$',join(ascii('s'),S),
      [join(ascii('s'),S),ascii('s')],[[0,3],[0,1]],[[0,2],[0,1]],'unicode'),
    row('local-sensitive-s','^(s)(?i:\\1)$',join(ascii('s'),S),
      [join(ascii('s'),S),ascii('s')],[[0,3],[0,1]],[[0,2],[0,1]],'unicode',''),
    row('local-kelvin','^('+string(K)+')(?i:\\1)$',join(K,ascii('k')),
      [join(K,ascii('k')),K],[[0,4],[0,3]],[[0,2],[0,1]],'unicode',''),
    row('local-long-s','^('+string(S)+')(?i:\\1)$',join(S,ascii('S')),
      [join(S,ascii('S')),S],[[0,3],[0,2]],[[0,2],[0,1]],'unicode',''),
    row('quantified-sensitive-k','^(?-i:(k+))\\1$',join(ascii('kk'),K,K),
      [join(ascii('kk'),K,K),ascii('kk')],[[0,8],[0,2]],[[0,4],[0,2]],'unicode'),
    row('class-sensitive-s','^(?-i:([s]))\\1$',join(ascii('s'),S),
      [join(ascii('s'),S),ascii('s')],[[0,3],[0,1]],[[0,2],[0,1]],'unicode'),
    row('choice-sensitive-k','^(?-i:(k|X))\\1$',join(ascii('k'),K),
      [join(ascii('k'),K),ascii('k')],[[0,4],[0,1]],[[0,2],[0,1]],'unicode'),
    row('closed-literal','^(ab)(?i:\\1)$',ascii('abAB'),
      [ascii('abAB'),ascii('ab')],[[0,4],[0,2]],[[0,4],[0,2]],'all',''),
    row('closed-quantifier','^(ab+)(?i:\\1)$',ascii('abbbABBB'),
      [ascii('abbbABBB'),ascii('abbb')],[[0,8],[0,4]],[[0,8],[0,4]],'all',''),
    row('closed-choices','^((?:ab|cd)+)\\1$',ascii('abcdABCD'),
      [ascii('abcdABCD'),ascii('abcd')],[[0,8],[0,4]],[[0,8],[0,4]])
  ];
  function snapshot(match) {
    if (match === null) return null;
    const value = item => item === undefined ? undefined : units(item);
    return {
      values: Array.from(match, value), index: match.index,
      indices: Array.from(match.indices), input: units(match.input),
      slices: Array.from(match.indices, span => span === undefined ? undefined :
        units(match.input.slice(span[0], span[1]))),
      groups: match.groups === undefined ? null : Object.fromEntries(
        Object.entries(match.groups).map(([name, item]) => [name, value(item)])),
      groupIndices: match.indices.groups === undefined ? null : match.indices.groups,
    };
  }
  function allowed(condition, grammar) {
    if (condition === 'all') return true;
    if (condition === 'never') return false;
    if (condition === 'stock-legacy') return !byte && grammar === '';
    if (condition === 'stock') return !byte;
    if (condition === 'byte') return byte;
    if (condition === 'unicode') return byte || grammar !== '';
    if (condition === 'byte-or-stock-legacy') return byte || grammar === '';
    if (condition === 'stock-unicode') return !byte && grammar !== '';
    throw Error('Unknown fixed-oracle condition');
  }
  function sample(item, grammar, literal) {
    ++cases;
    const flags = 'd' + grammar + item.extraFlags;
    const id = item.id + ':' + flags + ':' + (literal ? 'literal' : 'constructor');
    let re;
    let error;
    try { re = literal ? eval('/' + item.source + '/' + flags) : new RegExp(item.source, flags); }
    catch (caught) { error = caught.name; }
    equal(id + ':compile', error, undefined, id);
    if (error !== undefined) return;
    equal(id + ':source', units(re.source), units(item.source), id);
    equal(id + ':flags', re.flags, Array.from(flags).sort().join(''), id);
    equal(id + ':mode', [re.ignoreCase, re.unicode, re.unicodeSets],
          [item.extraFlags.includes('i'), grammar === 'u', grammar === 'v'], id);
    const text = item.values !== null && allowed(item.condition, grammar) ? item.values : null;
    const indices = byte ? item.bytes : item.stock;
    const values = text === null ? null : text.map(selected);
    const expected = text === null ? null : {
      values, index: indices[0][0], indices, input: selected(item.subject), slices: values,
      groups: item.names === undefined ? null : Object.fromEntries(
        Object.entries(item.names).map(([name, capture]) => [name, values[capture]])),
      groupIndices: item.names === undefined ? null : Object.fromEntries(
        Object.entries(item.names).map(([name, capture]) => [name, indices[capture]])),
    };
    for (let repeat = 0; repeat < 2; ++repeat) {
      re.lastIndex = item.start;
      equal(id + ':exec-' + repeat, snapshot(re.exec(string(item.subject))), expected, id);
      equal(id + ':lastIndex-' + repeat, re.lastIndex,
            !item.extraFlags.includes('g') && !item.extraFlags.includes('y') ? item.start :
              text === null ? 0 : indices[0][1], id);
    }
  }
  for (const grammar of ['', 'u', 'v']) {
    for (const literal of [false, true]) {
      for (const item of rows) sample(item, grammar, literal);
    }
  }

  equal('fixed-case-count',cases,72);
  equal('fixed-check-count',checks+1,582);
  emit(encode({kind:'forward-folded-backreferences-scope-profile',profile,actualWidth:width}));
  emit(encode({kind:'forward-folded-backreferences-scope',profile,
    cases,checks,expectedCases:72,expectedChecks:582,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('FORWARD_FOLDED_BACKREFERENCES_SCOPE_ORACLE: '+failureCount);
})();
