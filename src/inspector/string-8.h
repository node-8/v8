// Copyright 2026 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef V8_INSPECTOR_STRING_8_H_
#define V8_INSPECTOR_STRING_8_H_

#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "src/base/macros.h"

namespace v8_inspector {

// Owned protocol bytes. Encoding interpretation belongs to explicit boundaries.
class V8_EXPORT_PRIVATE String8 {
 public:
  static constexpr size_t kNotFound = std::string::npos;

  String8() = default;
  String8(const String8&) = default;
  String8& operator=(const String8&) = default;
  String8(String8&& other) noexcept
      : m_impl(std::move(other.m_impl)),
        hash_code(std::exchange(other.hash_code, 0)) {}
  String8& operator=(String8&& other) noexcept {
    if (this != &other) {
      m_impl = std::move(other.m_impl);
      hash_code = std::exchange(other.hash_code, 0);
    }
    return *this;
  }
  String8(const char* text) : m_impl(text) {}  // NOLINT(runtime/explicit)
  String8(const char* bytes, size_t length)
      : m_impl(length ? std::string(bytes, length) : std::string()) {}
  String8(std::string_view bytes)
      : m_impl(bytes) {}  // NOLINT(runtime/explicit)
  explicit String8(std::string bytes) : m_impl(std::move(bytes)) {}

  static String8 fromUTF8(const char* bytes, size_t length) {
    return String8(bytes, length);
  }
  static String8 fromLatin1(const uint8_t* bytes, size_t length);
  static String8 fromUTF16(const uint16_t* units, size_t length);
  static String8 fromUTF16LE(const uint8_t* bytes, size_t byte_length);
  static String8 fromUTF8Scalar(const uint8_t* bytes, size_t length);

  // Legacy API boundary only; never retained as an internal representation.
  std::vector<uint16_t> toUTF16() const;
  size_t utf16Length() const;
  size_t byteOffsetForUTF16(size_t offset) const;
  size_t completePrefix(size_t byte_length) const;
  const std::string& utf8() const { return m_impl; }
  const uint8_t* characters8() const {
    return reinterpret_cast<const uint8_t*>(m_impl.data());
  }
  size_t length() const { return m_impl.length(); }
  bool isEmpty() const { return m_impl.empty(); }
  uint8_t operator[](size_t index) const {
    return static_cast<uint8_t>(m_impl[index]);
  }
  String8 substring(size_t pos, size_t length = kNotFound) const {
    return String8(m_impl.substr(pos, length));
  }
  size_t find(const String8& other, size_t start = 0) const {
    return m_impl.find(other.m_impl, start);
  }
  size_t reverseFind(const String8& other, size_t start = kNotFound) const {
    return m_impl.rfind(other.m_impl, start);
  }
  size_t find(uint8_t byte, size_t start = 0) const {
    return m_impl.find(static_cast<char>(byte), start);
  }
  size_t reverseFind(uint8_t byte, size_t start = kNotFound) const {
    return m_impl.rfind(static_cast<char>(byte), start);
  }
  void swap(String8& other) {
    m_impl.swap(other.m_impl);
    std::swap(hash_code, other.hash_code);
  }
  bool operator==(const String8& other) const { return m_impl == other.m_impl; }
  bool operator!=(const String8& other) const { return !(*this == other); }
  bool operator<(const String8& other) const { return m_impl < other.m_impl; }
  String8 operator+(const String8& other) const {
    return String8(m_impl + other.m_impl);
  }
  String8& operator+=(const String8& other) {
    m_impl += other.m_impl;
    hash_code = 0;
    return *this;
  }
  size_t hash() const {
    if (!hash_code) {
      for (uint8_t byte : m_impl) hash_code = 31 * hash_code + byte;
      if (!hash_code) ++hash_code;
    }
    return hash_code;
  }

  static String8 fromInteger(int value);
  static String8 fromInteger(size_t value);
  static String8 fromInteger64(int64_t value);
  static String8 fromDouble(double value);
  static String8 fromDouble(double value, int precision);
  int64_t toInteger64(bool* ok = nullptr) const;
  int toInteger(bool* ok = nullptr) const;
  std::pair<size_t, size_t> getTrimmedOffsetAndLength() const;
  String8 stripWhiteSpace() const;

  template <typename... T>
  static String8 concat(T... args);

 private:
  std::string m_impl;
  mutable size_t hash_code = 0;
};

inline String8 operator+(const char* left, const String8& right) {
  return String8(left) + right;
}

class V8_EXPORT_PRIVATE String8Builder {
 public:
  void append(const String8& value) { m_buffer.append(value.utf8()); }
  void append(char byte) { m_buffer.push_back(byte); }
  void append(uint8_t byte) { m_buffer.push_back(static_cast<char>(byte)); }
  void append(const char* bytes, size_t length) {
    if (length) m_buffer.append(bytes, length);
  }
  void appendCodePoint(uint32_t code_point);
  void appendNumber(int value) { append(String8::fromInteger(value)); }
  void appendNumber(size_t value) { append(String8::fromInteger(value)); }
  void appendUnsignedAsHex(uint64_t value);
  void appendUnsignedAsHex(uint32_t value);
  void appendUnsignedAsHex(uint8_t value);
  String8 toString() const& { return String8(m_buffer); }
  String8 toString() && { return String8(std::move(m_buffer)); }
  void reserveCapacity(size_t capacity) { m_buffer.reserve(capacity); }

  template <typename T, typename... R>
  void appendAll(T first, R... rest) {
    append(first);
    appendAll(rest...);
  }
  void appendAll() {}

 private:
  std::string m_buffer;
};

template <typename... T>
String8 String8::concat(T... args) {
  String8Builder builder;
  builder.appendAll(args...);
  return std::move(builder).toString();
}

}  // namespace v8_inspector

namespace std {
template <>
struct hash<v8_inspector::String8> {
  size_t operator()(const v8_inspector::String8& value) const {
    return value.hash();
  }
};
}  // namespace std

#endif  // V8_INSPECTOR_STRING_8_H_
