// Copyright 2016 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef V8_INSPECTOR_SEARCH_UTIL_H_
#define V8_INSPECTOR_SEARCH_UTIL_H_

#include <memory>

#include "src/inspector/protocol/Debugger.h"
#include "src/inspector/string-util.h"

namespace v8_inspector {

class V8InspectorImpl;

String8 findSourceURL(const String8& content, bool multiline);
String8 findSourceMapURL(const String8& content, bool multiline);
String8 findDebugId(const String8& content, bool multiline);
std::vector<std::unique_ptr<protocol::Debugger::SearchMatch>>
searchInTextByLinesImpl(V8InspectorImpl*, const String8& text,
                        const String8& query, bool caseSensitive, bool isRegex);

}  // namespace v8_inspector

#endif  // V8_INSPECTOR_SEARCH_UTIL_H_
