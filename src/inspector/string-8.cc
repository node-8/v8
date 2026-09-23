// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/inspector/string-8.h"

#include <cstdlib>
#include <limits>

#include "src/base/logging.h"
#include "src/base/vector.h"
#include "src/numbers/conversions.h"
#include "src/strings/unicode-decoder.h"
#include "src/strings/unicode-inl.h"

namespace v8_inspector {
namespace {

using v8::internal::Wtf8ByteCursor;

bool isSpaceOrNewLine(uint8_t byte) {
  return byte == ' ' || (byte >= '\t' && byte <= '\r');
}

template <typename ReadUnit>
String8 fromUTF16Units(size_t length, ReadUnit read) {
  String8Builder builder;
  builder.reserveCapacity(length);
  for (size_t i = 0; i < length; ++i) {
    uint32_t point = read(i);
    if (unibrow::Utf16::IsLeadSurrogate(point) && i + 1 < length &&
        unibrow::Utf16::IsTrailSurrogate(read(i + 1))) {
      point = unibrow::Utf16::CombineSurrogatePair(point, read(++i));
    }
    builder.appendCodePoint(point);
  }
  return std::move(builder).toString();
}

template <typename T>
void appendHex(T value, String8Builder* builder) {
  constexpr char digits[] = "0123456789abcdef";
  char buffer[2 * sizeof(T)];
  for (size_t i = sizeof(buffer); i > 0; --i) {
    buffer[i - 1] = digits[value & 15];
    value >>= 4;
  }
  builder->append(buffer, sizeof(buffer));
}

}  // namespace

String8 String8::fromLatin1(const uint8_t* bytes, size_t length) {
  String8Builder builder;
  builder.reserveCapacity(length);
  for (size_t i = 0; i < length; ++i) builder.appendCodePoint(bytes[i]);
  return std::move(builder).toString();
}

String8 String8::fromUTF16(const uint16_t* units, size_t length) {
  return fromUTF16Units(length, [units](size_t i) { return units[i]; });
}

String8 String8::fromUTF16LE(const uint8_t* bytes, size_t byte_length) {
  DCHECK_EQ(byte_length % 2, 0);
  return fromUTF16Units(byte_length / 2, [bytes](size_t i) {
    return static_cast<uint16_t>(bytes[2 * i] | (bytes[2 * i + 1] << 8));
  });
}

String8 String8::fromUTF8Scalar(const uint8_t* bytes, size_t length) {
  Wtf8ByteCursor cursor({bytes, length}, Wtf8ByteCursor::Policy::kWebScalar);
  String8Builder builder;
  builder.reserveCapacity(length);
  size_t copied = 0;
  while (cursor.has_next()) {
    size_t start = cursor.position();
    auto item = cursor.DecodeNext();
    if (item.status == Wtf8ByteCursor::Status::kValid) continue;
    builder.append(reinterpret_cast<const char*>(bytes + copied),
                   start - copied);
    builder.appendCodePoint(item.code_point);
    copied = cursor.position();
  }
  if (length > copied) {
    builder.append(reinterpret_cast<const char*>(bytes + copied),
                   length - copied);
  }
  return std::move(builder).toString();
}

std::vector<uint16_t> String8::toUTF16() const {
  Wtf8ByteCursor cursor({characters8(), length()},
                        Wtf8ByteCursor::Policy::kInternalWtf8);
  std::vector<uint16_t> units;
  units.reserve(length());
  while (cursor.has_next()) {
    uint32_t point = cursor.DecodeNext().code_point;
    if (point <= 0xffff) {
      units.push_back(static_cast<uint16_t>(point));
    } else {
      units.push_back(unibrow::Utf16::LeadSurrogate(point));
      units.push_back(unibrow::Utf16::TrailSurrogate(point));
    }
  }
  return units;
}

size_t String8::utf16Length() const {
  Wtf8ByteCursor cursor({characters8(), length()},
                        Wtf8ByteCursor::Policy::kInternalWtf8);
  size_t units = 0;
  while (cursor.has_next())
    units += cursor.DecodeNext().code_point > 0xffff ? 2 : 1;
  return units;
}

size_t String8::byteOffsetForUTF16(size_t offset) const {
  Wtf8ByteCursor cursor({characters8(), length()},
                        Wtf8ByteCursor::Policy::kInternalWtf8);
  size_t units = 0;
  while (cursor.has_next() && units < offset) {
    size_t begin = cursor.position();
    units += cursor.DecodeNext().code_point > 0xffff ? 2 : 1;
    // A byte slice cannot divide a supplementary scalar into surrogate halves.
    if (units > offset) return begin;
  }
  return cursor.position();
}

size_t String8::completePrefix(size_t byte_length) const {
  if (byte_length >= length()) return length();
  while (byte_length && ((*this)[byte_length] & 0xc0) == 0x80) --byte_length;
  return byte_length;
}

String8 String8::fromInteger(int value) {
  return String8(std::to_string(value));
}
String8 String8::fromInteger(size_t value) {
  return String8(std::to_string(value));
}
String8 String8::fromInteger64(int64_t value) {
  return String8(std::to_string(value));
}

String8 String8::fromDouble(double value) {
  char buffer[50];
  return String8(
      v8::internal::DoubleToStringView(value, v8::base::ArrayVector(buffer)));
}

String8 String8::fromDouble(double value, int precision) {
  char buffer[v8::internal::kDoubleToPrecisionMaxChars];
  return String8(v8::internal::DoubleToPrecisionStringView(
      value, precision, v8::base::ArrayVector(buffer)));
}

int64_t String8::toInteger64(bool* ok) const {
  for (uint8_t byte : m_impl) {
    if (byte > 0x7f) {
      if (ok) *ok = false;
      return 0;
    }
  }
  char* end;
  int64_t value = std::strtoll(m_impl.c_str(), &end, 10);
  if (ok) *ok = !*end;
  return value;
}

int String8::toInteger(bool* ok) const {
  bool valid;
  int64_t value = toInteger64(&valid);
  valid = valid && value >= std::numeric_limits<int>::min() &&
          value <= std::numeric_limits<int>::max();
  if (ok) *ok = valid;
  return static_cast<int>(value);
}

std::pair<size_t, size_t> String8::getTrimmedOffsetAndLength() const {
  size_t begin = 0, end = length();
  while (begin < end && isSpaceOrNewLine((*this)[begin])) ++begin;
  while (end > begin && isSpaceOrNewLine((*this)[end - 1])) --end;
  return {begin, end - begin};
}

String8 String8::stripWhiteSpace() const {
  auto [begin, count] = getTrimmedOffsetAndLength();
  return substring(begin, count);
}

void String8Builder::appendCodePoint(uint32_t code_point) {
  DCHECK_LE(code_point, 0x10ffff);
  char bytes[unibrow::Utf8::kMaxEncodedSize];
  unsigned count = unibrow::Utf8::Encode(bytes, code_point, -1);
  append(bytes, count);
}

void String8Builder::appendUnsignedAsHex(uint64_t value) {
  appendHex(value, this);
}
void String8Builder::appendUnsignedAsHex(uint32_t value) {
  appendHex(value, this);
}
void String8Builder::appendUnsignedAsHex(uint8_t value) {
  appendHex(value, this);
}

}  // namespace v8_inspector
