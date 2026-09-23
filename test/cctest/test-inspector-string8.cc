// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "include/v8-external.h"
#include "include/v8-function.h"
#include "src/inspector/protocol/Protocol.h"
#include "src/inspector/string-8.h"
#include "src/inspector/string-util.h"
#include "src/inspector/v8-inspector-impl.h"
#include "src/inspector/v8-regex.h"
#include "test/cctest/cctest.h"
#include "third_party/inspector_protocol/crdtp/json.h"

namespace {

using v8_inspector::String8;
using v8_inspector::String8Builder;

void CheckBytes(const String8& actual, std::string_view expected) {
  CHECK_EQ(actual.utf8(), std::string(expected));
}

TEST(InspectorString8StockMode) {
  LocalContext context;
  v8::HandleScope scope(context.isolate());
  CHECK(!v8_inspector::usesByteStringSemantics(context.isolate()));
  CHECK_EQ(CompileRun("String.fromCodePoint(233).length")
               ->Int32Value(context.local()).FromJust(), 1);
}

TEST(InspectorString8ByteMode) {
  LocalContext context;
  v8::HandleScope scope(context.isolate());
  CHECK(v8_inspector::usesByteStringSemantics(context.isolate()));
  CHECK_EQ(CompileRun("String.fromCodePoint(233).length")
               ->Int32Value(context.local()).FromJust(), 2);
}

UNINITIALIZED_TEST(InspectorString8RawBytes) {
  std::string bytes;
  for (int i = 0; i < 256; ++i) bytes.push_back(static_cast<char>(i));
  String8 value(bytes);
  CheckBytes(value, bytes);
  for (size_t i = 0; i < 256; ++i) CHECK_EQ(value[i], i);
  String8Builder builder;
  for (size_t i = 0; i < 256; ++i) builder.append(value[i]);
  CHECK(value == builder.toString());
  CHECK(String8::fromUTF8(nullptr, 0).isEmpty());
  CHECK(String8::fromUTF8Scalar(nullptr, 0).isEmpty());
}

UNINITIALIZED_TEST(InspectorString8ByteCoordinates) {
  const String8 value("a\xc3\xa9\xe4\xb8\xad\xf0\x9f\x98\x80z");
  CHECK_EQ(value.length(), 11);
  CHECK_EQ(value.find(String8("\xe4\xb8\xad")), 3);
  CHECK_EQ(value.reverseFind(static_cast<uint8_t>('z')), 10);
  CheckBytes(value.substring(3, 3), "\xe4\xb8\xad");
  for (size_t i = 0; i <= value.length(); ++i) {
    CHECK(value.substring(0, i) + value.substring(i) == value);
  }
  CheckBytes(value.substring(7, 2), "\x9f\x98");
  CHECK_EQ(value.find("missing"), String8::kNotFound);
}

UNINITIALIZED_TEST(InspectorString8HashMutation) {
  String8 value("hello");
  size_t original_hash = value.hash();
  value += String8("\xc3\xa9");
  CHECK_EQ(value.hash(), String8("hello\xc3\xa9").hash());
  CHECK_NE(value.hash(), original_hash);
  String8 copy = value;
  CHECK_EQ(copy.hash(), value.hash());
  String8 moved(std::move(copy));
  CHECK_EQ(moved.hash(), value.hash());
  CHECK_EQ(copy.hash(), String8(copy.utf8()).hash());
  String8 assigned("other");
  assigned.hash();
  assigned = std::move(moved);
  CHECK_EQ(assigned.hash(), value.hash());
  CHECK_EQ(moved.hash(), String8(moved.utf8()).hash());
  String8 other("different");
  other.hash();
  assigned.swap(other);
  CHECK_EQ(assigned.hash(), String8("different").hash());
  CHECK_EQ(other.hash(), value.hash());
  other += other;
  CHECK_EQ(other.hash(), (value + value).hash());
}

UNINITIALIZED_TEST(InspectorString8LegacyEncodings) {
  const uint8_t latin1[] = {0, 0x41, 0x80, 0xe9, 0xff};
  const uint16_t utf16[] = {0, 0x41, 0x80, 0xe9, 0xff};
  String8 value = String8::fromLatin1(latin1, 5);
  CHECK(value == String8::fromUTF16(utf16, 5));
  CHECK(value.toUTF16() == std::vector<uint16_t>(utf16, utf16 + 5));
  const uint16_t complex[] = {0xd800, 'x', 0xd83d, 0xde00, 0xdc00};
  value = String8::fromUTF16(complex, 5);
  CheckBytes(value, "\xed\xa0\x80x\xf0\x9f\x98\x80\xed\xb0\x80");
  CHECK(value.toUTF16() == std::vector<uint16_t>(complex, complex + 5));
  const uint8_t little_endian[] = {0x00, 0xd8, 0x78, 0,    0x3d,
                                   0xd8, 0x00, 0xde, 0x00, 0xdc};
  CHECK(String8::fromUTF16LE(little_endian, sizeof(little_endian)) == value);
}

UNINITIALIZED_TEST(InspectorString8ScalarBoundary) {
  const std::pair<std::string, std::string> cases[] = {
      {"\xc3\xa9\xe4\xb8\xad\xf0\x9f\x98\x80",
       "\xc3\xa9\xe4\xb8\xad\xf0\x9f\x98\x80"},
      {"\xe2\x82", "\xef\xbf\xbd"},
      {"\xe2\x82x", "\xef\xbf\xbdx"},
      {"\x80\xbf", "\xef\xbf\xbd\xef\xbf\xbd"},
      {"\xed\xa0\x80", "\xef\xbf\xbd"},
      {"\xed\xa0\x80\xed\xb0\x80", "\xef\xbf\xbd\xef\xbf\xbd"},
      {std::string("a\0\xffz", 4), std::string("a\0\xef\xbf\xbdz", 6)},
  };
  for (const auto& [input, expected] : cases) {
    String8 raw(input);
    CheckBytes(String8::fromUTF8Scalar(raw.characters8(), raw.length()),
               expected);
    CheckBytes(raw, input);
  }
}

UNINITIALIZED_TEST(InspectorString8Formatting) {
  CheckBytes(String8::fromInteger(-42), "-42");
  CheckBytes(String8::fromInteger(static_cast<size_t>(42)), "42");
  CheckBytes(String8::fromInteger64(INT64_MIN), "-9223372036854775808");
  CheckBytes(String8::fromDouble(1.5), "1.5");
  CheckBytes(String8::fromDouble(1.5, 3), "1.50");
  String8Builder builder;
  builder.appendUnsignedAsHex(static_cast<uint8_t>(0xaf));
  builder.appendUnsignedAsHex(static_cast<uint32_t>(0x123));
  builder.appendUnsignedAsHex(static_cast<uint64_t>(0x123));
  CheckBytes(builder.toString(), "af000001230000000000000123");
  bool ok;
  CHECK_EQ(String8(" +42").toInteger(&ok), 42);
  CHECK(ok);
  String8("42x").toInteger(&ok);
  CHECK(!ok);
  String8("2147483648").toInteger(&ok);
  CHECK(!ok);
  String8("\xc3\xa9").toInteger(&ok);
  CHECK(!ok);
  CheckBytes(String8(" \t\nhello\r\f ").stripWhiteSpace(), "hello");
  CHECK(String8(" \r\n ").stripWhiteSpace().isEmpty());
  CheckBytes(String8::concat("a", String8("\xc3\xa9"), 'z'), "a\xc3\xa9z");
}

UNINITIALIZED_TEST(InspectorString8Wire) {
  using v8_inspector::protocol::Binary;
  std::vector<uint8_t> data;
  for (int i = 0; i < 256; ++i) data.push_back(static_cast<uint8_t>(i));
  auto binary = Binary::fromSpan(v8_crdtp::SpanFrom(data));
  bool ok;
  auto roundtrip = Binary::fromBase64(binary.toBase64(), &ok);
  CHECK(ok);
  CHECK_EQ(roundtrip.size(), data.size());
  CHECK_EQ(memcmp(roundtrip.data(), data.data(), data.size()), 0);
  Binary::fromBase64("AA=A", &ok);
  CHECK(!ok);
  const String8 values[] = {"", "ascii", "\xc3\xa9\xe4\xb8\xad\xf0\x9f\x98\x80",
                            "\xed\xa0\x80", String8("a\0z", 3)};
  for (const String8& value : values) {
    std::vector<uint8_t> bytes;
    v8_crdtp::ProtocolTypeTraits<String8>::Serialize(value, &bytes);
    v8_crdtp::cbor::CBORTokenizer tokenizer(v8_crdtp::SpanFrom(bytes));
    CHECK_EQ(tokenizer.TokenTag(), v8_crdtp::cbor::CBORTokenTag::STRING8);
    auto wire = tokenizer.GetString8();
    CheckBytes(String8::fromUTF8(reinterpret_cast<const char*>(wire.data()),
                                 wire.size()),
               value.utf8());
    auto encoded =
        v8_inspector::protocol::StringValue::create(value)->Serialize();
    auto parsed = v8_inspector::protocol::Value::parseBinary(encoded.data(),
                                                             encoded.size());
    String8 decoded;
    CHECK(parsed->asString(&decoded));
    CHECK(value == decoded);
  }
  auto encoded =
      v8_inspector::protocol::StringValue::create("\xed\xa0\x80")->Serialize();
  std::vector<uint8_t> json;
  CHECK(v8_crdtp::json::ConvertCBORToJSON(v8_crdtp::SpanFrom(encoded), &json)
            .ok());
  CheckBytes(String8(reinterpret_cast<const char*>(json.data()), json.size()),
             "\"\\ud800\"");
  const uint16_t units[] = {0x4e2d, 0xd800};
  encoded.clear();
  v8_crdtp::cbor::EncodeFromUTF16(v8_crdtp::span<uint16_t>(units, 2), &encoded);
  auto parsed = v8_inspector::protocol::Value::parseBinary(encoded.data(),
                                                           encoded.size());
  String8 decoded;
  CHECK(parsed->asString(&decoded));
  CHECK(decoded == String8::fromUTF16(units, 2));
}

TEST(InspectorString8EngineBoundaries) {
  LocalContext context;
  v8::Isolate* isolate = context.isolate();
  v8::HandleScope scope(isolate);
  bool byteMode = v8_inspector::usesByteStringSemantics(isolate);
  const uint16_t units[] = {0xe9, 0x4e2d, 0xd83d, 0xde00, 0xd800};
  auto source =
      v8::String::NewFromTwoByte(isolate, units, v8::NewStringType::kNormal, 5)
          .ToLocalChecked();
  String8 result = v8_inspector::toProtocolString(isolate, source);
  CheckBytes(result, byteMode
                         ? "\xc3\xa9\xe4\xb8\xad\xf0\x9f\x98\x80\xef\xbf\xbd"
                         : "\xc3\xa9\xe4\xb8\xad\xf0\x9f\x98\x80\xed\xa0\x80");
  CHECK(v8_inspector::toProtocolString(
            isolate, v8_inspector::toV8String(isolate, result)) == result);
  const uint8_t latin1[] = {0xe9, 0xff};
  v8_inspector::StringView legacy(latin1, 2);
  auto text = v8_inspector::toString8(legacy);
  CheckBytes(text, "\xc3\xa9\xc3\xbf");
  CHECK(v8_inspector::toProtocolString(
            isolate, v8_inspector::toV8String(isolate, legacy)) == text);
  v8_inspector::ScopedStringView adapted(text);
  CHECK(!adapted.view().is8Bit());
  CHECK_EQ(adapted.view().length(), 2);
  CHECK_EQ(adapted.view().characters16()[1], 0xff);
  auto owned = v8_inspector::StringBufferFrom(text);
  text = "mutated";
  CheckBytes(v8_inspector::toString8(owned->string()), "\xc3\xa9\xc3\xbf");
  String8 coordinates("\xc3\xa9\xf0\x9f\x98\x80z");
  CHECK_EQ(coordinates.utf16Length(), 4);
  CHECK_EQ(coordinates.byteOffsetForUTF16(1), 2);
  CHECK_EQ(coordinates.byteOffsetForUTF16(2), 2);
  CHECK_EQ(coordinates.byteOffsetForUTF16(3), 6);
  CHECK_EQ(coordinates.completePrefix(5), 2);
  CHECK_EQ(v8_inspector::engineStringLength(isolate, coordinates),
           byteMode ? 7 : 4);
}

TEST(InspectorString8SearchAndViews) {
  LocalContext context;
  v8::Isolate* isolate = context.isolate();
  v8::HandleScope scope(isolate);
  v8_inspector::V8InspectorClient client;
  auto inspector = v8_inspector::V8Inspector::create(isolate, &client);
  inspector->contextCreated(
      v8_inspector::V8ContextInfo(context.local(), 1, {}));
  auto* impl = static_cast<v8_inspector::V8InspectorImpl*>(inspector.get());
  v8_inspector::V8Regex regex(impl, "\xe4\xb8\xad", true);
  String8 text("\xc3\xa9\xf0\x9f\x98\x80\xe4\xb8\xad!");
  int length;
  CHECK_EQ(regex.match(text, 0, &length), 6);
  CHECK_EQ(length, 3);
  CHECK(text.substring(6, length) == String8("\xe4\xb8\xad"));
  CHECK_EQ(regex.match(text, 2, &length), 6);

  struct Capture {
    v8_inspector::V8Inspector* inspector;
    std::unique_ptr<v8_inspector::V8StackTrace> stack;
  } capture{inspector.get(), nullptr};
  constexpr v8::ExternalPointerTypeTag tag = 1;
  auto callback = v8::Function::New(
                      context.local(),
                      [](const v8::FunctionCallbackInfo<v8::Value>& info) {
                        auto* capture = static_cast<Capture*>(
                            info.Data().As<v8::External>()->Value(tag));
                        capture->stack =
                            capture->inspector->captureStackTrace(true);
                      },
                      v8::External::New(isolate, &capture, tag))
                      .ToLocalChecked();
  CHECK(context->Global()
            ->Set(context.local(), v8_str("capture"), callback)
            .FromJust());
  CompileRunWithOrigin("function \u00e9() { capture(); } \u00e9();",
                       "\u4e2d.js");
  CHECK(capture.stack && !capture.stack->isEmpty());
  auto name = capture.stack->topFunctionName();
  auto url = capture.stack->topSourceURL();
  auto frames = capture.stack->frames();
  auto firstURL = capture.stack->firstNonEmptySourceURL();
  auto cloned = capture.stack->clone();
  CHECK(v8_inspector::toString8(firstURL) == v8_inspector::toString8(url));
  CheckBytes(v8_inspector::toString8(name), "\xc3\xa9");
  CheckBytes(v8_inspector::toString8(url), "\xe4\xb8\xad.js");
  CHECK(!frames.empty());
  CHECK(v8_inspector::toString8(frames[0].functionName) ==
        v8_inspector::toString8(name));
  capture.stack.reset();
  CheckBytes(v8_inspector::toString8(cloned->topFunctionName()), "\xc3\xa9");
  inspector->contextDestroyed(context.local());
}

TEST(InspectorString8MagicSourceURL) {
  LocalContext context;
  v8::Isolate* isolate = context.isolate();
  v8::HandleScope scope(isolate);
  auto script =
      CompileWithOrigin("42; //# sourceURL=\u4e2d.js", "fallback.js", false);
  CheckBytes(v8_inspector::toProtocolString(
                 isolate, script->GetUnboundScript()->GetSourceURL()
                              .As<v8::String>()),
             "\xe4\xb8\xad.js");
}

}  // namespace
