// Copyright 2020 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "test/inspector/utils.h"

#include <vector>

#include "include/v8-inspector.h"
#include "include/v8-primitive.h"
#include "src/strings/unicode-decoder.h"

namespace v8 {
namespace internal {

std::vector<uint8_t> ToBytes(v8::Isolate* isolate, v8::Local<v8::String> str) {
  uint32_t length = str->Length();
  std::vector<uint8_t> buffer(length);
  str->WriteOneByteV2(isolate, 0, length, buffer.data());
  return buffer;
}

v8::Local<v8::String> ToV8String(v8::Isolate* isolate, const char* str) {
  return v8::String::NewFromUtf8(isolate, str).ToLocalChecked();
}

v8::Local<v8::String> ToV8String(v8::Isolate* isolate,
                                 const std::vector<uint8_t>& bytes) {
  // This overload transports opaque session-state bytes, not Latin-1 text.
  if (v8::String::ValueView(isolate, v8::String::Empty(isolate))
          .uses_utf8_semantics()) {
    return v8::String::NewFromBytes(isolate, bytes.data(),
                                    v8::NewStringType::kNormal,
                                    static_cast<int>(bytes.size()))
        .ToLocalChecked();
  }
  return v8::String::NewFromOneByte(isolate, bytes.data(),
                                    v8::NewStringType::kNormal,
                                    static_cast<int>(bytes.size()))
      .ToLocalChecked();
}

v8::Local<v8::String> ToV8String(v8::Isolate* isolate,
                                 const std::string& buffer) {
  int length = static_cast<int>(buffer.size());
  return v8::String::NewFromUtf8(isolate, buffer.data(),
                                 v8::NewStringType::kNormal, length)
      .ToLocalChecked();
}

v8::Local<v8::String> ToV8String(v8::Isolate* isolate,
                                 const std::vector<uint16_t>& buffer) {
  int length = static_cast<int>(buffer.size());
  return v8::String::NewFromTwoByte(isolate, buffer.data(),
                                    v8::NewStringType::kNormal, length)
      .ToLocalChecked();
}

v8::Local<v8::String> ToV8String(v8::Isolate* isolate,
                                 const v8_inspector::StringView& string) {
  if (string.is8Bit()) {
    return v8::String::NewFromOneByte(isolate, string.characters8(),
                                      v8::NewStringType::kNormal,
                                      static_cast<int>(string.length()))
        .ToLocalChecked();
  }
  return v8::String::NewFromTwoByte(isolate, string.characters16(),
                                    v8::NewStringType::kNormal,
                                    static_cast<int>(string.length()))
      .ToLocalChecked();
}

std::vector<uint16_t> ToVector(v8::Isolate* isolate,
                               v8::Local<v8::String> str) {
  // This is a legacy UTF-16 API boundary, not a raw-byte widening operation.
  v8::String::ValueView view(isolate, str);
  if (view.uses_utf8_semantics()) {
    Wtf8ByteCursor cursor({view.data8(), view.length()},
                          Wtf8ByteCursor::Policy::kWebScalar);
    std::vector<uint16_t> buffer;
    buffer.reserve(view.length());
    while (cursor.has_next()) {
      uint32_t point = cursor.DecodeNext().code_point;
      if (point <= 0xffff) {
        buffer.push_back(static_cast<uint16_t>(point));
      } else {
        buffer.push_back(unibrow::Utf16::LeadSurrogate(point));
        buffer.push_back(unibrow::Utf16::TrailSurrogate(point));
      }
    }
    return buffer;
  }
  uint32_t length = str->Length();
  std::vector<uint16_t> buffer(length);
  str->WriteV2(isolate, 0, length, buffer.data());
  return buffer;
}

}  // namespace internal
}  // namespace v8
