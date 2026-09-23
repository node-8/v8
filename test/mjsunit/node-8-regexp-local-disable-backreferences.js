// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Fixed stock/byte oracles for local-i-disable backreferences.
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
    ({id,source:'(?-i:'+source+')',subject,values,bytes,stock,condition,extraFlags,start,names});
  const rows=[],bang=ascii('!'),x=ascii('X');
  for(const [name,target] of [
    ['latin',E],['cjk',C],['astral',A],['kelvin',K],['long-s',S],['ascii',ascii('a')]
  ]) {
    const p=string(target),b=target.bytes.length,s=target.stock.length;
    const pair=join(target,target),triple=join(pair,target),four=join(pair,pair);
    rows.push(
      row(name+'pair','('+p+')\\1',pair,[pair,target],[[0,2*b],[0,b]],[[0,2*s],[0,s]]),
      row(name+'forward','\\1('+p+')',target,[target,target],[[0,b],[0,b]],[[0,s],[0,s]]),
      row(name+'self','('+p+'\\1)',target,[target,target],[[0,b],[0,b]],[[0,s],[0,s]]),
      row(name+'nested','(('+p+')\\2)\\1',four,[four,pair,target],
        [[0,4*b],[0,2*b],[0,b]],[[0,4*s],[0,2*s],[0,s]]),
      row(name+'greedy','('+p+')+\\1',triple,[triple,target],
        [[0,3*b],[b,2*b]],[[0,3*s],[s,2*s]]),
      row(name+'lazy','('+p+')+?\\1',triple,[pair,target],
        [[0,2*b],[0,b]],[[0,2*s],[0,s]]),
      row(name+'reference-count','('+p+')\\1{2}',triple,[triple,target],
        [[0,3*b],[0,b]],[[0,3*s],[0,s]]),
      row(name+'reference-star','('+p+')\\1*',triple,[triple,target],
        [[0,3*b],[0,b]],[[0,3*s],[0,s]]),
      row(name+'unmatched','('+p+')?X\\1',x,[x,undefined],
        [[0,1],undefined],[[0,1],undefined]),
      row(name+'cleared','(?:(?:('+p+'))|X)+\\1',join(target,x),[join(target,x),undefined],
        [[0,b+1],undefined],[[0,s+1],undefined]),
      row(name+'zero-count','('+p+'){0}\\1',empty,[empty,undefined],
        [[0,0],undefined],[[0,0],undefined]),
      row(name+'empty-loop','(('+p+')?)*\\2',empty,[empty,undefined,undefined],
        [[0,0],undefined,undefined],[[0,0],undefined,undefined]),
      row(name+'anchored','^('+p+')\\1$',pair,[pair,target],[[0,2*b],[0,b]],[[0,2*s],[0,s]]),
      row(name+'branch','(?:none|('+p+')\\1)',pair,[pair,target],
        [[0,2*b],[0,b]],[[0,2*s],[0,s]]),
      row(name+'lookahead','(?=('+p+'))\\1',target,[target,target],
        [[0,b],[0,b]],[[0,s],[0,s]]),
      row(name+'reverse-before','(?<=\\1('+p+'))(!)',join(pair,bang),[bang,target,bang],
        [[2*b,2*b+1],[b,2*b],[2*b,2*b+1]],[[2*s,2*s+1],[s,2*s],[2*s,2*s+1]]),
      row(name+'reverse-after','(?<=('+p+')\\1)(!)',join(target,bang),[bang,target,bang],
        [[b,b+1],[0,b],[b,b+1]],[[s,s+1],[0,s],[s,s+1]])
    );
  }
  for(const item of [...rows]) {
    rows.push({...item,id:'local-'+item.id,source:'(?i:'+item.source+')',extraFlags:''});
  }
  const e=string(E),c=string(C),r=string(R),pair=join(E,E),upperPair=join(EC,EC);
  const plain=(...args)=>{
    const item=row(...args);
    item.source=args[1];
    return item;
  };
  rows.push(
    row('reject-case','('+e+')\\1',join(E,EC),null),
    plain('external-upper','('+e+')(?-i:\\1)',upperPair,[upperPair,EC],
      [[0,4],[0,2]],[[0,2],[0,1]]),
    plain('external-reject','('+e+')(?-i:\\1)',join(EC,E),null),
    plain('restore-tail','(?-i:('+e+')\\1)('+e+')',join(E,E,EC),[join(E,E,EC),E,EC],
      [[0,6],[0,2],[4,6]],[[0,3],[0,1],[2,3]]),
    row('nested-enable','(?i:('+e+'))\\1',upperPair,[upperPair,EC],
      [[0,4],[0,2]],[[0,2],[0,1]]),
    row('nested-enable-reject','(?i:('+e+'))\\1',join(EC,E),null),
    row('named','(?<name>'+e+')\\k<name>',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]],'all','i',0,{name:1}),
    plain('local-root','(?i:(?-i:('+e+')\\1))',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]],'all',''),
    row('positive-class','(['+e+c+'])\\1',join(C,C),[join(C,C),C],
      [[0,6],[0,3]],[[0,2],[0,1]]),
    row('reverse-forward','(?<=\\1('+e+'))(?=('+c+'))\\2',join(pair,C),[C,E,C],
      [[4,7],[2,4],[4,7]],[[2,3],[1,2],[2,3]]),
    row('nullable-empty','^('+e+')?\\1$',empty,[empty,undefined],
      [[0,0],undefined],[[0,0],undefined]),
    row('zero-capture','^()\\1$',empty,[empty,empty],
      [[0,0],[0,0]],[[0,0],[0,0]]),
    row('decoder-inside','^(.)\\1$',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]],'stock'),
    plain('decoder-before','.(?-i:('+e+')\\1)',join(C,pair),[join(C,pair),E],
      [[0,7],[3,5]],[[0,3],[1,2]],'stock'),
    plain('decoder-after','(?-i:('+e+')\\1).',join(pair,C),[join(pair,C),E],
      [[0,7],[0,2]],[[0,3],[0,1]],'stock'),
    plain('local-decoder-after','(?i:(?-i:('+e+')\\1)).',join(pair,C),[join(pair,C),E],
      [[0,7],[0,2]],[[0,3],[0,1]],'stock',''),
    plain('local-decoder-before','.(?i:(?-i:('+e+')\\1))',join(C,pair),[join(C,pair),E],
      [[0,7],[3,5]],[[0,3],[1,2]],'stock',''),
    row('nested-decoder','(?i:(.))\\1',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]],'stock'),
    plain('folded-reference-excluded','(?-i:('+e+'))\\1',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]],'stock'),
    row('nested-folded-reference-excluded','(?i:('+e+')\\1)',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]],'stock'),
    row('migration-boundary','^\\B('+e+')\\B\\1\\B$',pair,[pair,E],
      [[0,4],[0,2]],[[0,2],[0,1]]),
    row('migration-lookahead','^(?=('+e+')\\1)('+e+e+')$',pair,[pair,E,pair],
      [[0,4],[0,2],[0,4]],[[0,2],[0,1],[0,2]]),
    row('migration-lookbehind','(?<=('+e+')\\1)('+c+')',join(pair,C),[C,E,C],
      [[4,7],[2,4],[4,7]],[[2,3],[1,2],[2,3]]),
    row('forward-dispatch','^([^a'+r+'])\\1$',join(C,C),[join(C,C),C],
      [[0,6],[0,3]],[[0,2],[0,1]])
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
    source='(?-i:'+source+')';
    if(local) {source='(?i:'+source+')';flags=flags.replace('i','');}
    const wrap = re => {
      let calls=0;
      re.exec=function(subject) {
        if(++calls>64) throw Error('LOCAL_DISABLE_BACKREFERENCES_BOUNDED_EXEC');
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
  const subject=join(E,E,C,E,E),data=selected(subject),input=string(subject);
  for(const grammar of ['', 'u', 'v']) {
    const apiRows=[
      ['pair','('+e+')\\1',byte?[[0,4],[7,11]]:[[0,2],[3,5]],
        byte?[[0,2],[7,9]]:[[0,1],[3,4]]],
      ['lookahead','(?=('+e+'))\\1',byte?[[0,2],[2,4],[7,9],[9,11]]:[[0,1],[1,2],[3,4],[4,5]],
        byte?[[0,2],[2,4],[7,9],[9,11]]:[[0,1],[1,2],[3,4],[4,5]]],
      ['lookbehind','(?<=('+e+'))\\1',byte?[[2,4],[9,11]]:[[1,2],[4,5]],
        byte?[[0,2],[7,9]]:[[0,1],[3,4]]],
      ['empty','()\\1',byte?[[0,0],[2,2],[4,4],[7,7],[9,9],[11,11]]:
        [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5]],
        byte?[[0,0],[2,2],[4,4],[7,7],[9,9],[11,11]]:
        [[0,0],[1,1],[2,2],[3,3],[4,4],[5,5]]],
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
            if(calls.length>16) throw Error('LOCAL_DISABLE_BACKREFERENCES_BOUNDED_CALLBACK');
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
  equal('fixed-api-cases',apiCases,48);
  equal('fixed-api-checks',checks-apiStart+1,962);
  equal('fixed-case-count',cases,1416);
  equal('fixed-check-count',checks+1,12296);
  emit(encode({kind:'local-disable-backreferences-profile',profile,actualWidth:width}));
  emit(encode({kind:'local-disable-backreferences',profile,
    cases,checks,expectedCases:1416,expectedChecks:12296,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('LOCAL_DISABLE_BACKREFERENCES_ORACLE: '+failureCount);
})();
