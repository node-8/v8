// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {session, Protocol} = InspectorTest.start('Inspector byte-backed Unicode output');
const byteMode = String.fromCodePoint(0xe9).length === 2;
let checks = 0;
function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(label + ': ' + JSON.stringify({actual, expected}));
  }
  ++checks;
}
function remote(response) {
  if (response.error || response.result.exceptionDetails) {
    throw new Error(JSON.stringify(response));
  }
  return response.result.result;
}

(async function() {
  await Protocol.Runtime.enable();
  await Protocol.Debugger.enable();
  const cases = [[], [65, 90], [0xe9], [0x4e2d, 0x6587], [0x1f600],
                 [101, 0x301], [0xe9, 0x4e2d, 0x1f600], [65, 0, 90]];
  for (const points of cases) {
    const expression = 'String.fromCodePoint(' + points.join(',') + ')';
    const expected = String.fromCodePoint(...points);
    equal(remote(await Protocol.Runtime.evaluate({expression})).value,
          expected, 'value');
    // Also exercise incoming non-ASCII JSON and a direct property-name path.
    equal(remote(await Protocol.Runtime.evaluate({
      expression: JSON.stringify(expected)
    })).value, expected, 'input/output');
    const object = remote(await Protocol.Runtime.evaluate({
      expression: '({[' + expression + ']:' + expression + '})',
      generatePreview: true
    }));
    equal(object.preview.properties[0].name, expected, 'preview name');
    equal(object.preview.properties[0].value, expected, 'preview value');
    const properties = await Protocol.Runtime.getProperties({
      objectId: object.objectId, ownProperties: true
    });
    equal(properties.result.result[0].name, expected, 'property name');
    equal(properties.result.result[0].value.value, expected, 'property value');
    equal(remote(await Protocol.Runtime.callFunctionOn({
      objectId: object.objectId,
      functionDeclaration: 'function() { return Object.keys(this)[0]; }'
    })).value, expected, 'call result');
  }

  const text = String.fromCodePoint(0xe9, 0x4e2d, 0x1f600);
  const consoleEvent = Protocol.Runtime.onceConsoleAPICalled();
  await Protocol.Runtime.evaluate({expression: 'console.log(' + JSON.stringify(text) + ')'});
  equal((await consoleEvent).params.args[0].value, text, 'console');
  const exception = await Protocol.Runtime.evaluate({
    expression: 'throw new Error(' + JSON.stringify(text) + ')'
  });
  equal(exception.result.exceptionDetails.exception.description.includes(text),
        true, 'exception description');

  const source = 'globalThis.unicode = ' + JSON.stringify(text) + ';\n// ' + text;
  const url = 'test-' + text + '.js';
  const parsed = Protocol.Debugger.onceScriptParsed();
  const compiled = await Protocol.Runtime.compileScript({
    expression: source, sourceURL: url, persistScript: true
  });
  equal((await parsed).params.url, url, 'script URL');
  const scriptId = compiled.result.scriptId;
  equal((await Protocol.Debugger.getScriptSource({scriptId})).result.scriptSource,
        source, 'script source');
  const found = await Protocol.Debugger.searchInContent({scriptId, query: text});
  equal(found.result.result.length, 2, 'source search count');
  equal(found.result.result[1].lineContent, '// ' + text, 'source search text');

  for (const unit of [0xd800, 0xdc00]) {
    const expression = 'String.fromCodePoint(' + unit + ')';
    equal(remote(await Protocol.Runtime.evaluate({expression})).value,
          String.fromCodePoint(byteMode ? 0xfffd : unit), 'surrogate boundary');
  }
  if (byteMode) {
    const malformed = [
      ["'\\xff'", '\ufffd'],
      ["'\\xe2\\x82'", '\ufffd'],
      ["'\\xe2\\x82x'", '\ufffdx'],
      ["'\\x80\\xbf'", '\ufffd\ufffd'],
      ["'\\xed\\xa0\\x80'", '\ufffd']
    ];
    for (const [expression, expected] of malformed) {
      equal(remote(await Protocol.Runtime.evaluate({expression})).value,
            expected, 'malformed boundary');
    }
    equal(remote(await Protocol.Runtime.evaluate({
      expression: "'\\xe2\\x82x'.length"
    })).value, 3, 'raw input unchanged');
  }

  const long = text.repeat(60);
  const preview = remote(await Protocol.Runtime.evaluate({
    expression: '({value:' + JSON.stringify(long) + '})', generatePreview: true
  })).preview.properties[0].value;
  equal(preview.includes('\ufffd'), false, 'preview sequence boundary');
  equal(preview.includes('\u2026'), true, 'preview ellipsis');
  session.reconnect();
  equal(remote(await Protocol.Runtime.evaluate({expression: JSON.stringify(text)})).value,
        text, 'reconnect output');
  InspectorTest.log('PASS Unicode values, properties, previews, console, errors, source and reconnect');
  InspectorTest.log('PASS surrogate and malformed boundaries');
  InspectorTest.completeTest();
})().catch(error => {
  InspectorTest.log('FAIL after ' + checks + ' checks: ' + error.stack);
  InspectorTest.completeTest();
});
