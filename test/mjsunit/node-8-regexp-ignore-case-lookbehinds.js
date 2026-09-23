// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Flags: --utf8-string-semantics
// Fixed stock/byte oracles for reverse-safe Unicode-folded lookbehinds.
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
  const rows=[],bang=ascii('!');
  for(const [name,pattern,target,fold] of [
    ['latin',E,EC,'all'],['kelvin',ascii('k'),K,'unicode'],
    ['long-s',ascii('s'),S,'unicode'],['cjk',C,C,'all'],
    ['ascii',ascii('a'),ascii('A'),'all'],['astral',A,A,'all']
  ]) {
    const p=string(pattern),b=target.bytes.length,s=target.stock.length;
    const subject=join(target,bang),double=join(target,target,bang);
    rows.push(
      row(name+'positive','(?<='+p+')(!)',subject,[bang,bang],
        [[b,b+1],[b,b+1]],[[s,s+1],[s,s+1]],fold),
      row(name+'negative','(?<!'+p+')(!)',subject,[bang,bang],
        [[b,b+1],[b,b+1]],[[s,s+1],[s,s+1]],fold==='unicode'?'stock-legacy':'never'),
      row(name+'negative-other','(?<!'+p+')(!)',bang,[bang,bang],
        [[0,1],[0,1]],[[0,1],[0,1]]),
      row(name+'zero-positive','(?<=('+p+'))',subject,[empty,target],
        [[b,b],[0,b]],[[s,s],[0,s]],fold),
      row(name+'zero-negative','(?<!'+p+')()',target,[empty,empty],
        [[0,0],[0,0]],[[0,0],[0,0]]),
      row(name+'nested-backward','(?<=(?<='+p+')!)(!)',join(subject,bang),[bang,bang],
        [[b+1,b+2],[b+1,b+2]],[[s+1,s+2],[s+1,s+2]],fold),
      row(name+'nested-forward','(?<=('+p+')(?=!))(!)',subject,[bang,target,bang],
        [[b,b+1],[0,b],[b,b+1]],[[s,s+1],[0,s],[s,s+1]],fold),
      row(name+'alternation','(?<=('+p+'|#))(!)',subject,[bang,target,bang],
        [[b,b+1],[0,b],[b,b+1]],[[s,s+1],[0,s],[s,s+1]],fold),
      row(name+'greedy-capture','(?<=((?:'+p+')+))(!)',double,
        [bang,join(target,target),bang],
        [[2*b,2*b+1],[0,2*b],[2*b,2*b+1]],
        [[2*s,2*s+1],[0,2*s],[2*s,2*s+1]],fold),
      row(name+'lazy-capture','(?<=((?:'+p+')+?))(!)',double,[bang,target,bang],
        [[2*b,2*b+1],[b,2*b],[2*b,2*b+1]],
        [[2*s,2*s+1],[s,2*s],[2*s,2*s+1]],fold),
      row(name+'repeated-capture','(?<=(('+p+')+))(!)',double,
        [bang,join(target,target),target,bang],
        [[2*b,2*b+1],[0,2*b],[0,b],[2*b,2*b+1]],
        [[2*s,2*s+1],[0,2*s],[0,s],[2*s,2*s+1]],fold),
      row(name+'cleared-capture','(?<!('+p+'))(!)',bang,[bang,undefined,bang],
        [[0,1],undefined,[0,1]],[[0,1],undefined,[0,1]])
    );
  }
  for(const item of [...rows]) {
    rows.push({...item,id:'local-'+item.id,source:'(?i:'+item.source+')',extraFlags:''});
  }
  const e=string(E),c=string(C),r=string(R),double=join(EC,EC);
  rows.push(
    row('ascii-one-scalar','(?<!^)(?<!$)',E,null),
    row('ascii-end','(?<!^)',E,[empty],[[2,2]],[[1,1]]),
    row('ascii-two-scalars','(?<!^)(?<!$)',join(E,C),[empty],[[2,2]],[[1,1]])
  );
  for(const flag of ['g','y'])for(const [name,bo,so] of [
    ['start',0,0],['inside',1,0],['after',2,1],['end',4,2]
  ]) {
    const found=flag==='g'||name==='after'||name==='end';
    const bp=name==='end'?4:2,sp=name==='end'?2:1;
    rows.push(row(flag+name,'(?<=('+e+'))',double,found?[empty,EC]:null,
      [[bp,bp],[bp-2,bp]],[[sp,sp],[sp-1,sp]],'all','i'+flag,byte?bo:so));
  }
  const ec=join(E,C),upper=join(EC,C),malformed=join(raw([0x80]),C);
  rows.push(
    row('positive-class','(?<=['+e+c+'])(!)',join(EC,bang),[bang,bang],
      [[2,3],[2,3]],[[1,2],[1,2]]),
    row('sensitive-child','(?<=(?-i:'+e+'))('+c+')',ec,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]]),
    row('sensitive-child-reject','(?<=(?-i:'+e+'))('+c+')',upper,null),
    row('sensitive-child-forward','(?<=(?-i:(?='+e+')'+e+'))('+c+')',ec,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]]),
    row('local-m','(?m:(?<=^'+e+')('+c+')$)',join(LS,EC,C,PS),[C,C],
      [[5,8],[5,8]],[[2,3],[2,3]]),
    row('named','(?<=(?<before>'+e+'))(?<after>'+c+')',upper,[C,EC,C],
      [[2,5],[0,2],[2,5]],[[1,2],[0,1],[1,2]],'all','i',0,{before:1,after:2}),
    row('optional-empty','^(?:(?<=('+e+'))('+c+'))?$',empty,[empty,undefined,undefined],
      [[0,0],undefined,undefined],[[0,0],undefined,undefined]),
    row('optional-full','(?:(?<=('+e+'))('+c+'))?$',upper,[C,EC,C],
      [[2,5],[0,2],[2,5]],[[1,2],[0,1],[1,2]]),
    row('branches','(?:(?<=('+e+'))('+c+')|(?<=('+c+'))(!))',join(C,bang),
      [bang,undefined,undefined,C,bang],
      [[3,4],undefined,undefined,[0,3],[3,4]],
      [[1,2],undefined,undefined,[0,1],[1,2]]),
    row('boundaries','(?<=\\B('+e+'))\\B('+c+')',upper,[C,EC,C],
      [[2,5],[0,2],[2,5]],[[1,2],[0,1],[1,2]]),
    row('malformed-decoder-excluded','(?<=.)('+c+')',malformed,[C,C],
      [[1,4],[1,4]],[[1,2],[1,2]],'stock'),
    row('decoder-outside-excluded','(?<='+e+')([^a])',upper,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]],'stock'),
    row('forward-dispatch-inside-excluded','(?<=[^a'+r+'])('+c+')',ec,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]],'stock'),
    row('forward-dispatch-outside-excluded','(?<='+e+')([^a'+r+'])',upper,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]],'stock'),
    row('backref-excluded','(?<=('+e+')\\1)('+c+')',join(double,C),[C,EC,C],
      [[4,7],[2,4],[4,7]],[[2,3],[1,2],[2,3]],'stock'),
    row('local-disable-excluded','(?-i:(?<='+e+')('+c+'))',ec,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]],'stock'),
    row('local-s-decoder-excluded','(?s:(?<=.)('+c+'))',upper,[C,C],
      [[2,5],[2,5]],[[1,2],[1,2]],'stock'),
    row('migration-forward-with-behind','^(?=(?<=^)('+e+'))('+e+')$',EC,[EC,EC,EC],
      [[0,2],[0,2],[0,2]],[[0,1],[0,1],[0,1]]),
    row('nested-negative-backward','(?<!(?<!'+e+')'+c+')(!)',join(upper,bang),[bang,bang],
      [[5,6],[5,6]],[[2,3],[2,3]]),
    row('nested-negative-forward','(?<!(?='+e+')'+e+')(!)',join(EC,bang),null)
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
  function makeApi(source, flags, slow, local) {
    if(local) {source='(?i:'+source+')';flags=flags.replace('i','');}
    const wrap = re => {
      let calls=0;
      re.exec=function(subject) {
        if(++calls>64) throw Error('FOLDED_LOOKBEHINDS_BOUNDED_EXEC');
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
  const subject=join(EC,C,E),data=selected(subject),input=string(subject);
  for(const grammar of ['', 'u', 'v']) {
    const apiRows=[
      ['positive','((?<='+e+'))',byte?[[2,2],[7,7]]:[[1,1],[3,3]]],
      ['negative','((?<!'+e+'))',byte?[[0,0],[5,5]]:[[0,0],[2,2]]],
      ['interior','((?<!^)(?<!$))',byte?[[2,2],[5,5]]:[[1,1],[2,2]]],
      ['consuming','(?<='+e+')('+c+')',byte?[[2,5]]:[[1,2]]],
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
            if(calls.length>16) throw Error('FOLDED_LOOKBEHINDS_BOUNDED_CALLBACK');
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
  equal('fixed-case-count',cases,1050);
  equal('fixed-check-count',checks+1,9368);
  emit(encode({kind:'folded-lookbehinds-profile',profile,actualWidth:width}));
  emit(encode({kind:'folded-lookbehinds',profile,
    cases,checks,expectedCases:1050,expectedChecks:9368,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('FOLDED_LOOKBEHINDS_ORACLE: '+failureCount);
})();
