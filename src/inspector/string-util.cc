// Copyright 2016 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/inspector/string-util.h"

#include <cinttypes>
#include <cmath>
#include <cstddef>

#include "src/base/platform/platform.h"
#include "src/inspector/protocol/Protocol.h"
#include "src/numbers/conversions.h"

namespace v8_inspector {

namespace protocol {
namespace {
std::pair<uint8_t, uint8_t> SplitByte(uint8_t byte, uint8_t split) {
  return {byte >> split, (byte & ((1 << split) - 1)) << (6 - split)};
}

v8::Maybe<uint8_t> DecodeByte(char byte) {
  if ('A' <= byte && byte <= 'Z') return v8::Just<uint8_t>(byte - 'A');
  if ('a' <= byte && byte <= 'z') return v8::Just<uint8_t>(byte - 'a' + 26);
  if ('0' <= byte && byte <= '9')
    return v8::Just<uint8_t>(byte - '0' + 26 + 26);
  if (byte == '+') return v8::Just<uint8_t>(62);
  if (byte == '/') return v8::Just<uint8_t>(63);
  return v8::Nothing<uint8_t>();
}
}  // namespace

String Binary::toBase64() const {
  const char* table =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (size() == 0) return {};
  std::string result;
  result.reserve(4 * ((size() + 2) / 3));
  uint8_t last = 0;
  for (size_t n = 0; n < size();) {
    auto split = SplitByte((*bytes_)[n], 2 + 2 * (n % 3));
    result.push_back(table[split.first | last]);

    ++n;
    if (n < size() && n % 3 == 0) {
      result.push_back(table[split.second]);
      last = 0;
    } else {
      last = split.second;
    }
  }
  result.push_back(table[last]);
  while (result.size() % 4 > 0) result.push_back('=');
  return String8(std::move(result));
}

/* static */
Binary Binary::fromBase64(const String& base64, bool* success) {
  if (base64.isEmpty()) {
    *success = true;
    return {};
  }

  *success = false;
  // Fail if the length is invalid or decoding would overflow.
  if (base64.length() % 4 != 0 || base64.length() + 4 < base64.length()) {
    return {};
  }

  std::vector<uint8_t> result;
  result.reserve(3 * base64.length() / 4);
  char pad = '=';
  // Iterate groups of four
  for (size_t i = 0; i < base64.length(); i += 4) {
    uint8_t a = 0, b = 0, c = 0, d = 0;
    if (!DecodeByte(base64[i + 0]).To(&a)) return {};
    if (!DecodeByte(base64[i + 1]).To(&b)) return {};
    if (!DecodeByte(base64[i + 2]).To(&c)) {
      // Padding is allowed only in the group on the last two positions
      if (i + 4 < base64.length() || base64[i + 2] != pad ||
          base64[i + 3] != pad) {
        return {};
      }
    }
    if (!DecodeByte(base64[i + 3]).To(&d)) {
      // Padding is allowed only in the group on the last two positions
      if (i + 4 < base64.length() || base64[i + 3] != pad) {
        return {};
      }
    }

    result.push_back((a << 2) | (b >> 4));
    if (base64[i + 2] != '=') result.push_back((0xFF & (b << 4)) | (c >> 2));
    if (base64[i + 3] != '=') result.push_back((0xFF & (c << 6)) | d);
  }
  *success = true;
  return Binary(std::make_shared<std::vector<uint8_t>>(std::move(result)));
}
}  // namespace protocol

bool usesByteStringSemantics(v8::Isolate* isolate) {
  v8::String::ValueView view(isolate, v8::String::Empty(isolate));
  return view.uses_utf8_semantics();
}

size_t engineStringLength(v8::Isolate* isolate, const String8& string) {
  return usesByteStringSemantics(isolate) ? string.length()
                                          : string.utf16Length();
}

size_t protocolByteOffset(v8::Isolate* isolate, const String8& string,
                          size_t engine_offset) {
  return usesByteStringSemantics(isolate)
             ? std::min(engine_offset, string.length())
             : string.byteOffsetForUTF16(engine_offset);
}

namespace {
v8::Local<v8::String> protocolToV8String(v8::Isolate* isolate,
                                         const String8& string,
                                         v8::NewStringType type) {
  if (string.isEmpty()) return v8::String::Empty(isolate);
  DCHECK_GT(v8::String::kMaxLength, string.length());
  if (usesByteStringSemantics(isolate)) {
    return v8::String::NewFromBytes(isolate, string.characters8(), type,
                                    static_cast<int>(string.length()))
        .ToLocalChecked();
  }
  // The stock engine accepts UTF-16, including isolated surrogate code units.
  auto units = string.toUTF16();
  return v8::String::NewFromTwoByte(isolate, units.data(), type,
                                    static_cast<int>(units.size()))
      .ToLocalChecked();
}
}  // namespace

v8::Local<v8::String> toV8String(v8::Isolate* isolate, const String8& string) {
  return protocolToV8String(isolate, string, v8::NewStringType::kNormal);
}

v8::Local<v8::String> toV8StringInternalized(v8::Isolate* isolate,
                                             const String8& string) {
  return protocolToV8String(isolate, string, v8::NewStringType::kInternalized);
}

v8::Local<v8::String> toV8StringInternalized(v8::Isolate* isolate,
                                             const char* str) {
  return v8::String::NewFromUtf8(isolate, str, v8::NewStringType::kInternalized)
      .ToLocalChecked();
}

v8::Local<v8::String> toV8String(v8::Isolate* isolate,
                                 const StringView& string) {
  if (!string.length()) return v8::String::Empty(isolate);
  DCHECK_GT(v8::String::kMaxLength, string.length());
  if (string.is8Bit())
    return v8::String::NewFromOneByte(isolate, string.characters8(),
                                      v8::NewStringType::kNormal,
                                      static_cast<int>(string.length()))
        .ToLocalChecked();
  return v8::String::NewFromTwoByte(
             isolate, reinterpret_cast<const uint16_t*>(string.characters16()),
             v8::NewStringType::kNormal, static_cast<int>(string.length()))
      .ToLocalChecked();
}

String8 toProtocolString(v8::Isolate* isolate, v8::Local<v8::String> value) {
  if (value.IsEmpty() || value->IsNullOrUndefined()) return String8();
  return toProtocolString(isolate, value, 0, value->Length());
}

String8 toProtocolString(v8::Isolate* isolate, v8::Local<v8::String> value,
                         size_t offset, size_t length) {
  v8::String::ValueView view(isolate, value);
  DCHECK_LE(offset, view.length());
  DCHECK_LE(length, view.length() - offset);
  if (!length) return String8();
  if (view.uses_utf8_semantics()) {
    return String8::fromUTF8Scalar(view.data8() + offset, length);
  }
  return view.is_one_byte()
             ? String8::fromLatin1(view.data8() + offset, length)
             : String8::fromUTF16(view.data16() + offset, length);
}

String8 toProtocolStringWithTypeCheck(v8::Isolate* isolate,
                                      v8::Local<v8::Value> value) {
  if (value.IsEmpty() || !value->IsString()) return String8();
  return toProtocolString(isolate, value.As<v8::String>());
}

String8 toString8(const StringView& string) {
  if (!string.length()) return String8();
  if (string.is8Bit())
    return String8::fromLatin1(string.characters8(), string.length());
  return String8::fromUTF16(string.characters16(), string.length());
}

bool stringViewStartsWith(const StringView& string, const char* prefix) {
  if (!string.length()) return !(*prefix);
  if (string.is8Bit()) {
    for (size_t i = 0, j = 0; prefix[j] && i < string.length(); ++i, ++j) {
      if (string.characters8()[i] != prefix[j]) return false;
    }
  } else {
    for (size_t i = 0, j = 0; prefix[j] && i < string.length(); ++i, ++j) {
      if (string.characters16()[i] != prefix[j]) return false;
    }
  }
  return true;
}

namespace {
// An empty string buffer doesn't own any string data; its ::string() returns a
// default-constructed StringView instance.
class EmptyStringBuffer : public StringBuffer {
 public:
  StringView string() const override { return StringView(); }
};

// Contains LATIN1 text data or CBOR encoded binary data in a vector.
class StringBuffer8 : public StringBuffer {
 public:
  explicit StringBuffer8(std::vector<uint8_t> data) : data_(std::move(data)) {}

