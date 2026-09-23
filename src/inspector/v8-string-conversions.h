// Copyright 2019 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef V8_INSPECTOR_V8_STRING_CONVERSIONS_H_
#define V8_INSPECTOR_V8_STRING_CONVERSIONS_H_


#include <cstdint>
#include <string>

// Legacy conversion helpers used by inspector_protocol's test platform.
// Inspector-owned protocol strings use String8 instead.
namespace v8_inspector {
std::basic_string<char16_t> UTF8ToUTF16(const char* stringStart, size_t length);
std::string UTF16ToUTF8(const char16_t* stringStart, size_t length);
}  // namespace v8_inspector

#endif  // V8_INSPECTOR_V8_STRING_CONVERSIONS_H_
