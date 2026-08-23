// Copyright 2018 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef V8_INTL_SUPPORT
#error Internationalization is expected to be enabled.
#endif  // V8_INTL_SUPPORT

#include "src/objects/js-segment-iterator.h"

#include <map>
#include <memory>
#include <string>

#include "src/execution/isolate.h"
#include "src/heap/factory.h"
#include "src/objects/intl-objects.h"
#include "src/objects/js-segment-iterator-inl.h"
#include "src/objects/js-segments.h"
#include "src/objects/managed-inl.h"
#include "src/objects/objects-inl.h"
#include "unicode/brkiter.h"
#include "unicode/uvernum.h"

namespace v8 {
namespace internal {

static_assert(String::kMaxLength <= JSSegmentIterator::NextIndexBits::kMax);
static_assert(U_ICU_VERSION_MAJOR_NUM == 77 || U_ICU_VERSION_MAJOR_NUM == 78,
              "Revalidate the Node-8 grapheme byte ranges for this ICU");

namespace {

bool IsContinuationByte(uint8_t byte) { return (byte & 0xc0) == 0x80; }

bool HasBytes(const std::string& bytes, size_t index, size_t count) {
  return count <= bytes.size() - index;
}

size_t CommonIndependentSequenceEnd(const std::string& bytes, size_t index) {
  // These UTF-8 ranges have Grapheme_Cluster_Break=Other in ICU 77 and 78.
  // C1 controls and U+00AD are deliberately excluded because GB4 takes
  // precedence over the rules that attach Extend characters.
  DCHECK_LT(index, bytes.size());
  const uint8_t first = static_cast<uint8_t>(bytes[index]);

  if (HasBytes(bytes, index, 2)) {
    const uint8_t second = static_cast<uint8_t>(bytes[index + 1]);
    if ((first == 0xc2 && second >= 0xa0 && second != 0xad) ||
        (first >= 0xc3 && first <= 0xcb && IsContinuationByte(second)) ||
        ((first == 0xd0 || first == 0xd1) && IsContinuationByte(second)) ||
        (first == 0xd2 && second >= 0x80 && second <= 0x82)) {
      return index + 2;
    }
  }
  if (HasBytes(bytes, index, 3)) {
    const uint8_t second = static_cast<uint8_t>(bytes[index + 1]);
    const uint8_t third = static_cast<uint8_t>(bytes[index + 2]);
    if ((first == 0xe2 && second == 0x80 && third >= 0x90 && third <= 0xa7) ||
        (first == 0xe3 && second >= 0x90 && second <= 0xbf &&
         IsContinuationByte(third)) ||
        (first >= 0xe4 && first <= 0xe9 && IsContinuationByte(second) &&
         IsContinuationByte(third))) {
      return index + 3;
    }
  }
  if (first == 0xf0 && HasBytes(bytes, index, 4)) {
    const uint8_t second = static_cast<uint8_t>(bytes[index + 1]);
    const uint8_t third = static_cast<uint8_t>(bytes[index + 2]);
    const uint8_t fourth = static_cast<uint8_t>(bytes[index + 3]);
    if (second == 0x9f && IsContinuationByte(fourth) &&
        ((third >= 0x8c && third <= 0x8e) ||
         (third == 0x8f && fourth <= 0xba) ||
         (third >= 0x90 && third <= 0xab))) {
      return index + 4;
    }
  }
  return 0;
}

size_t CommonExtendSequenceEnd(const std::string& bytes, size_t index) {
  // U+0300..U+036F, U+FE00..U+FE0F, and U+1F3FB..U+1F3FF all have
  // Grapheme_Cluster_Break=Extend in ICU 77 and 78.
  DCHECK_LT(index, bytes.size());
  const uint8_t first = static_cast<uint8_t>(bytes[index]);
  if (HasBytes(bytes, index, 2)) {
    const uint8_t second = static_cast<uint8_t>(bytes[index + 1]);
    if ((first == 0xcc && IsContinuationByte(second)) ||
        (first == 0xcd && second >= 0x80 && second <= 0xaf)) {
      return index + 2;
    }
  }
  if (first == 0xef && HasBytes(bytes, index, 3) &&
      static_cast<uint8_t>(bytes[index + 1]) == 0xb8) {
    const uint8_t third = static_cast<uint8_t>(bytes[index + 2]);
    if (third >= 0x80 && third <= 0x8f) {
      return index + 3;
    }
  }
  if (first == 0xf0 && HasBytes(bytes, index, 4) &&
      static_cast<uint8_t>(bytes[index + 1]) == 0x9f &&
      static_cast<uint8_t>(bytes[index + 2]) == 0x8f) {
    const uint8_t fourth = static_cast<uint8_t>(bytes[index + 3]);
    if (fourth >= 0xbb && fourth <= 0xbf) {
      return index + 4;
    }
  }
  return 0;
}

int32_t FastCommonGraphemeEnd(const std::string& bytes, int32_t start) {
  DCHECK_GE(start, 0);
  DCHECK_LT(start, bytes.size());
  const size_t index = static_cast<size_t>(start);
  const uint8_t current = static_cast<uint8_t>(bytes[index]);
  size_t next_index;

  if (current < 0x80) {
    next_index = index + 1;
    if (current == '\r' && next_index < bytes.size() &&
        bytes[next_index] == '\n') {
      return start + 2;
    }
    if (current <= 0x1f || current == 0x7f) {
      return start + 1;
    }
  } else {
    next_index = CommonIndependentSequenceEnd(bytes, index);
    if (next_index == 0) return icu::BreakIterator::DONE;
  }

  while (next_index < bytes.size()) {
    size_t extend_end = CommonExtendSequenceEnd(bytes, next_index);
    if (extend_end == 0) break;
    next_index = extend_end;
  }
  if (next_index == bytes.size() ||
      static_cast<uint8_t>(bytes[next_index]) < 0x80 ||
      CommonIndependentSequenceEnd(bytes, next_index) != 0) {
    return static_cast<int32_t>(next_index);
  }
  return icu::BreakIterator::DONE;
}

}  // namespace

Handle<String> JSSegmentIterator::GranularityAsString(Isolate* isolate) const {
  return JSSegmenter::GetGranularityString(isolate, granularity());
}

// ecma402 #sec-createsegmentiterator
MaybeDirectHandle<JSSegmentIterator> JSSegmentIterator::Create(
    Isolate* isolate, DirectHandle<String> input_string,
    DirectHandle<Managed<icu::BreakIterator>> incoming_break_iterator,
    DirectHandle<Managed<BreakIteratorText>> incoming_text,
    JSSegmenter::Granularity granularity) {
  // Clone a copy for both the ownership and not sharing with containing and
  // other calls to the iterator because icu::BreakIterator keep the iteration
  // position internally and cannot be shared across multiple calls to
  // JSSegmentIterator::Create and JSSegments::Containing.
  std::shared_ptr<icu::BreakIterator> break_iterator{
      incoming_break_iterator->raw()->clone()};
  DCHECK_NOT_NULL(break_iterator);
  DirectHandle<Map> map(isolate->native_context()->intl_segment_iterator_map(),
                        isolate);

  // 5. Set iterator.[[IteratedStringNextSegmentCodeUnitIndex]] to 0.
  break_iterator->first();
  DirectHandle<Managed<icu::BreakIterator>> managed_break_iterator =
      Managed<icu::BreakIterator>::From(isolate, 0, break_iterator);

  // Now all properties are ready, so we can allocate the result object.
  DirectHandle<JSObject> result = isolate->factory()->NewJSObjectFromMap(map);
  DisallowGarbageCollection no_gc;
  DirectHandle<JSSegmentIterator> segment_iterator =
      Cast<JSSegmentIterator>(result);

  segment_iterator->set_flags(0);
  segment_iterator->set_granularity(granularity);
  segment_iterator->set_next_index(0);
  segment_iterator->set_icu_break_iterator(*managed_break_iterator);
  segment_iterator->set_raw_string(*input_string);
  segment_iterator->set_break_iterator_text(*incoming_text);

  return segment_iterator;
}

// ecma402 #sec-%segmentiteratorprototype%.next
MaybeDirectHandle<JSReceiver> JSSegmentIterator::Next(
    Isolate* isolate, DirectHandle<JSSegmentIterator> segment_iterator) {
  // Sketches of ideas for future performance improvements, roughly in order
  // of difficulty:
  // - Expand the ASCII grapheme fast path to more Unicode boundary classes.
  // - When we enter this function, perform a batch of calls into ICU and
  //   stash away the results, so the next couple of invocations can access
  //   them from a (Torque?) builtin without calling into C++.
  // - Implement compiler support for escape-analyzing the JSSegmentDataObject
  //   and avoid allocating it when possible.

  // TODO(v8:14681): We StackCheck here to break execution in the event of an
  // interrupt. Ordinarily in JS loops, this stack check should already be
  // occurring, however some loops implemented within CodeStubAssembler and
  // Torque builtins do not currently implement these checks. A preferable
  // solution which would benefit other iterators implemented in C++ include:
  //   1) Performing the stack check in CEntry, which would provide a solution
  //   for all methods implemented in C++.
  //
  //   2) Rewriting the loop to include an outer loop, which performs periodic
  //   stack checks every N loop bodies (where N is some arbitrary heuristic
  //   selected to allow short loop counts to run with few interruptions).
  STACK_CHECK(isolate, MaybeDirectHandle<JSReceiver>());

  Factory* factory = isolate->factory();
  icu::BreakIterator* icu_break_iterator =
      segment_iterator->icu_break_iterator()->raw();
  // 5. Let startIndex be iterator.[[IteratedStringNextSegmentCodeUnitIndex]].
  int32_t start_index;
  int32_t end_index;
  BreakIteratorText* text = segment_iterator->break_iterator_text()->raw();
  if (text->is_utf8() &&
      segment_iterator->granularity() == JSSegmenter::Granularity::GRAPHEME) {
    const uint32_t fast_start_index = segment_iterator->next_index();
    bool fast_path_active = fast_start_index != 0;
    start_index = fast_path_active ? static_cast<int32_t>(fast_start_index)
                                   : icu_break_iterator->current();
    if (start_index == icu::BreakIterator::DONE ||
        start_index == text->length()) {
      end_index = icu::BreakIterator::DONE;
    } else {
      end_index = FastCommonGraphemeEnd(text->utf8(), start_index);
      if (end_index == icu::BreakIterator::DONE) {
        if (fast_path_active) {
          end_index = icu_break_iterator->following(start_index);
          segment_iterator->set_next_index(0);
        } else {
          end_index = icu_break_iterator->next();
        }
      } else {
        segment_iterator->set_next_index(end_index);
      }
    }
  } else {
    start_index = icu_break_iterator->current();
    // 6. Let endIndex be ! FindBoundary(segmenter, string, startIndex, after).
    end_index = icu_break_iterator->next();
  }

  // 7. If endIndex is not finite, then
  if (end_index == icu::BreakIterator::DONE) {
    // a. Return ! CreateIterResultObject(undefined, true).
    return factory->NewJSIteratorResult(isolate->factory()->undefined_value(),
                                        true);
  }

  // 8. Set iterator.[[IteratedStringNextSegmentCodeUnitIndex]] to endIndex.

  // 9. Let segmentData be ! CreateSegmentDataObject(segmenter, string,
  // startIndex, endIndex).

  DirectHandle<JSSegmentDataObject> segment_data;
  if (segment_iterator->granularity() == JSSegmenter::Granularity::GRAPHEME &&
      start_index == end_index - 1) {
    // Fast path: use cached segment string and skip avoidable handle creations.
    DirectHandle<String> segment;
    uint16_t code = segment_iterator->raw_string()->Get(start_index);
    if (code > unibrow::Latin1::kMaxChar) {
      segment = factory->LookupSingleCharacterStringFromCode(code);
    }
    DirectHandle<Number> index;
    if (!Smi::IsValid(start_index)) index = factory->NewHeapNumber(start_index);
    DirectHandle<Map> map(
        isolate->native_context()->intl_segment_data_object_map(), isolate);
    segment_data = Cast<JSSegmentDataObject>(factory->NewJSObjectFromMap(map));
    Tagged<JSSegmentDataObject> raw = *segment_data;
    DisallowHeapAllocation no_gc;
    // We can skip write barriers because {segment_data} is the last object
    // that was allocated.
    raw->set_segment(code <= unibrow::Latin1::kMaxChar
                         ? ReadOnlyRoots(isolate).single_character_string(code)
                         : *segment,
                     SKIP_WRITE_BARRIER);
    raw->set_index(
        Smi::IsValid(start_index) ? Smi::FromInt(start_index) : *index,
        SKIP_WRITE_BARRIER);
    raw->set_input(segment_iterator->raw_string(), SKIP_WRITE_BARRIER);
  } else {
    ASSIGN_RETURN_ON_EXCEPTION(
        isolate, segment_data,
        JSSegments::CreateSegmentDataObject(
            isolate, segment_iterator->granularity(), icu_break_iterator,
            direct_handle(segment_iterator->raw_string(), isolate),
            *segment_iterator->break_iterator_text()->raw(), start_index,
            end_index));
  }

  // 10. Return ! CreateIterResultObject(segmentData, false).
  return factory->NewJSIteratorResult(segment_data, false);
}

}  // namespace internal
}  // namespace v8
