// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {Protocol} = InspectorTest.start('Unicode breakpoint hint coordinates');
const text = String.fromCodePoint(0xe9, 0x4e2d, 0x1f600);
function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(JSON.stringify({actual, expected}));
}
(async function() {
  await Protocol.Debugger.enable();
  const setups = [
    ['', "const value = '" + text + "'; target();", '\n'],
    ['//' + String.fromCodePoint(0xe9).repeat(500) + '\n', 'target();', '\n'],
    ['', "const value = '" + text + "'; target();", "const other = '" + text + "'; "]
  ];
  for (let i = 0; i < setups.length; ++i) {
    const [prefix, statement, insertion] = setups[i];
    const url = 'hint-' + text + '-' + i + '.js';
    const head = prefix + 'function container' + i + '() {\n';
    const source = head + statement + '\n}';
    const newSource = head + insertion + statement + '\n}';
    const targetLine = head.split('\n').length - 1;
    const targetColumn = statement.indexOf('target()');
    const parsed = Protocol.Debugger.onceScriptParsed();
    await Protocol.Runtime.evaluate({expression: source + '\n//# sourceURL=' + url});
    await parsed;
    const breakpoint = await Protocol.Debugger.setBreakpointByUrl({
      url, lineNumber: targetLine, columnNumber: targetColumn
    });
    const oldLocation = breakpoint.result.locations[0];
    equal([oldLocation.lineNumber, oldLocation.columnNumber], [targetLine, targetColumn]);
    const reparsed = Protocol.Debugger.onceScriptParsed();
    await Protocol.Runtime.evaluate({expression: newSource + '\n//# sourceURL=' + url});
    const resolved = (await reparsed).params.resolvedBreakpoints[0].location;
    const lines = newSource.split('\n');
    const newLine = lines.findIndex(line => line.includes('target()'));
    equal([resolved.lineNumber, resolved.columnNumber], [newLine, lines[newLine].indexOf('target()')]);
    await Protocol.Debugger.removeBreakpoint({breakpointId: breakpoint.result.breakpointId});
  }
  InspectorTest.log('PASS Unicode prefixes, search-window boundaries and moved hints');
  InspectorTest.completeTest();
})().catch(error => {
  InspectorTest.log('FAIL ' + error.stack);
  InspectorTest.completeTest();
});
