// Copyright 2016 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/strings/uri.h"

#include <algorithm>
#include <cstring>
#include <limits>
#include <new>
#include <vector>

#include "src/common/globals.h"
#include "src/execution/isolate-inl.h"
#include "src/flags/flags.h"
#include "src/strings/char-predicates-inl.h"
#include "src/strings/string-search.h"
#include "src/strings/unicode-inl.h"

namespace v8 {
namespace internal {

namespace {  // anonymous namespace for DecodeURI helper functions
bool IsReservedPredicate(base::uc16 c) {
  switch (c) {
    case '#':
    case '$':
    case '&':
    case '+':
    case ',':
    case '/':
    case ':':
    case ';':
    case '=':
    case '?':
    case '@':
      return true;
    default:
      return false;
  }
}

bool IsReplacementCharacter(const uint8_t* octets, int length) {
  // The replacement character is at codepoint U+FFFD in the Unicode Specials
  // table. Its UTF-8 encoding is 0xEF 0xBF 0xBD.
  if (length != 3 || octets[0] != 0xEF || octets[1] != 0xBF ||
      octets[2] != 0xBD) {
    return false;
  }
  return true;
}

bool DecodeOctets(const uint8_t* octets, int length,
                  std::vector<base::uc16>* buffer) {
  size_t cursor = 0;
  base::uc32 value = unibrow::Utf8::ValueOf(octets, length, &cursor);
  if (value == unibrow::Utf8::kBadChar &&
      !IsReplacementCharacter(octets, length)) {
    return false;
  }

  if (value <=
      static_cast<base::uc32>(unibrow::Utf16::kMaxNonSurrogateCharCode)) {
    buffer->push_back(value);
  } else {
    buffer->push_back(unibrow::Utf16::LeadSurrogate(value));
    buffer->push_back(unibrow::Utf16::TrailSurrogate(value));
  }
  return true;
}

int TwoDigitHex(base::uc16 character1, base::uc16 character2) {
  if (character1 > 'f') return -1;
  int high = base::HexValue(character1);
  if (high == -1) return -1;
  if (character2 > 'f') return -1;
  int low = base::HexValue(character2);
  if (low == -1) return -1;
  return (high << 4) + low;
}

template <typename T>
void AddToBuffer(base::uc16 decoded, String::FlatContent* uri_content,
                 int index, bool is_uri, std::vector<T>* buffer) {
  if (is_uri && IsReservedPredicate(decoded)) {
    buffer->push_back('%');
    base::uc16 first = uri_content->Get(index + 1);
    base::uc16 second = uri_content->Get(index + 2);
    DCHECK_GT(std::numeric_limits<T>::max(), first);
    DCHECK_GT(std::numeric_limits<T>::max(), second);

    buffer->push_back(first);
    buffer->push_back(second);
  } else {
    buffer->push_back(decoded);
  }
}

bool IntoTwoByte(int index, bool is_uri, int uri_length,
                 String::FlatContent* uri_content,
                 std::vector<base::uc16>* buffer) {
  for (int k = index; k < uri_length; k++) {
    base::uc16 code = uri_content->Get(k);
    if (code == '%') {
      int two_digits;
      if (k + 2 >= uri_length ||
          (two_digits = TwoDigitHex(uri_content->Get(k + 1),
                                    uri_content->Get(k + 2))) < 0) {
        return false;
      }
      k += 2;
      base::uc16 decoded = static_cast<base::uc16>(two_digits);
      if (decoded > unibrow::Utf8::kMaxOneByteChar) {
        uint8_t octets[unibrow::Utf8::kMaxEncodedSize];
        octets[0] = decoded;

        int number_of_continuation_bytes = 0;
        while ((decoded << ++number_of_continuation_bytes) & 0x80) {
          if (number_of_continuation_bytes > 3 || k + 3 >= uri_length) {
            return false;
          }
          if (uri_content->Get(++k) != '%' ||
              (two_digits = TwoDigitHex(uri_content->Get(k + 1),
                                        uri_content->Get(k + 2))) < 0) {
            return false;
          }
          k += 2;
          base::uc16 continuation_byte = static_cast<base::uc16>(two_digits);
          octets[number_of_continuation_bytes] = continuation_byte;
        }

        if (!DecodeOctets(octets, number_of_continuation_bytes, buffer)) {
          return false;
        }
      } else {
        AddToBuffer(decoded, uri_content, k - 2, is_uri, buffer);
      }
    } else {
      buffer->push_back(code);
    }
  }
  return true;
}

bool IntoOneAndTwoByte(DirectHandle<String> uri, bool is_uri,
                       std::vector<uint8_t>* one_byte_buffer,
                       std::vector<base::uc16>* two_byte_buffer) {
  DisallowGarbageCollection no_gc;
  String::FlatContent uri_content = uri->GetFlatContent(no_gc);

  int uri_length = uri->length();
  for (int k = 0; k < uri_length; k++) {
    base::uc16 code = uri_content.Get(k);
    if (code == '%') {
      int two_digits;
      if (k + 2 >= uri_length ||
          (two_digits = TwoDigitHex(uri_content.Get(k + 1),
                                    uri_content.Get(k + 2))) < 0) {
        return false;
      }

      base::uc16 decoded = static_cast<base::uc16>(two_digits);
      if (decoded > unibrow::Utf8::kMaxOneByteChar) {
        return IntoTwoByte(k, is_uri, uri_length, &uri_content,
                           two_byte_buffer);
      }

      AddToBuffer(decoded, &uri_content, k, is_uri, one_byte_buffer);
      k += 2;
    } else {
      if (code > unibrow::Utf8::kMaxOneByteChar) {
        return IntoTwoByte(k, is_uri, uri_length, &uri_content,
                           two_byte_buffer);
      }
      one_byte_buffer->push_back(code);
    }
  }
  return true;
}

size_t StrictUtf8SequenceLength(base::Vector<const uint8_t> bytes,
                                size_t index) {
  uint8_t first = bytes[index];
  if (first <= 0x7F) return 1;
  if (first >= 0xC2 && first <= 0xDF) {
    return index + 1 < bytes.size() && (bytes[index + 1] & 0xC0) == 0x80 ? 2
                                                                         : 0;
  }
  if (first >= 0xE0 && first <= 0xEF) {
    if (index + 2 >= bytes.size()) return 0;
    uint8_t second = bytes[index + 1];
    bool valid_second = first == 0xE0   ? second >= 0xA0 && second <= 0xBF
                        : first == 0xED ? second >= 0x80 && second <= 0x9F
                                        : (second & 0xC0) == 0x80;
    return valid_second && (bytes[index + 2] & 0xC0) == 0x80 ? 3 : 0;
  }
  if (first >= 0xF0 && first <= 0xF4) {
    if (index + 3 >= bytes.size()) return 0;
    uint8_t second = bytes[index + 1];
    bool valid_second = first == 0xF0   ? second >= 0x90 && second <= 0xBF
                        : first == 0xF4 ? second >= 0x80 && second <= 0x8F
                                        : (second & 0xC0) == 0x80;
    return valid_second && (bytes[index + 2] & 0xC0) == 0x80 &&
                   (bytes[index + 3] & 0xC0) == 0x80
               ? 4
               : 0;
  }
  return 0;
}

bool DecodeNode8(base::Vector<const uint8_t> uri, bool is_uri,
                 std::vector<uint8_t>* buffer) {
  buffer->reserve(uri.size());
  for (size_t index = 0; index < uri.size(); ++index) {
    uint8_t byte = uri[index];
    if (byte != '%') {
      buffer->push_back(byte);
      continue;
    }

    if (index + 2 >= uri.size()) return false;
    int decoded = TwoDigitHex(uri[index + 1], uri[index + 2]);
    if (decoded < 0) return false;

    uint8_t first = static_cast<uint8_t>(decoded);
    if (first <= unibrow::Utf8::kMaxOneByteChar) {
      if (is_uri && IsReservedPredicate(first)) {
        buffer->insert(buffer->end(), uri.begin() + index,
                       uri.begin() + index + 3);
      } else {
        buffer->push_back(first);
      }
      index += 2;
      continue;
    }

    size_t sequence_length;
    if (first >= 0xC2 && first <= 0xDF) {
      sequence_length = 2;
    } else if (first >= 0xE0 && first <= 0xEF) {
      sequence_length = 3;
    } else if (first >= 0xF0 && first <= 0xF4) {
      sequence_length = 4;
    } else {
      return false;
    }

    uint8_t octets[unibrow::Utf8::kMaxEncodedSize] = {first};
    for (size_t offset = 1; offset < sequence_length; ++offset) {
      index += 3;
      if (index + 2 >= uri.size() || uri[index] != '%') return false;
      decoded = TwoDigitHex(uri[index + 1], uri[index + 2]);
      if (decoded < 0) return false;
      octets[offset] = static_cast<uint8_t>(decoded);
    }

    if (StrictUtf8SequenceLength(
            base::Vector<const uint8_t>(octets, sequence_length), 0) !=
        sequence_length) {
      return false;
    }
    buffer->insert(buffer->end(), octets, octets + sequence_length);
    index += 2;
  }
  return true;
}

}  // anonymous namespace

MaybeDirectHandle<String> Uri::Decode(Isolate* isolate,
                                      DirectHandle<String> uri, bool is_uri) {
  uri = String::Flatten(isolate, uri);
  std::vector<uint8_t> one_byte_buffer;
  std::vector<base::uc16> two_byte_buffer;

  if (v8_flags.utf8_string_semantics) {
    bool is_one_byte;
    {
      DisallowGarbageCollection no_gc;
      String::FlatContent content = uri->GetFlatContent(no_gc);
      is_one_byte = content.IsOneByte();
      if (is_one_byte &&
          !DecodeNode8(content.ToByteVector(), is_uri, &one_byte_buffer)) {
        THROW_NEW_ERROR(isolate, NewURIError());
      }
    }
    if (is_one_byte) {
      return isolate->factory()->NewStringFromOneByte(
          base::VectorOf(one_byte_buffer));
    }
  }

  if (!IntoOneAndTwoByte(uri, is_uri, &one_byte_buffer, &two_byte_buffer)) {
    THROW_NEW_ERROR(isolate, NewURIError());
  }

  if (two_byte_buffer.empty()) {
    return isolate->factory()->NewStringFromOneByte(base::Vector<const uint8_t>(
        one_byte_buffer.data(), static_cast<int>(one_byte_buffer.size())));
  }

  DirectHandle<SeqTwoByteString> result;
  int result_length =
      static_cast<int>(one_byte_buffer.size() + two_byte_buffer.size());
  ASSIGN_RETURN_ON_EXCEPTION(
      isolate, result, isolate->factory()->NewRawTwoByteString(result_length));

  DisallowGarbageCollection no_gc;
  base::uc16* chars = result->GetChars(no_gc);
  if (!one_byte_buffer.empty()) {
    CopyChars(chars, one_byte_buffer.data(), one_byte_buffer.size());
    chars += one_byte_buffer.size();
  }
  if (!two_byte_buffer.empty()) {
    CopyChars(chars, two_byte_buffer.data(), two_byte_buffer.size());
  }

  return result;
}

namespace {

template <typename T>
class ResizableBuffer {
 public:
  explicit ResizableBuffer(size_t initial_capacity, size_t max_capacity)
      : data_(new T[initial_capacity]),
        capacity_(initial_capacity),
        size_(0),
        max_capacity_(max_capacity) {
    DCHECK_LE(capacity_, max_capacity_);
    // Check that `max_capacity_` is not so large that `capacity_ * 2`
    // could overflow.
    DCHECK_LE(max_capacity_, std::numeric_limits<size_t>::max() / 2);
  }