  StringView string() const override {
    return StringView(data_.data(), data_.size());
  }

 private:
  std::vector<uint8_t> data_;
};

// Owns a legacy API result, never used as protocol storage.
class StringBuffer16 : public StringBuffer {
 public:
  explicit StringBuffer16(std::vector<uint16_t> data)
      : data_(std::move(data)) {}

  StringView string() const override {
    return StringView(data_.data(), data_.size());
  }

 private:
  std::vector<uint16_t> data_;
};
}  // namespace

// static
std::unique_ptr<StringBuffer> StringBuffer::create(StringView string) {
  if (string.length() == 0) return std::make_unique<EmptyStringBuffer>();
  if (string.is8Bit()) {
    return std::make_unique<StringBuffer8>(std::vector<uint8_t>(
        string.characters8(), string.characters8() + string.length()));
  }
  return std::make_unique<StringBuffer16>(std::vector<uint16_t>(
      string.characters16(), string.characters16() + string.length()));
}

std::unique_ptr<StringBuffer> StringBufferFrom(String8 str) {
  if (str.isEmpty()) return std::make_unique<EmptyStringBuffer>();
  return std::make_unique<StringBuffer16>(str.toUTF16());
}

std::unique_ptr<StringBuffer> StringBufferFrom(std::vector<uint8_t> str) {
  if (str.empty()) return std::make_unique<EmptyStringBuffer>();
  return std::make_unique<StringBuffer8>(std::move(str));
}

String8 stackTraceIdToString(uintptr_t id) {
  String8Builder builder;
  builder.appendNumber(static_cast<size_t>(id));
  return builder.toString();
}

}  // namespace v8_inspector

