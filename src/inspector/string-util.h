// Copyright 2016 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef V8_INSPECTOR_STRING_UTIL_H_
#define V8_INSPECTOR_STRING_UTIL_H_

#include <stdint.h>

#include <memory>
#include <optional>

#include "../../third_party/inspector_protocol/crdtp/protocol_core.h"
#include "include/v8-inspector.h"
#include "include/v8-memory-span.h"
#include "src/base/logging.h"
#include "src/base/macros.h"
#include "src/inspector/string-8.h"

namespace v8_inspector {

namespace protocol {

class Value;

using String = v8_inspector::String8;

class StringUtil {
 public:
  static String fromUTF8(const uint8_t* data, size_t length) {
    return String8::fromUTF8(reinterpret_cast<const char*>(data), length);
  }

  static String fromUTF16LE(const uint16_t* data, size_t length) {
    return String8::fromUTF16LE(reinterpret_cast<const uint8_t*>(data),
                                length * sizeof(uint16_t));
  }

  static const uint8_t* CharactersLatin1(const String& s) { return nullptr; }
  static const uint8_t* CharactersUTF8(const String& s) {
    return s.characters8();
  }
  static const uint16_t* CharactersUTF16(const String& s) { return nullptr; }
  static size_t CharacterCount(const String& s) { return s.length(); }
};

// A read-only sequence of uninterpreted bytes with reference-counted storage.
class V8_EXPORT Binary {
 public:
  Binary() : bytes_(std::make_shared<std::vector<uint8_t>>()) {}

  const uint8_t* data() const { return bytes_->data(); }
  size_t size() const { return bytes_->size(); }
  String toBase64() const;
  static Binary fromBase64(const String& base64, bool* success);
  static Binary fromSpan(v8_crdtp::span<uint8_t> span) {
    return fromSpan(v8::MemorySpan<const uint8_t>(span.begin(), span.size()));
  }
  static Binary fromSpan(v8::MemorySpan<const uint8_t> span) {
    return Binary(
        std::make_shared<std::vector<uint8_t>>(span.begin(), span.end()));
  }

 private:
  std::shared_ptr<std::vector<uint8_t>> bytes_;

  explicit Binary(std::shared_ptr<std::vector<uint8_t>> bytes)
      : bytes_(bytes) {}
};
}  // namespace protocol

v8::Local<v8::String> toV8String(v8::Isolate*, const String8&);
v8::Local<v8::String> toV8StringInternalized(v8::Isolate*, const String8&);
v8::Local<v8::String> toV8StringInternalized(v8::Isolate*, const char*);
v8::Local<v8::String> toV8String(v8::Isolate*, const StringView&);
String8 toProtocolString(v8::Isolate*, v8::Local<v8::String>);
String8 toProtocolString(v8::Isolate*, v8::Local<v8::String>, size_t, size_t);
String8 toProtocolStringWithTypeCheck(v8::Isolate*, v8::Local<v8::Value>);
V8_EXPORT_PRIVATE String8 toString8(const StringView&);
bool usesByteStringSemantics(v8::Isolate*);
size_t engineStringLength(v8::Isolate*, const String8&);
size_t protocolByteOffset(v8::Isolate*, const String8&, size_t engine_offset);

// A scoped legacy API adapter, not an alternate protocol string representation.
class ScopedStringView {
 public:
  explicit ScopedStringView(const String8& string) : units_(string.toUTF16()) {}
  StringView view() const& { return StringView(units_.data(), units_.size()); }
  StringView view() const&& = delete;

 private:
  std::vector<uint16_t> units_;
};

template <size_t N>
StringView toStringView(const char (&str)[N]) {
  return StringView(reinterpret_cast<const uint8_t*>(str), N - 1);
}
bool stringViewStartsWith(const StringView&, const char*);

// Creates an owned legacy UTF-16 API result from internal protocol bytes.
std::unique_ptr<StringBuffer> StringBufferFrom(String8 str);

// Creates a string buffer instance which owns |str|, an 8 bit string.
// 8 bit strings are used for LATIN1 text (which subsumes 7 bit ASCII, e.g.
// our generated JSON), as well as for CBOR encoded binary messages.
std::unique_ptr<StringBuffer> StringBufferFrom(std::vector<uint8_t> str);

String8 stackTraceIdToString(uintptr_t id);

}  // namespace v8_inspector

// See third_party/inspector_protocol/crdtp/serializer_traits.h.
namespace v8_crdtp {

template <>
struct ProtocolTypeTraits<v8_inspector::String8> {
  static bool Deserialize(DeserializerState* state,
                          v8_inspector::String8* value);
  static void Serialize(const v8_inspector::String8& value,
                        std::vector<uint8_t>* bytes);
};

template <>
struct ProtocolTypeTraits<v8_inspector::protocol::Binary> {
  static bool Deserialize(DeserializerState* state,
                          v8_inspector::protocol::Binary* value);
  static void Serialize(const v8_inspector::protocol::Binary& value,
                        std::vector<uint8_t>* bytes);
};

}  // namespace v8_crdtp

#endif  // V8_INSPECTOR_STRING_UTIL_H_
