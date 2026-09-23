// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Fixed oracles. Intended profile is checked by the driver.
// Scope: UTF-8 multiline anchors with fixed stock and byte oracles.
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
  const row = (id, source, subject, values, bytes, stock,
               condition = 'all', extraFlags = 'm', start = 0, names) =>
    ({id,source,subject,values,bytes,stock,condition,extraFlags,start,names});
  const raw = bytes => fixture(bytes,bytes);
  const separators = [
    ['lf',ascii('\n'),true], ['cr',ascii('\r'),true],
    ['ls',LS,true], ['ps',PS,true], ['crlf',ascii('\r\n'),true],
    ['nel',fixture([0xc2,0x85],[0x85]),false],
    ['vt',ascii('\v'),false], ['ff',ascii('\f'),false],
    ['raw-a8',raw([0xa8]),false], ['raw-a9',raw([0xa9]),false],
    ['truncated-lead',raw([0xe2]),false],
    ['truncated-prefix',raw([0xe2,0x80]),false],
    ['missing-lead',raw([0x80,0xa8]),false],
    ['wrong-middle',raw([0xe2,0x81,0xa8]),false],
    ['wrong-lead',raw([0xc2,0x80,0xa8]),false],
    ['wrong-tail',raw([0xe2,0x80,0xaa]),false],
  ];
  const rows = [];
  for (const [label,sep,newline] of separators) {
    const b = sep.bytes.length, s = sep.stock.length;
    for (const fold of [false,true]) {
      const flags = 'm' + (fold ? 'i' : '');
      for (const [kind,pattern,part] of [
        ['ascii','a',ascii(fold?'A':'a')], ['unicode',string(E),fold?EC:E],
      ]) {
        const w = part.bytes.length, t = part.stock.length;
        rows.push(
          row(label+kind+fold+'start','^('+pattern+')',join(sep,part),
            newline?[part,part]:null,[[b,b+w],[b,b+w]],[[s,s+t],[s,s+t]],'all',flags),
          row(label+kind+fold+'end','('+pattern+')$',join(part,sep),
            newline?[part,part]:null,[[0,w],[0,w]],[[0,t],[0,t]],'all',flags),
          row(label+kind+fold+'line','^(?<line>'+pattern+')$',join(sep,part,sep),
            newline?[part,part]:null,[[b,b+w],[b,b+w]],[[s,s+t],[s,s+t]],
            'all',flags,0,{line:1})
        );
      }
      rows.push(row(label+fold+'empty','^()$',sep,newline?[empty,empty]:null,
        [[0,0],[0,0]],[[0,0],[0,0]],'all',flags));
    }
    const subject = join(ascii('A'),sep,ascii('B'));
    const boundaries = length => newline ?
      (label==='crlf'?[0,1,2,3,4]:[0,1,1+length,2+length]) : [0,2+length];
    for (const flag of ['g','y']) {
      for (const [origin,bo,so] of [['before',1,1],['inside',2,1],['after',1+b,1+s]]) {
        const find = (length,at) => boundaries(length).find(pos => flag==='g'?pos>=at:pos===at);
        const bp=find(b,bo), sp=find(s,so), pos=byte?bp:sp;
        rows.push(row(label+flag+origin,'^|$',subject,pos===undefined?null:[empty],
          [[bp,bp]],[[sp,sp]],'all','m'+flag,byte?bo:so));
      }
    }
  }
  for (const fold of [false,true]) {
    const flags='m'+(fold?'i':''), part=fold?EC:E;
    const triple=join(part,part,part), input=join(LS,triple,PS);
    for (const quantifier of ['+','+?']) {
      rows.push(row('repeat'+fold+quantifier,'^(('+string(E)+')'+quantifier+')$',input,
        [triple,triple,part],[[3,9],[3,9],[7,9]],[[1,4],[1,4],[3,4]],'all',flags));
    }
    rows.push(
      row('nullable'+fold,'^(('+string(E)+')*)$',join(LS,PS),
        [empty,empty,undefined],[[0,0],[0,0],undefined],[[0,0],[0,0],undefined],'all',flags),
      row('branch'+fold,'^('+string(E)+'|a)$',join(LS,part,PS),
        [part,part],[[3,5],[3,5]],[[1,2],[1,2]],'all',flags)
    );
  }
  const longText=ascii('a'.repeat(32766));
  rows.push(row('maximum-deferred-offset','a'.repeat(32766)+'$',join(longText,LS),
    [longText],[[0,32766]],[[0,32766]]));
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
      let calls = 0;
      re.exec = function(subject) {
        if (++calls > 64) throw Error('MULTILINE_BOUNDED_EXEC');
        return intrinsicExec.call(this, subject);
      };
      return re;
    };
    if (!slow) return new RegExp(source, flags);
    const re = wrap(new RegExp(source, flags));
    re.constructor = {[Symbol.species]: function(source, nextFlags) {
      return wrap(new RegExp(source, nextFlags));
    }};
    return re;
  }
  const compact = match => [Array.from(match,units),match.index,Array.from(match.indices)];
  function boundedAll(input,re) {
    const iterator=input.matchAll(re), output=[];
    for(let i=0;i<32;++i) {
      const next=iterator.next();
      if(next.done) return [output,true];
      output.push(compact(next.value));
    }
    return [output,false];
  }
  for (const [label,sep,newline] of separators.slice(0,6)) {
    const subject=join(ascii('A'),sep,ascii('B'));
    const b=sep.bytes.length, s=sep.stock.length;
    const positions=byte ?
      (newline?(label==='crlf'?[0,1,2,3,4]:[0,1,1+b,2+b]):[0,2+b]) :
      (newline?(label==='crlf'?[0,1,2,3,4]:[0,1,1+s,2+s]):[0,2+s]);
    const pieces=newline ?
      (label==='crlf'?[ascii('A'),ascii('\r'),ascii('\n'),ascii('B')]:
        [ascii('A'),sep,ascii('B')]) : [subject];
    const replacement=join(ascii('<>'),...pieces.flatMap(p=>[p,ascii('<>')]));
    const splitPieces=pieces.flatMap((p,i)=>i===0?[p]:[empty,p]);
    const expectedMatches=positions.map(at=>[[[],[]],at,[[at,at],[at,at]]]);
    for(const fold of [false,true]) for(const slow of [false,true]) {
      for(const grammar of ['', 'u', 'v']) {
        ++apiCases;
        const tag='api-'+label+fold+slow+grammar;
        const flags='m'+(fold?'i':'')+grammar, input=string(subject);
        for(let repeat=0;repeat<2;++repeat) {
          const re=makeApi('(^|$)','dg'+flags,slow);
          equal(tag+'match',input.match(re)?.map(units)??null,positions.map(()=>[]),tag);
          equal(tag+'reset',re.lastIndex,0,tag);
          equal(tag+'replace',units(input.replace(re,'<$1>')),selected(replacement),tag);
          const calls=[];
          equal(tag+'callback-result',units(input.replace(re,(m,capture,offset,original)=>{
            if(calls.length>16) throw Error('MULTILINE_BOUNDED_CALLBACK');
            calls.push([units(m),units(capture),offset,units(original)]);
            return '<'+capture+'>';
          })),selected(replacement),tag);
          equal(tag+'callback',calls,positions.map(at=>[[],[],at,selected(subject)]),tag);
          equal(tag+'all',boundedAll(input,re),[expectedMatches,true],tag);
          equal(tag+'preserves',re.lastIndex,0,tag);
          equal(tag+'split',input.split(makeApi('(^|$)',flags,slow)).map(units),splitPieces.map(selected),tag);
          re.lastIndex=positions[1];
          const direct=re.exec(input), at=positions[1];
          equal(tag+'direct',direct===null?null:compact(direct),[[[],[]],at,[[at,at],[at,at]]],tag);
          equal(tag+'no-advance',re.lastIndex,at,tag);
        }
      }
    }
  }
  equal('fixed-api-cases',apiCases,72);
  equal('fixed-api-checks',checks-apiStart+1,1442);
  equal('fixed-case-count',cases,1974);
  equal('fixed-check-count',checks+1,17240);
  emit(encode({kind:'multiline-byte-anchors-profile',profile,actualWidth:width}));
  emit(encode({kind:'multiline-byte-anchors',profile,
    cases,checks,expectedCases:1974,expectedChecks:17240,
    passed:failureCount===0,failureCount,failedCases:Array.from(failedCases),failures,
    failureDetailsTruncated:failureCount>failures.length,performanceTested:false}));
  if(failureCount!==0) throw Error('MULTILINE_ORACLE: '+failureCount);
})();