namespace v8_crdtp {

using v8_inspector::String8;
using v8_inspector::protocol::Binary;
using v8_inspector::protocol::StringUtil;

// static
bool ProtocolTypeTraits<String8>::Deserialize(DeserializerState* state,
                                              String8* value) {
  auto* tokenizer = state->tokenizer();
  if (tokenizer->TokenTag() == cbor::CBORTokenTag::STRING8) {
    const auto str = tokenizer->GetString8();
    *value = StringUtil::fromUTF8(str.data(), str.size());
    return true;
  }
  if (tokenizer->TokenTag() == cbor::CBORTokenTag::STRING16) {
    const auto str = tokenizer->GetString16WireRep();
    *value = StringUtil::fromUTF16LE(
        reinterpret_cast<const uint16_t*>(str.data()), str.size() / 2);
    return true;
  }
  state->RegisterError(Error::BINDINGS_STRING_VALUE_EXPECTED);
  return false;
}

// static
void ProtocolTypeTraits<String8>::Serialize(const String8& value,
                                            std::vector<uint8_t>* bytes) {
  cbor::EncodeString8(span<uint8_t>(value.characters8(), value.length()),
                      bytes);
}

// static
bool ProtocolTypeTraits<Binary>::Deserialize(DeserializerState* state,
                                             Binary* value) {
  auto* tokenizer = state->tokenizer();
  if (tokenizer->TokenTag() == cbor::CBORTokenTag::BINARY) {
    *value = Binary::fromSpan(tokenizer->GetBinary());
    return true;
  }
  if (tokenizer->TokenTag() == cbor::CBORTokenTag::STRING8) {
    const auto str_span = tokenizer->GetString8();
    auto str = StringUtil::fromUTF8(str_span.data(), str_span.size());
    bool success = false;
    *value = Binary::fromBase64(str, &success);
    return success;
  }
  state->RegisterError(Error::BINDINGS_BINARY_VALUE_EXPECTED);
  return false;
}

// static
void ProtocolTypeTraits<Binary>::Serialize(const Binary& value,
                                           std::vector<uint8_t>* bytes) {
  cbor::EncodeBinary(span<uint8_t>(value.data(), value.size()), bytes);
}

}  // namespace v8_crdtp
