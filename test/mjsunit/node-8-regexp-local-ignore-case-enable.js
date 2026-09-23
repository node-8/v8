// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics
// Fixed stock/byte oracles for local ignore-case groups.
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
  const rows=[];
  const contexts=[
    ['a',ascii('a'),'all'],['z',ascii('z'),'all'],
    ['A',ascii('A'),'all'],['Z',ascii('Z'),'all'],
    ['0',ascii('0'),'all'],['9',ascii('9'),'all'],['_',ascii('_'),'all'],
    ['dash',ascii('-'),'never'],['space',ascii(' '),'never'],
    ['lf',ascii('\n'),'never'],['C',C,'never'],['astral',A,'never'],
    ['kelvin',K,'unicode'],['long-s',S,'unicode'],
    ['c5',raw([0xc5]),'never'],['bf',raw([0xbf]),'never'],
    ['e2',raw([0xe2]),'never'],['e284',raw([0xe2,0x84]),'never'],
    ['84aa',raw([0x84,0xaa]),'never'],['wrong-middle',raw([0xe2,0x85,0xaa]),'never'],
    ['wrong-long-s',raw([0xc5,0xbe]),'never'],['wrong-kelvin',raw([0xe2,0x84,0xab]),'never'],
  ];
  const opposite={all:'never',never:'all',unicode:'stock-legacy'};
  for(const [name,context,word] of contexts) {
    const b=context.bytes.length,s=context.stock.length;
    for(const boundary of [true,false]) {
      const assertion=boundary?'\\b':'\\B',condition=boundary?word:opposite[word];
      rows.push(
        row(name+boundary+'left',assertion+'('+string(E)+')',join(context,EC),
          [EC,EC],[[b,b+2],[b,b+2]],[[s,s+1],[s,s+1]],condition),
        row(name+boundary+'right','('+string(E)+')'+assertion,join(EC,context),
          [EC,EC],[[0,2],[0,2]],[[0,1],[0,1]],condition)
      );
    }
  }
  for(const [name,part,pattern,word,fold] of [
    ['e',EC,string(E),'never','all'],['K',K,string(K),'unicode','all'],
    ['S',S,string(S),'unicode','all'],['k-to-K',K,'k','unicode','unicode'],
    ['s-to-S',S,'s','unicode','unicode'],
  ]) {
    const b=part.bytes.length,s=part.stock.length;
    for(const boundary of [true,false]) {
      const assertion=boundary?'\\b':'\\B';
      const condition=fold==='unicode'?(boundary?'unicode':'never'):
        boundary?word:opposite[word];
      rows.push(
        row(name+boundary+'start','^'+assertion+'('+pattern+')$',part,
          [part,part],[[0,b],[0,b]],[[0,s],[0,s]],condition),
        row(name+boundary+'end','^('+pattern+')'+assertion+'$',part,
          [part,part],[[0,b],[0,b]],[[0,s],[0,s]],condition)
      );
    }
  }
  const pair=join(EC,K),wordPair=join(K,S),nonwordPair=join(EC,C);
  rows.push(
    row('named','^\\B(?<a>'+string(E)+')\\b(?<b>k)\\b$',pair,
      [pair,EC,K],[[0,5],[0,2],[2,5]],[[0,2],[0,1],[1,2]],'unicode','i',0,{a:1,b:2}),
    row('positive-class','^\\b([ks]+)\\b$',wordPair,
      [wordPair,wordPair],[[0,5],[0,5]],[[0,2],[0,2]],'unicode'),
    row('word-class','^\\b(\\w+)\\b$',wordPair,
      [wordPair,wordPair],[[0,5],[0,5]],[[0,2],[0,2]],'unicode'),
    row('negated-class','^\\B([^a]+)\\B$',nonwordPair,
      [nonwordPair,nonwordPair],[[0,5],[0,5]],[[0,2],[0,2]]),
    row('dot-nonword','^\\B(.)\\B$',EC,[EC,EC],[[0,2],[0,2]],[[0,1],[0,1]]),
    row('dot-word','^\\b(.)\\b$',K,[K,K],[[0,3],[0,3]],[[0,1],[0,1]],'unicode'),
    row('branch','^(?:\\B('+string(E)+')\\B|\\b(k)\\b)$',K,
      [K,undefined,K],[[0,3],undefined,[0,3]],[[0,1],undefined,[0,1]],'unicode'),
    row('local-m','(?m:^\\B('+string(E)+')\\B$)',join(LS,EC,PS),
      [EC,EC],[[3,5],[3,5]],[[1,2],[1,2]]),
    row('local-ms','(?ms:^\\B(.'+string(E)+')\\B$)',join(ascii('\n'),EC),
      [join(ascii('\n'),EC),join(ascii('\n'),EC)],[[0,3],[0,3]],[[0,2],[0,2]]),
    row('negative','^\\B'+string(E)+'\\B$',ascii('A'),null),
    row('contradiction','^\\b\\B('+string(E)+')$',EC,null),
    row('duplicate','^\\B\\B('+string(E)+')\\B$',EC,
      [EC,EC],[[0,2],[0,2]],[[0,1],[0,1]])
  );
  for(const q of ['+','+?','{2}','{1,3}','{1,3}?']) {
    rows.push(
      row('repeat-nonword'+q,'^((?:\\B'+string(E)+')'+q+')\\B$',join(EC,EC),
        [join(EC,EC),join(EC,EC)],[[0,4],[0,4]],[[0,2],[0,2]]),
      row('repeat-word'+q,'^\\b((?:k|s)'+q+')\\b$',wordPair,
        [wordPair,wordPair],[[0,5],[0,5]],[[0,2],[0,2]],'unicode')
    );
  }
  rows.push(
    row('nullable-empty','^((?:\\B'+string(E)+')*)\\B$',empty,
      [empty,empty],[[0,0],[0,0]],[[0,0],[0,0]]),
    row('nullable-positive','^((?:\\B'+string(E)+')*)\\B$',join(EC,EC),
      [join(EC,EC),join(EC,EC)],[[0,4],[0,4]],[[0,2],[0,2]]),
    row('nullable-choice','^((?:\\B'+string(E)+'|))*\\B$',EC,
      [EC,EC],[[0,2],[0,2]],[[0,1],[0,1]])
  );
  const origins=join(K,EC,S);
  for(const flag of ['g','y']) {
    for(const [name,bo,so] of [['start',0,0],['inside',1,0],['after',3,1],['middle',5,2],['end',7,3]]) {
      const found=!(byte&&flag==='y'&&name==='inside'),bp=name==='inside'?3:bo;
      rows.push(row(flag+name,'\\b()',origins,found?[empty,empty]:null,
        [[bp,bp],[bp,bp]],[[so,so],[so,so]],'unicode','i'+flag,byte?bo:so));
    }
    rows.push(row(flag+'inside-nonboundary','\\B()',origins,[empty,empty],
      [[1,1],[1,1]],[[0,0],[0,0]],'byte-or-stock-legacy','i'+flag,byte?1:0));
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
  const longText=ascii('a'.repeat(32766)),longSubject=join(longText,EC);
  rows.push(row('maximum-deferred-offset','^'+'a'.repeat(32766)+'\\b'+string(E)+'\\B$',
    longSubject,[longSubject],[[0,32768]],[[0,32767]]));

  for (const item of rows) {
    item.source='(?i:'+item.source+')';
    item.extraFlags=item.extraFlags.replace('i','');
  }
  const local=(id,source,subject,values,bytes,stock,condition='all',flags='',start=0,names)=>
    row(id,source,subject,values,bytes,stock,condition,flags,start,names);
  const e=string(E),ec=string(EC),c=string(C);
  const triple=join(E,EC,E),double=join(EC,EC);
  rows.push(
    local('local-simple','^(?i:('+e+'))$',EC,[EC,EC],
      [[0,2],[0,2]],[[0,1],[0,1]]),
    local('sensitive-siblings','^'+e+'(?i:('+e+'))'+e+'$',triple,[triple,EC],
      [[0,6],[2,4]],[[0,3],[1,2]]),
    local('sensitive-prefix-negative','^'+e+'(?i:('+e+'))'+e+'$',join(EC,EC,E),null),
    local('sensitive-suffix-negative','^'+e+'(?i:('+e+'))'+e+'$',join(E,EC,EC),null),
    local('ascii-siblings','^a(?i:(b))c$',ascii('aBc'),[ascii('aBc'),ascii('B')],
      [[0,3],[1,2]],[[0,3],[1,2]]),
    local('ascii-prefix-negative','^a(?i:(b))c$',ascii('ABc'),null),
    local('ascii-suffix-negative','^a(?i:(b))c$',ascii('aBC'),null),
    local('two-scopes','^(?i:('+e+'))-(?i:('+e+'))$',join(EC,ascii('-'),EC),
      [join(EC,ascii('-'),EC),EC,EC],[[0,5],[0,2],[3,5]],[[0,3],[0,1],[2,3]]),
    local('outer-repeat','^(?i:('+e+'))+$',double,[double,EC],
      [[0,4],[2,4]],[[0,2],[1,2]]),
    local('outer-star','(?i:('+e+'))*',double,[double,EC],
      [[0,4],[2,4]],[[0,2],[1,2]]),
    local('outer-backref','^(?i:('+e+'))\\1$',double,[double,EC],
      [[0,4],[0,2]],[[0,2],[0,1]]),
    local('backref-sensitive-negative','^(?i:('+e+'))\\1$',join(EC,E),null),
    local('outer-lookahead','^(?=(?i:'+e+'))(?i:('+e+'))$',EC,[EC,EC],
      [[0,2],[0,2]],[[0,1],[0,1]]),
    local('outer-negative-lookahead','^(?!(?i:'+e+'))'+c+'$',C,[C],
      [[0,3]],[[0,1]]),
    local('outer-ms','(?ms:^(?i:(.'+e+'))$)',join(ascii('\n'),EC),
      [join(ascii('\n'),EC),join(ascii('\n'),EC)],[[0,3],[0,3]],[[0,2],[0,2]]),
    local('combined-ims','(?ims:^(.'+e+'))$',join(ascii('\n'),EC),
      [join(ascii('\n'),EC),join(ascii('\n'),EC)],[[0,3],[0,3]],[[0,2],[0,2]]),
    local('nested-same-i','^(?i:(?i:('+e+')))$',EC,[EC,EC],
      [[0,2],[0,2]],[[0,1],[0,1]]),
    local('outside-class','^['+e+'](?i:('+e+'))$',join(E,EC),[join(E,EC),EC],
      [[0,4],[2,4]],[[0,2],[1,2]]),
    local('outside-class-negative','^['+e+'](?i:('+e+'))$',double,null),
    local('decoder-malformed-tail','^(?i:([^a]))'+e+'$',join(raw([0x80]),E),
      [join(raw([0x80]),E),raw([0x80])],[[0,3],[0,1]],[[0,2],[0,1]]),
    local('decoder-excluded-case','^(?i:([^a]))'+e+'$',join(ascii('A'),E),null),
    local('sensitive-boundary-after-fold','^(?i:(k))\\B$',K,[K,K],
      [[0,3],[0,3]],[[0,1],[0,1]],'unicode'),
    local('sensitive-boundary-negative','^(?i:(k))\\b$',K,null),
    local('historical-local-i','(?i:^key=((['+'A-C'+e+'-'+string(fixture([0xc3,0xab],[0xeb]))+c+']){2})!|none)',
      join(ascii('key='),E,C,ascii('!')),[join(ascii('key='),E,C,ascii('!')),join(E,C),C],
      [[0,10],[4,9],[6,9]],[[0,7],[4,6],[5,6]])
  );

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
    source='(?i:'+source+')';
    const wrap = re => {
      let calls=0;
      re.exec=function(subject) {
        if(++calls>64) throw Error('LOCAL_ENABLE_I_BOUNDED_EXEC');
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
  const subject=join(K,ascii('-'),S,ascii('!'),EC,ascii('_'));
  const data=selected(subject),input=string(subject);
  for(const grammar of ['', 'u', 'v']) {
    const unicode=byte||grammar!=='';
    const boundary=byte?[0,3,4,6,9,10]:unicode?[0,1,2,3,5,6]:[5,6];
    const nonboundary=byte?[7]:unicode?[4]:[0,1,2,3,4];
    const all=byte?[0,3,4,6,7,9,10]:[0,1,2,3,4,5,6];
    const apiRows=[
      ['boundary','(\\b)',boundary.map(p=>[p,p])],
      ['nonboundary','(\\B)',nonboundary.map(p=>[p,p])],
      ['all','(\\b|\\B)',all.map(p=>[p,p])],
      ['consuming','('+string(E)+')\\b',byte?[[7,9]]:[[4,5]]],
    ];
    for(const [name,source,spans] of apiRows) {
      const expectedMatches=spans.map(([start,end])=>{
        const value=data.slice(start,end);
        return [[value,value],start,[[start,end],[start,end]]];
      });
      const replaced=[],split=[];
      let previous=0;
      for(const [start,end] of spans) {
        replaced.push(...data.slice(previous,start),60,...data.slice(start,end),62);
        previous=end;
      }
      replaced.push(...data.slice(previous));
      previous=0;
      for(const [start,end] of spans.filter(([s,e])=>s!==e||(s>0&&s<data.length))) {
        split.push(data.slice(previous,start),data.slice(start,end));
        previous=end;
      }
      split.push(data.slice(previous));
      for(const slow of [false,true]) {
        ++apiCases;
        const tag='api-'+name+slow+grammar;
        for(let repeat=0;repeat<2;++repeat) {
          const re=makeApi(source,'dg'+grammar,slow);
          equal(tag+'match',input.match(re)?.map(units)??null,expectedMatches.map(m=>m[0][0]),tag);
          equal(tag+'reset',re.lastIndex,0,tag);
          equal(tag+'replace',units(input.replace(re,'<$1>')),replaced,tag);
          const calls=[];
          equal(tag+'callback-result',units(input.replace(re,(m,capture,offset,original)=>{
            if(calls.length>16) throw Error('LOCAL_ENABLE_I_BOUNDED_CALLBACK');
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
  }
  equal('fixed-api-cases',apiCases,24);
  equal('fixed-api-checks',checks-apiStart+1,482);
  equal('fixed-case-count',cases,1044);
  equal('fixed-check-count',checks+1,8840);
  emit(encode({kind:'local-enable-i-profile',profile,actualWidth:width}));
  emit(encode({kind:'local-enable-i',profile,
    cases,checks,expectedCases:1044,expectedChecks:8840,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('LOCAL_ENABLE_I_ORACLE: '+failureCount);
})();
