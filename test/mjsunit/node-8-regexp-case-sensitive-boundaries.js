// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: case-sensitive word assertions with fixed stock and byte oracles.
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
  const C = fixture([0xe4,0xb8,0xad],[0x4e2d]);
  const A = fixture([0xf0,0x9f,0x98,0x80],[0xd83d,0xde00]);
  const R = fixture([0xef,0xbf,0xbd],[0xfffd]);
  const raw = bytes => fixture(bytes,bytes);
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = '', start = 0, names) =>
    ({id,source,subject,values,bytes,stock,condition,extraFlags,start,names});
  const rows = [];
  const contexts = [
    ['a',ascii('a'),true], ['z',ascii('z'),true],
    ['A',ascii('A'),true], ['Z',ascii('Z'),true],
    ['0',ascii('0'),true], ['9',ascii('9'),true], ['_',ascii('_'),true],
    ['dash',ascii('-'),false], ['space',ascii(' '),false],
    ['lf',ascii('\n'),false], ['C',C,false], ['astral',A,false],
    ['kelvin',fixture([0xe2,0x84,0xaa],[0x212a]),false],
    ['long-s',fixture([0xc5,0xbf],[0x17f]),false],
    ['raw-continuation',raw([0x80]),false],
    ['raw-prefix',raw([0xe2,0x80]),false],
  ];
  for(const [name,context,word] of contexts) {
    const b=context.bytes.length,s=context.stock.length;
    for(const boundary of [true,false]) {
      const assertion=boundary?'\\b':'\\B',match=boundary===word;
      rows.push(
        row(name+boundary+'left',assertion+'('+string(E)+')',join(context,E),
          match?[E,E]:null,[[b,b+2],[b,b+2]],[[s,s+1],[s,s+1]]),
        row(name+boundary+'right','('+string(E)+')'+assertion,join(E,context),
          match?[E,E]:null,[[0,2],[0,2]],[[0,1],[0,1]])
      );
    }
  }
  for(const [name,part] of [['e',E],['C',C],['astral',A]]) {
    const b=part.bytes.length,s=part.stock.length,p=string(part);
    for(const boundary of [true,false]) {
      const assertion=boundary?'\\b':'\\B';
      rows.push(
        row(name+boundary+'input-start','^'+assertion+'('+p+')$',part,
          boundary?null:[part,part],[[0,b],[0,b]],[[0,s],[0,s]]),
        row(name+boundary+'input-end','^('+p+')'+assertion+'$',part,
          boundary?null:[part,part],[[0,b],[0,b]],[[0,s],[0,s]])
      );
    }
  }
  const pair=join(E,C),key=join(ascii('key='),pair,ascii('!'));
  rows.push(
    row('input-anchor','^\\bkey=(('+string(E)+'|'+string(C)+'){2})!$',key,
      [key,pair,C],[[0,10],[4,9],[6,9]],[[0,7],[4,6],[5,6]]),
    row('branch-anchor','(?:^\\bkey=(('+string(E)+'|'+string(C)+'){2})!|none)',key,
      [key,pair,C],[[0,10],[4,9],[6,9]],[[0,7],[4,6],[5,6]]),
    row('named','^\\B(?<left>'+string(E)+')\\B(?<right>'+string(C)+')\\B$',pair,
      [pair,E,C],[[0,5],[0,2],[2,5]],[[0,2],[0,1],[1,2]],'all','',0,{left:1,right:2}),
    row('positive-class','^\\B(['+string(E)+string(C)+']+)\\B$',pair,
      [pair,pair],[[0,5],[0,5]],[[0,2],[0,2]]),
    row('negated-class','^\\B([^a]+)\\B$',pair,
      [pair,pair],[[0,5],[0,5]],[[0,2],[0,2]]),
    row('dot','^\\B(.)\\B$',C,[C,C],[[0,3],[0,3]],[[0,1],[0,1]]),
    row('astral-dot','^\\B(.)\\B$',A,[A,A],[[0,4],[0,4]],[[0,2],[0,2]],'unicode'),
    row('lookahead','\\B(?='+string(E)+')('+string(E)+')',E,
      [E,E],[[0,2],[0,2]],[[0,1],[0,1]]),
    row('lookbehind','(?<='+string(E)+')\\B('+string(C)+')',pair,
      [C,C],[[2,5],[2,5]],[[1,2],[1,2]]),
    row('backref','^\\B('+string(E)+')\\B\\1\\B$',join(E,E),
      [join(E,E),E],[[0,4],[0,2]],[[0,2],[0,1]]),
    row('local-m','(?m:^\\B('+string(E)+')\\B$)',join(LS,E,PS),
      [E,E],[[3,5],[3,5]],[[1,2],[1,2]]),
    row('local-ms','(?ms:^\\B(.'+string(E)+')\\B$)',join(ascii('\n'),E),
      [join(ascii('\n'),E),join(ascii('\n'),E)],[[0,3],[0,3]],[[0,2],[0,2]]),
    row('case-negative','^\\B'+string(E)+'\\B$',EC,null)
  );
  for(const q of ['+','+?','{2}','{1,3}','{1,3}?']) {
    rows.push(row('repeat'+q,'^((?:\\B'+string(E)+')'+q+')\\B$',join(E,E),
      [join(E,E),join(E,E)],[[0,4],[0,4]],[[0,2],[0,2]]));
  }
  rows.push(
    row('nullable-empty','^((?:\\B'+string(E)+')*)\\B$',empty,
      [empty,empty],[[0,0],[0,0]],[[0,0],[0,0]]),
    row('nullable-positive','^((?:\\B'+string(E)+')*)\\B$',join(E,E),
      [join(E,E),join(E,E)],[[0,4],[0,4]],[[0,2],[0,2]]),
    row('nullable-choice','^((?:\\B'+string(E)+'|))*\\B$',E,
      [E,E],[[0,2],[0,2]],[[0,1],[0,1]])
  );
  for(const flag of ['g','y']) {
    for(const [name,bo,so] of [['start',0,0],['inside',1,1],['next',2,1],['end',4,2]]) {
      const found=name!=='end' && !(byte && flag==='y' && name==='inside');
      const bp=name==='start'?0:2,sp=name==='start'?0:1;
      rows.push(row(flag+name,'\\B('+string(E)+')',join(E,E),found?[E,E]:null,
        [[bp,bp+2],[bp,bp+2]],[[sp,sp+1],[sp,sp+1]],'all',flag,byte?bo:so));
    }
  }
  for(const [name,subject] of [['raw',raw([0x80])],['prefix',raw([0xe2,0x80])]]) {
    const b=subject.bytes.length;
    rows.push(
      row(name+'decoder','^\\B(.)\\B$',subject,[subject,subject],
        [[0,b],[0,b]],[[0,b],[0,b]],byte?'all':b===1?'all':'never'),
      row(name+'replacement','^\\B('+string(R)+')\\B$',subject,
        [subject,subject],[[0,b],[0,b]],[[0,b],[0,b]],'byte')
    );
  }
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

  const apiStart = checks;
  const intrinsicExec = RegExp.prototype.exec;
  let apiCases = 0;
  function makeApi(source, flags, slow) {
    const wrap = re => {
      let calls=0;
      re.exec=function(subject) {
        if(++calls>64) throw Error('CS_BOUNDARIES_BOUNDED_EXEC');
        return intrinsicExec.call(this,subject);
      };
      return re;
    };
    if(!slow) return new RegExp(source,flags);
    const re=wrap(new RegExp(source,flags));
    re.constructor={[Symbol.species]:function(source,nextFlags) {
      return wrap(new RegExp(source,nextFlags));
    }};
    return re;
  }
  const compact=match=>[Array.from(match,units),match.index,Array.from(match.indices)];
  function boundedAll(input,re) {
    const iterator=input.matchAll(re),output=[];
    for(let i=0;i<32;++i) {
      const next=iterator.next();
      if(next.done) return [output,true];
      output.push(compact(next.value));
    }
    return [output,false];
  }
  const subject=join(ascii('a'),E,ascii('-'),E,ascii('_!'),E);
  const data=selected(subject),input=string(subject);
  const e=string(E);
  const apiRows=[
    ['all','(\\b(?='+e+')|\\B(?='+e+'))',byte?[[1,1],[4,4],[8,8]]:[[1,1],[3,3],[6,6]]],
    ['boundary','(\\b(?='+e+'))',[[1,1]]],
    ['nonboundary','(\\B(?='+e+'))',byte?[[4,4],[8,8]]:[[3,3],[6,6]]],
    ['consuming','('+e+')\\b',byte?[[4,6]]:[[3,4]]],
  ];
  for(const [name,source,spans] of apiRows) {
    const expectedMatches=spans.map(([start,end])=>{
      const value=data.slice(start,end);
      return [[value,value],start,[[start,end],[start,end]]];
    });
    const replaced=[],split=[];
    let previous=0;
    for(const [start,end] of spans) {
      const value=data.slice(start,end),prefix=data.slice(previous,start);
      replaced.push(...prefix,60,...value,62);
      split.push(prefix,value);
      previous=end;
    }
    replaced.push(...data.slice(previous));
    split.push(data.slice(previous));
    for(const slow of [false,true]) for(const grammar of ['', 'u', 'v']) {
      ++apiCases;
      const tag='api-'+name+slow+grammar;
      for(let repeat=0;repeat<2;++repeat) {
        const re=makeApi(source,'dg'+grammar,slow);
        equal(tag+'match',input.match(re)?.map(units)??null,expectedMatches.map(m=>m[0][0]),tag);
        equal(tag+'reset',re.lastIndex,0,tag);
        equal(tag+'replace',units(input.replace(re,'<$1>')),replaced,tag);
        const calls=[];
        equal(tag+'callback-result',units(input.replace(re,(m,capture,offset,original)=>{
          if(calls.length>16) throw Error('CS_BOUNDARIES_BOUNDED_CALLBACK');
          calls.push([units(m),units(capture),offset,units(original)]);
          return '<'+capture+'>';
        })),replaced,tag);
        equal(tag+'callback',calls,expectedMatches.map(m=>[...m[0],m[1],data]),tag);
        equal(tag+'all',boundedAll(input,re),[expectedMatches,true],tag);
        equal(tag+'preserves',re.lastIndex,0,tag);
        equal(tag+'split',input.split(makeApi(source,grammar,slow)).map(units),split,tag);
        re.lastIndex=spans[0][0];
        const direct=re.exec(input);
        equal(tag+'direct',direct===null?null:compact(direct),expectedMatches[0],tag);
        equal(tag+'last-index',re.lastIndex,spans[0][1],tag);
      }
    }
  }
  equal('fixed-api-cases',apiCases,24);
  equal('fixed-api-checks',checks-apiStart+1,482);
  equal('fixed-case-count',cases,654);
  equal('fixed-check-count',checks+1,5720);
  emit(encode({kind:'case-sensitive-boundaries-profile',profile,actualWidth:width}));
  emit(encode({kind:'case-sensitive-boundaries',profile,
    cases,checks,expectedCases:654,expectedChecks:5720,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('CS_BOUNDARIES_ORACLE: '+failureCount);
})();

