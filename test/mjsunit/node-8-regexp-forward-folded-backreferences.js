// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Fixed stock/byte oracles for forward Unicode-folded backreferences.
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
  const rows=[],bang=ascii('!'),x=ascii('X');
  const G=fixture([0xcf,0x83],[0x3c3]),GC=fixture([0xce,0xa3],[0x3a3]);
  const D=fixture([0xf0,0x90,0x90,0x80],[0xd801,0xdc00]);
  const DC=fixture([0xf0,0x90,0x90,0xa8],[0xd801,0xdc28]);
  for(const [name,left,right,condition] of [
    ['latin',E,EC,'all'],['kelvin',ascii('k'),K,'unicode'],
    ['long-s',S,ascii('S'),'unicode'],['greek',G,GC,'all'],
    ['deseret',D,DC,'unicode'],['cjk',C,C,'all'],['ascii',ascii('a'),ascii('A'),'all']
  ]) {
    const p=string(left),q=string(right),b=left.bytes.length,t=right.bytes.length;
    const s=left.stock.length,u=right.stock.length,pair=join(left,right);
    const triple=join(pair,left),twice=join(left,right,right),four=join(pair,pair);
    rows.push(
      row(name+'pair','^('+p+')\\1$',pair,[pair,left],[[0,b+t],[0,b]],[[0,s+u],[0,s]],condition),
      row(name+'narrow','^('+q+')\\1$',join(right,left),[join(right,left),right],
        [[0,t+b],[0,t]],[[0,u+s],[0,u]],condition),
      row(name+'twice','^('+p+')\\1{2}$',twice,[twice,left],
        [[0,b+2*t],[0,b]],[[0,s+2*u],[0,s]],condition),
      row(name+'star','^('+p+')\\1*$',twice,[twice,left],
        [[0,b+2*t],[0,b]],[[0,s+2*u],[0,s]],condition),
      row(name+'branch','^(?:none|('+p+')\\1)$',pair,[pair,left],
        [[0,b+t],[0,b]],[[0,s+u],[0,s]],condition),
      row(name+'nested','^(('+p+')\\2)\\1$',four,[four,pair,left],
        [[0,2*(b+t)],[0,b+t],[0,b]],[[0,2*(s+u)],[0,s+u],[0,s]],condition),
      row(name+'greedy','^('+p+')+\\1$',triple,[triple,right],
        [[0,2*b+t],[b,b+t]],[[0,2*s+u],[s,s+u]],condition),
      row(name+'lazy','^('+p+')+?\\1'+p+'$',triple,[triple,left],
        [[0,2*b+t],[0,b]],[[0,2*s+u],[0,s]],condition),
      row(name+'lookahead','^(?=('+p+'))\\1\\1$',pair,[pair,left],
        [[0,b+t],[0,b]],[[0,s+u],[0,s]],condition),
      row(name+'named','^(?<name>'+p+')\\k<name>$',pair,[pair,left],
        [[0,b+t],[0,b]],[[0,s+u],[0,s]],condition,'i',0,{name:1}),
      row(name+'empty-capture','^()('+p+')\\2\\1$',pair,[pair,empty,left],
        [[0,b+t],[0,0],[0,b]],[[0,s+u],[0,0],[0,s]],condition),
      row(name+'bounded','^('+p+')\\1{2,3}?$',twice,[twice,left],
        [[0,b+2*t],[0,b]],[[0,s+2*u],[0,s]],condition),
      row(name+'too-short','^('+p+')\\1$',left,null),
      row(name+'reject','^('+p+')\\1$',join(left,bang),null),
      row(name+'forward','^\\1('+p+')$',left,[left,left],[[0,b],[0,b]],[[0,s],[0,s]]),
      row(name+'self','^('+p+'\\1)$',left,[left,left],[[0,b],[0,b]],[[0,s],[0,s]]),
      row(name+'unmatched','^('+p+')?X\\1$',x,[x,undefined],[[0,1],undefined],[[0,1],undefined]),
      row(name+'cleared','^(?:('+p+')|X)+\\1$',join(left,x),[join(left,x),undefined],
        [[0,b+1],undefined],[[0,s+1],undefined]),
      row(name+'empty','^('+p+')?\\1$',empty,[empty,undefined],[[0,0],undefined],[[0,0],undefined])
    );
  }
  for(const item of [...rows]) {
    rows.push({...item,id:'local-'+item.id,source:'(?i:'+item.source+')',extraFlags:''});
  }
  const e=string(E),c=string(C),pair=join(E,E);
  const sharp=fixture([0xc3,0x9f],[0xdf]),sharpUpper=fixture([0xe1,0xba,0x9e],[0x1e9e]);
  const surrogate=fixture([0xed,0xa0,0x80],[0xd800]);
  rows.push(
    row('mixed-capture','^(k'+e+')\\1$',join(ascii('k'),E,K,EC),
      [join(ascii('k'),E,K,EC),join(ascii('k'),E)],[[0,8],[0,3]],[[0,4],[0,2]],'unicode'),
    row('simple-sharp','^('+string(sharp)+')\\1$',join(sharp,sharpUpper),
      [join(sharp,sharpUpper),sharp],[[0,5],[0,2]],[[0,2],[0,1]],'unicode'),
    row('no-expansion','^('+string(sharp)+')\\1$',join(sharp,ascii('ss')),null),
    row('surrogate','^('+string(surrogate)+')\\1$',join(surrogate,surrogate),
      [join(surrogate,surrogate),surrogate],[[0,6],[0,3]],[[0,2],[0,1]]),
    row('scope-sensitive','^(?i:('+e+')\\1)X$',join(E,EC,x),
      [join(E,EC,x),E],[[0,5],[0,2]],[[0,3],[0,1]],'all',''),
    row('scope-reject','^(?i:('+e+')\\1)X$',join(E,EC,ascii('x')),null,undefined,undefined,'all',''),
    row('external-sensitive','^(?-i:('+e+'))\\1$',join(E,EC),[join(E,EC),E],
      [[0,4],[0,2]],[[0,2],[0,1]]),
    row('reference-sensitive','^('+e+')(?-i:\\1)$',join(E,EC),null),
    row('external-local','^('+e+')(?i:\\1)$',join(E,EC),[join(E,EC),E],
      [[0,4],[0,2]],[[0,2],[0,1]],'all',''),
    row('nested-flags','^(?-i:(?i:('+e+')\\1))$',join(E,EC),[join(E,EC),E],
      [[0,4],[0,2]],[[0,2],[0,1]]),
    row('excluded-decoder','^(.)\\1$',pair,[pair,E],[[0,4],[0,2]],[[0,2],[0,1]],'stock'),
    row('excluded-reverse','(?<=('+e+')\\1)('+c+')',join(pair,C),[C,E,C],
      [[4,7],[2,4],[4,7]],[[2,3],[1,2],[2,3]],'stock'),
    row('empty-root','()\\1',join(C,E),[empty,empty],[[0,0],[0,0]],[[0,0],[0,0]])
  );
  for(const flag of ['g','y'])for(const [name,bo,so] of [
    ['start',0,0],['inside',1,0],['next',2,1],['end',8,4]
  ]) {
    const found=name!=='end'&&!(byte&&flag==='y'&&name==='inside');
    const bp=name==='start'?0:2,sp=name==='next'?1:0;
    rows.push(row(flag+name,'('+e+')\\1',join(pair,pair),found?[pair,E]:null,
      [[bp,bp+4],[bp,bp+2]],[[sp,sp+2],[sp,sp+1]],'all','i'+flag,byte?bo:so));
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
  function makeApi(source, flags, slow, local) {
    if(local) {source='(?i:'+source+')';flags=flags.replace('i','');}
    const wrap = re => {
      let calls=0;
      re.exec=function(subject) {
        if(++calls>64) throw Error('FORWARD_FOLDED_BACKREFERENCES_BOUNDED_EXEC');
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
  const subject=join(ascii('kK'),C,K,ascii('k'),C,ascii('k'),K);
  const data=selected(subject),input=string(subject);
  for(const grammar of ['', 'u', 'v']) {
    const folded=byte||grammar!=='';
    const apiRows=[
      ['pair','(k)\\1',byte?[[0,2],[5,9],[12,16]]:folded?[[0,2],[3,5],[6,8]]:[[0,2]],
        byte?[[0,1],[5,8],[12,13]]:folded?[[0,1],[3,4],[6,7]]:[[0,1]]],
      ['lookahead','(?=(k))\\1',byte?[[0,1],[1,2],[5,8],[8,9],[12,13],[13,16]]:
        folded?[[0,1],[1,2],[3,4],[4,5],[6,7],[7,8]]:[[0,1],[1,2],[4,5],[6,7]],
        byte?[[0,1],[1,2],[5,8],[8,9],[12,13],[13,16]]:
        folded?[[0,1],[1,2],[3,4],[4,5],[6,7],[7,8]]:[[0,1],[1,2],[4,5],[6,7]]],
      ['empty','()\\1',byte?[[0,0],[1,1],[2,2],[5,5],[8,8],[9,9],[12,12],[13,13],[16,16]]:
        [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8]],
        byte?[[0,0],[1,1],[2,2],[5,5],[8,8],[9,9],[12,12],[13,13],[16,16]]:
        [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8]]],
    ];
    for(const [name,source,spans,captures] of apiRows) {
      const expectedMatches=spans.map(([start,end],i)=>{
        const cap=captures[i];
        return [[data.slice(start,end),data.slice(...cap)],start,[[start,end],cap]];
      });
      const replaced=[],split=[];
      let previous=0;
      for(let i=0;i<spans.length;++i) {
        const [start,end]=spans[i];
        replaced.push(...data.slice(previous,start),60,...data.slice(...captures[i]),62);
        previous=end;
      }
      replaced.push(...data.slice(previous));
      previous=0;
      for(let i=0;i<spans.length;++i) {
        const [start,end]=spans[i];
        if(start===end&&(start===0||start===data.length)) continue;
        split.push(data.slice(previous,start),data.slice(...captures[i]));
        previous=end;
      }
      split.push(data.slice(previous));
      for(const slow of [false,true]) for(const local of [false,true]) {
        ++apiCases;
        const tag='api-'+name+slow+grammar+local;
        for(let repeat=0;repeat<2;++repeat) {
          const re=makeApi(source,'dgi'+grammar,slow,local);
          equal(tag+'match',input.match(re)?.map(units)??null,expectedMatches.map(m=>m[0][0]),tag);
          equal(tag+'reset',re.lastIndex,0,tag);
          equal(tag+'replace',units(input.replace(re,'<$1>')),replaced,tag);
          const calls=[];
          equal(tag+'callback-result',units(input.replace(re,(m,capture,offset,original)=>{
            if(calls.length>16) throw Error('FORWARD_FOLDED_BACKREFERENCES_BOUNDED_CALLBACK');
            calls.push([units(m),units(capture),offset,units(original)]);
            return '<'+capture+'>';
          })),replaced,tag);
          equal(tag+'callback',calls,expectedMatches.map(m=>[...m[0],m[1],data]),tag);
          equal(tag+'all',boundedAll(input,re),[expectedMatches,true],tag);
          equal(tag+'preserves',re.lastIndex,0,tag);
          equal(tag+'split',input.split(makeApi(source,'i'+grammar,slow,local)).map(units),split,tag);
          re.lastIndex=spans[0][0];
          const direct=re.exec(input);
          equal(tag+'direct',direct===null?null:compact(direct),expectedMatches[0],tag);
          equal(tag+'last-index',re.lastIndex,spans[0][1],tag);
        }
      }
    }
  }
  equal('fixed-api-cases',apiCases,36);
  equal('fixed-api-checks',checks-apiStart+1,722);
  equal('fixed-case-count',cases,1722);
  equal('fixed-check-count',checks+1,14504);
  emit(encode({kind:'forward-folded-backreferences-profile',profile,actualWidth:width}));
  emit(encode({kind:'forward-folded-backreferences',profile,
    cases,checks,expectedCases:1722,expectedChecks:14504,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('FORWARD_FOLDED_BACKREFERENCES_ORACLE: '+failureCount);
})();
