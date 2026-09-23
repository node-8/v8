// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// The external runner must check the actual profile, not just a flag spelling.
const {Protocol} = InspectorTest.start('Inspector profile identity');
InspectorTest.log('frontend: ' + String.fromCodePoint(233).length);
Protocol.Runtime.evaluate({expression: 'String.fromCodePoint(233).length'})
    .then(response => {
      InspectorTest.log('backend: ' + response.result.result.value);
      InspectorTest.completeTest();
    });