  ~ResizableBuffer() { delete[] data_; }

  ResizableBuffer(const ResizableBuffer&) = delete;
  ResizableBuffer& operator=(const ResizableBuffer&) = delete;

  template <typename... Args>
  bool TryPushBack(Args... args) {
    constexpr size_t arg_count = sizeof...(args);
    if (V8_UNLIKELY(size_ + arg_count > capacity_)) {
      if (!TryExpand(arg_count)) return false;
    }
    ((data_[size_++] = args), ...);
    return true;
  }

  const T* data() const { return data_; }
  size_t size() const { return size_; }

 private:
  V8_PRESERVE_MOST bool TryExpand(size_t required_size) {
    size_t minimum_capacity = size_ + required_size;
    size_t new_capacity =
        std::min(capacity_ * 2 + required_size, max_capacity_);
    if (new_capacity < minimum_capacity) return false;

    T* new_data = new T[new_capacity];
    std::memcpy(new_data, data_, size_ * sizeof(T));
    delete[] data_;
    data_ = new_data;
    capacity_ = new_capacity;
    return true;
  }

  T* data_;
  size_t capacity_;
  size_t size_;
  const size_t max_capacity_;
};

bool IsUnescapePredicateInUriComponent(base::uc16 c) {
  if (IsAlphaNumeric(c)) {
    return true;
  }

  switch (c) {
    case '!':
    case '\'':
    case '(':
    case ')':
    case '*':
    case '-':
    case '.':
    case '_':
    case '~':
      return true;
    default:
      return false;
  }
}

bool IsUriSeparator(base::uc16 c) {
  switch (c) {
    case '#':
    case ':':
    case ';':
    case '/':
    case '?':
    case '$':
    case '&':
    case '+':
    case ',':
    case '@':
    case '=':
      return true;
    default:
      return false;
  }
}

bool AddEncodedOctetToBuffer(uint8_t octet, ResizableBuffer<uint8_t>* buffer) {
  return buffer->TryPushBack('%', base::HexCharOfValue(octet >> 4),
                             base::HexCharOfValue(octet & 0x0F));
}

bool Encode(unibrow::uchar c, ResizableBuffer<uint8_t>* buffer) {
  char s[4] = {};
  int number_of_bytes =
      unibrow::Utf8::Encode(s, c, unibrow::Utf16::kNoPreviousCharacter, false);
  for (int k = 0; k < number_of_bytes; k++) {
    if (!AddEncodedOctetToBuffer(s[k], buffer)) return false;
  }
  return true;
}

enum class EncodeStatus { kSuccess, kUriError, kAllocationFailure };

V8_NODISCARD EncodeStatus
EncodeHelperOneByte(base::Vector<const uint8_t> uri_content, bool is_uri,
                    ResizableBuffer<uint8_t>* buffer) {
  for (uint8_t c : uri_content) {
    if (IsUnescapePredicateInUriComponent(c) || (is_uri && IsUriSeparator(c))) {
      if (!buffer->TryPushBack(c)) {
        return EncodeStatus::kAllocationFailure;
      }
    } else {
      if (!Encode(c, buffer)) {
        return EncodeStatus::kAllocationFailure;
      }
    }
  }
  return EncodeStatus::kSuccess;
}

V8_NODISCARD EncodeStatus
EncodeHelperNode8(base::Vector<const uint8_t> uri_content, bool is_uri,
                  ResizableBuffer<uint8_t>* buffer) {
  for (size_t index = 0; index < uri_content.size();) {
    uint8_t byte = uri_content[index];
    if (byte <= unibrow::Utf8::kMaxOneByteChar &&
        (IsUnescapePredicateInUriComponent(byte) ||
         (is_uri && IsUriSeparator(byte)))) {
      if (!buffer->TryPushBack(byte)) {
        return EncodeStatus::kAllocationFailure;
      }
      index++;
      continue;
    }

    size_t sequence_length = StrictUtf8SequenceLength(uri_content, index);
    if (sequence_length == 0) return EncodeStatus::kUriError;
    for (size_t offset = 0; offset < sequence_length; ++offset) {
      if (!AddEncodedOctetToBuffer(uri_content[index + offset], buffer)) {
        return EncodeStatus::kAllocationFailure;
      }
    }
    index += sequence_length;
  }
  return EncodeStatus::kSuccess;
}

V8_NODISCARD EncodeStatus
EncodeHelperTwoByte(base::Vector<const base::uc16> uri_content, bool is_uri,
                    ResizableBuffer<uint8_t>* buffer) {
  for (int k = 0; k < uri_content.length(); k++) {
    base::uc16 cc1 = uri_content[k];
    if (unibrow::Utf16::IsLeadSurrogate(cc1)) {
      k++;
      if (k >= uri_content.length()) {
        // A lead surrogate was found without a tail surrogate.
        return EncodeStatus::kUriError;
      }
      base::uc16 cc2 = uri_content[k];
      if (!unibrow::Utf16::IsTrailSurrogate(cc2)) {
        // A lead surrogate was found without a tail surrogate.
        return EncodeStatus::kUriError;
      }

      if (!Encode(unibrow::Utf16::CombineSurrogatePair(cc1, cc2), buffer)) {
        return EncodeStatus::kAllocationFailure;
      }
      continue;
    }

    if (unibrow::Utf16::IsTrailSurrogate(cc1)) {
      // A tail surrogate was found without a preceding lead surrogate.
      return EncodeStatus::kUriError;
    }

    if (IsUnescapePredicateInUriComponent(cc1) ||
        (is_uri && IsUriSeparator(cc1))) {
      if (!buffer->TryPushBack(cc1)) {
        return EncodeStatus::kAllocationFailure;
      }
    } else {
      if (!Encode(cc1, buffer)) {
        return EncodeStatus::kAllocationFailure;
      }
    }
  }
  return EncodeStatus::kSuccess;
}

V8_NODISCARD EncodeStatus EncodeHelper(DirectHandle<String> uri, bool is_uri,
                                       ResizableBuffer<uint8_t>* buffer) {
  DisallowGarbageCollection no_gc;
  String::FlatContent uri_content = uri->GetFlatContent(no_gc);
  if (uri_content.IsOneByte()) {
    if (v8_flags.utf8_string_semantics) {
      return EncodeHelperNode8(uri_content.ToByteVector(), is_uri, buffer);
    }
    return EncodeHelperOneByte(uri_content.ToOneByteVector(), is_uri, buffer);
  }
  return EncodeHelperTwoByte(uri_content.ToUC16Vector(), is_uri, buffer);
}

}  // anonymous namespace

MaybeDirectHandle<String> Uri::Encode(Isolate* isolate,
                                      DirectHandle<String> uri, bool is_uri) {
  uri = String::Flatten(isolate, uri);
  ResizableBuffer<uint8_t> buffer(uri->length(), v8::String::kMaxLength);

  EncodeStatus status = EncodeHelper(uri, is_uri, &buffer);

  switch (status) {
    case EncodeStatus::kSuccess:
      return isolate->factory()->NewStringFromOneByte(base::VectorOf(buffer));
    case EncodeStatus::kUriError:
      THROW_NEW_ERROR(isolate, NewURIError());
    case EncodeStatus::kAllocationFailure:
      THROW_NEW_ERROR(isolate, NewInvalidStringLengthError());
  }
}

namespace {  // Anonymous namespace for Escape and Unescape

template <typename Char>
int UnescapeChar(base::Vector<const Char> vector, int i, int length,
                 int* step) {
  uint16_t character = vector[i];
  int32_t hi = 0;
  int32_t lo = 0;
  if (character == '%' && i <= length - 6 && vector[i + 1] == 'u' &&
      (hi = TwoDigitHex(vector[i + 2], vector[i + 3])) > -1 &&
      (lo = TwoDigitHex(vector[i + 4], vector[i + 5])) > -1) {
    *step = 6;
    return (hi << 8) + lo;
  } else if (character == '%' && i <= length - 3 &&
             (lo = TwoDigitHex(vector[i + 1], vector[i + 2])) > -1) {
    *step = 3;
    return lo;
  } else {
    *step = 1;
    return character;
  }
}

template <typename Char>
MaybeHandle<String> UnescapeSlow(Isolate* isolate, DirectHandle<String> string,
                                 int start_index) {
  bool one_byte = true;
  uint32_t length = string->length();

  int unescaped_length = 0;
  {
    DisallowGarbageCollection no_gc;
    base::Vector<const Char> vector = string->GetCharVector<Char>(no_gc);
    for (uint32_t i = start_index; i < length; unescaped_length++) {
      int step;
      if (UnescapeChar(vector, i, length, &step) >
          String::kMaxOneByteCharCode) {
        one_byte = false;
      }
      i += step;
    }
  }

  DCHECK_LT(start_index, length);
  Handle<String> first_part =
      isolate->factory()->NewProperSubString(string, 0, start_index);

  int dest_position = 0;
  Handle<String> second_part;
  DCHECK_LE(unescaped_length, String::kMaxLength);
  if (one_byte) {
    Handle<SeqOneByteString> dest = isolate->factory()
                                        ->NewRawOneByteString(unescaped_length)
                                        .ToHandleChecked();
    DisallowGarbageCollection no_gc;
    base::Vector<const Char> vector = string->GetCharVector<Char>(no_gc);
    for (uint32_t i = start_index; i < length; dest_position++) {
      int step;
      dest->SeqOneByteStringSet(dest_position,
                                UnescapeChar(vector, i, length, &step));
      i += step;
    }
    second_part = dest;
  } else {
    Handle<SeqTwoByteString> dest = isolate->factory()
                                        ->NewRawTwoByteString(unescaped_length)
                                        .ToHandleChecked();
    DisallowGarbageCollection no_gc;
    base::Vector<const Char> vector = string->GetCharVector<Char>(no_gc);
    for (uint32_t i = start_index; i < length; dest_position++) {
      int step;
      dest->SeqTwoByteStringSet(dest_position,
                                UnescapeChar(vector, i, length, &step));
      i += step;
    }
    second_part = dest;
  }
  return isolate->factory()->NewConsString(first_part, second_part);
}

bool IsNotEscaped(uint16_t c) {
  if (IsAlphaNumeric(c)) {
    return true;
  }
  //  @*_+-./
  switch (c) {
    case '@':
    case '*':
    case '_':
    case '+':
    case '-':
    case '.':
    case '/':
      return true;
    default:
      return false;
  }
}

template <typename Char>
static MaybeHandle<String> UnescapePrivate(Isolate* isolate,
                                           Handle<String> source) {
  int index;
  {
    DisallowGarbageCollection no_gc;
    StringSearch<uint8_t, Char> search(isolate, base::StaticOneByteVector("%"));
    index = search.Search(source->GetCharVector<Char>(no_gc), 0);
    if (index < 0) return source;
  }
  return UnescapeSlow<Char>(isolate, source, index);
}

template <typename Char>
static MaybeHandle<String> EscapePrivate(Isolate* isolate,
                                         Handle<String> string) {
  DCHECK(string->IsFlat());
  uint32_t escaped_length = 0;
  uint32_t length = string->length();

  {
    DisallowGarbageCollection no_gc;
    base::Vector<const Char> vector = string->GetCharVector<Char>(no_gc);
    for (uint32_t i = 0; i < length; i++) {
      uint16_t c = vector[i];
      if (c >= 256) {
        escaped_length += 6;
      } else if (IsNotEscaped(c)) {
        escaped_length++;
      } else {
        escaped_length += 3;
      }

      // We don't allow strings that are longer than a maximal length.
      DCHECK_LT(String::kMaxLength, 0x7FFFFFFF - 6);   // Cannot overflow.
      if (escaped_length > String::kMaxLength) break;  // Provoke exception.
    }
  }

  // No length change implies no change.  Return original string if no change.
  if (escaped_length == length) return string;

  Handle<SeqOneByteString> dest;
  ASSIGN_RETURN_ON_EXCEPTION(
      isolate, dest, isolate->factory()->NewRawOneByteString(escaped_length));
  int dest_position = 0;

  {
    DisallowGarbageCollection no_gc;
    base::Vector<const Char> vector = string->GetCharVector<Char>(no_gc);
    for (uint32_t i = 0; i < length; i++) {
      uint16_t c = vector[i];
      if (c >= 256) {
        dest->SeqOneByteStringSet(dest_position, '%');
        dest->SeqOneByteStringSet(dest_position + 1, 'u');
        dest->SeqOneByteStringSet(dest_position + 2,
                                  base::HexCharOfValue(c >> 12));
        dest->SeqOneByteStringSet(dest_position + 3,
                                  base::HexCharOfValue((c >> 8) & 0xF));
        dest->SeqOneByteStringSet(dest_position + 4,
                                  base::HexCharOfValue((c >> 4) & 0xF));
        dest->SeqOneByteStringSet(dest_position + 5,
                                  base::HexCharOfValue(c & 0xF));
        dest_position += 6;
      } else if (IsNotEscaped(c)) {
        dest->SeqOneByteStringSet(dest_position, c);
        dest_position++;
      } else {
        dest->SeqOneByteStringSet(dest_position, '%');
        dest->SeqOneByteStringSet(dest_position + 1,
                                  base::HexCharOfValue(c >> 4));
        dest->SeqOneByteStringSet(dest_position + 2,
                                  base::HexCharOfValue(c & 0xF));
        dest_position += 3;
      }
    }
  }

  return dest;
}

}  // anonymous namespace

MaybeDirectHandle<String> Uri::Escape(Isolate* isolate, Handle<String> string) {
  string = String::Flatten(isolate, string);
  return String::IsOneByteRepresentationUnderneath(*string)
             ? EscapePrivate<uint8_t>(isolate, string)
             : EscapePrivate<base::uc16>(isolate, string);
}

MaybeDirectHandle<String> Uri::Unescape(Isolate* isolate,
                                        Handle<String> string) {
  string = String::Flatten(isolate, string);
  return String::IsOneByteRepresentationUnderneath(*string)
             ? UnescapePrivate<uint8_t>(isolate, string)
             : UnescapePrivate<base::uc16>(isolate, string);
}

}  // namespace internal
}  // namespace v8
