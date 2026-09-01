// Copyright 2012 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/regexp/regexp.h"

#include "src/base/strings.h"
#include "src/codegen/compilation-cache.h"
#include "src/diagnostics/code-tracer.h"
#include "src/execution/interrupts-scope.h"
#include "src/heap/heap-inl.h"
#include "src/objects/js-regexp-inl.h"
#include "src/regexp/experimental/experimental.h"
#include "src/regexp/regexp-ast-printer.h"
#include "src/regexp/regexp-bytecode-generator.h"
#include "src/regexp/regexp-bytecodes.h"
#include "src/regexp/regexp-code-generator.h"
#include "src/regexp/regexp-compiler.h"
#include "src/regexp/regexp-dotprinter.h"
#include "src/regexp/regexp-graph-printer.h"
#include "src/regexp/regexp-interpreter.h"
#include "src/regexp/regexp-macro-assembler-arch.h"
#include "src/regexp/regexp-macro-assembler-tracer.h"
#include "src/regexp/regexp-parser.h"
#include "src/regexp/regexp-stack.h"
#include "src/regexp/regexp-utils.h"
#include "src/strings/string-search.h"
#include "src/strings/unicode-inl.h"
#include "src/strings/unicode.h"
#include "src/utils/ostreams.h"

namespace v8 {
namespace internal {

using namespace regexp_compiler_constants;  // NOLINT(build/namespaces)

class RegExpImpl final : public AllStatic {
 public:
  // Returns a string representation of a regular expression.
  // Implements RegExp.prototype.toString, see ECMA-262 section 15.10.6.4.
  // This function calls the garbage collector if necessary.
  static DirectHandle<String> ToString(DirectHandle<Object> value);

  // Prepares a JSRegExp object with Irregexp-specific data.
  static void IrregexpInitialize(Isolate* isolate, DirectHandle<JSRegExp> re,
                                 DirectHandle<String> pattern,
                                 RegExpFlags flags, int capture_count,
                                 uint32_t backtrack_limit, uint32_t bit_field);

  // Prepare a RegExp for being executed one or more times (using
  // IrregexpExecOnce) on the subject.
  // This ensures that the regexp is compiled for the subject, and that
  // the subject is flat.
  // Returns the number of integer spaces required by IrregexpExecOnce
  // as its "registers" argument.  If the regexp cannot be compiled,
  // an exception is thrown as indicated by a negative return value.
  static int IrregexpPrepare(Isolate* isolate,
                             DirectHandle<IrRegExpData> regexp_data,
                             DirectHandle<String> subject);

  static void AtomCompile(Isolate* isolate, DirectHandle<JSRegExp> re,
                          DirectHandle<String> pattern, RegExpFlags flags,
                          DirectHandle<String> match_pattern);

  static int AtomExecRaw(Isolate* isolate,
                         DirectHandle<AtomRegExpData> regexp_data,
                         DirectHandle<String> subject, int index,
                         int32_t* result_offsets_vector,
                         int result_offsets_vector_length);
  static int AtomExecRaw(Isolate* isolate, const String::FlatContent& pattern,
                         const String::FlatContent& subject, int index,
                         RegExpFlags flags, int32_t* result_offsets_vector,
                         int result_offsets_vector_length,
                         const DisallowGarbageCollection& no_gc);

  static int AtomExec(Isolate* isolate,
                      DirectHandle<AtomRegExpData> regexp_data,
                      DirectHandle<String> subject, int index,
                      int32_t* result_offsets_vector,
                      int result_offsets_vector_length);

  // Execute a regular expression on the subject, starting from index.
  // If matching succeeds, return the number of matches.  This can be larger
  // than one in the case of global regular expressions.
  // The captures and subcaptures are stored into the registers vector.
  // If matching fails, returns RE_FAILURE.
  // If execution fails, sets an exception and returns RE_EXCEPTION.
  static int IrregexpExecRaw(Isolate* isolate,
                             DirectHandle<IrRegExpData> regexp_data,
                             DirectHandle<String> subject, int index,
                             int32_t* output, int output_size);

  // Execute an Irregexp bytecode pattern. Returns the number of matches, or an
  // empty handle in case of an exception.
  V8_WARN_UNUSED_RESULT static std::optional<int> IrregexpExec(
      Isolate* isolate, DirectHandle<IrRegExpData> regexp_data,
      DirectHandle<String> subject, int index, int32_t* result_offsets_vector,
      uint32_t result_offsets_vector_length);

  static bool CompileIrregexpFromSource(
      Isolate* isolate, DirectHandle<IrRegExpData> re_data,
      DirectHandle<String> sample_subject, bool is_one_byte,
      RegExpCompilationTarget compilation_target);
  static bool CompileIrregexpFromBytecode(Isolate* isolate,
                                          DirectHandle<IrRegExpData> re_data,
                                          DirectHandle<String> sample_subject,
                                          bool is_one_byte);
  static inline bool EnsureCompiledIrregexp(Isolate* isolate,
                                            DirectHandle<IrRegExpData> re_data,
                                            DirectHandle<String> sample_subject,
                                            bool is_one_byte);

  // Returns true on success, false on failure.
  static bool Compile(Isolate* isolate, Zone* zone, RegExpCompileData* input,
                      RegExpFlags flags, DirectHandle<String> pattern,
                      DirectHandle<String> sample_subject,
                      DirectHandle<IrRegExpData> re_data, bool is_one_byte);
};

// static
bool RegExp::CanGenerateBytecode() {
  return v8_flags.regexp_interpret_all || v8_flags.regexp_tier_up;
}

// static
bool RegExp::VerifyFlags(RegExpFlags flags) {
  if (IsUnicode(flags) && IsUnicodeSets(flags)) return false;
  return true;
}

// static
template <class CharT>
bool RegExp::VerifySyntax(Zone* zone, uintptr_t stack_limit, const CharT* input,
                          int input_length, RegExpFlags flags,
                          RegExpError* regexp_error_out,
                          const DisallowGarbageCollection& no_gc) {
  RegExpCompileData data;
  bool pattern_is_valid = RegExpParser::VerifyRegExpSyntax(
      zone, stack_limit, input, input_length, flags, &data, no_gc);
  *regexp_error_out = data.error;
  return pattern_is_valid;
}

template bool RegExp::VerifySyntax<uint8_t>(Zone*, uintptr_t, const uint8_t*,
                                            int, RegExpFlags,
                                            RegExpError* regexp_error_out,
                                            const DisallowGarbageCollection&);
template bool RegExp::VerifySyntax<base::uc16>(
    Zone*, uintptr_t, const base::uc16*, int, RegExpFlags,
    RegExpError* regexp_error_out, const DisallowGarbageCollection&);

MaybeDirectHandle<Object> RegExp::ThrowRegExpException(
    Isolate* isolate, RegExpFlags flags, DirectHandle<String> pattern,
    RegExpError error) {
  base::Vector<const char> error_data =
      base::CStrVector(RegExpErrorString(error));
  DirectHandle<String> error_text =
      isolate->factory()
          ->NewStringFromOneByte(base::Vector<const uint8_t>::cast(error_data))
          .ToHandleChecked();
  DirectHandle<String> flag_string =
      JSRegExp::StringFromFlags(isolate, JSRegExp::AsJSRegExpFlags(flags));
  THROW_NEW_ERROR(isolate, NewSyntaxError(MessageTemplate::kMalformedRegExp,
                                          pattern, flag_string, error_text));
}

void RegExp::ThrowRegExpException(Isolate* isolate,
                                  DirectHandle<RegExpData> re_data,
                                  RegExpError error_text) {
  USE(ThrowRegExpException(isolate, JSRegExp::AsRegExpFlags(re_data->flags()),
                           direct_handle(re_data->source(), isolate),
                           error_text));
}

bool RegExp::IsUnmodifiedRegExp(Isolate* isolate,
                                DirectHandle<JSRegExp> regexp) {
  return RegExpUtils::IsUnmodifiedRegExp(isolate, regexp);
}

namespace {

// Identifies the sort of regexps where the regexp engine is faster
// than the code used for atom matches.
bool HasFewDifferentCharacters(DirectHandle<String> pattern) {
  uint32_t length = std::min(kMaxLookaheadForBoyerMoore, pattern->length());
  if (length <= kPatternTooShortForBoyerMoore) return false;
  const int kMod = 128;
  bool character_found[kMod];
  uint32_t different = 0;
  memset(&character_found[0], 0, sizeof(character_found));
  for (uint32_t i = 0; i < length; i++) {
    int ch = (pattern->Get(i) & (kMod - 1));
    if (!character_found[ch]) {
      character_found[ch] = true;
      different++;
      // We declare a regexp low-alphabet if it has at least 3 times as many
      // characters as it has different characters.
      if (different * 3 > length) return false;
    }
  }
  return true;
}

bool IsAsciiPattern(DirectHandle<String> pattern) {
  DisallowGarbageCollection no_gc;
  String::FlatContent content = pattern->GetFlatContent(no_gc);
  if (!content.IsOneByte()) return false;
  for (uint8_t byte : content.ToByteVector()) {
    if (!IsAscii(byte)) return false;
  }
  return true;
}

bool ContainsMalformedNode8Bytes(DirectHandle<String> source) {
  DCHECK(source->IsFlat());
  DisallowGarbageCollection no_gc;
  String::FlatContent content = source->GetFlatContent(no_gc);
  if (!content.IsOneByte()) return false;
  Wtf8ByteCursor cursor(content.ToByteVector(),
                        Wtf8ByteCursor::Policy::kInternalWtf8);
  while (cursor.has_next()) {
    if (cursor.DecodeNext().status == Wtf8ByteCursor::Status::kReplaced) {
      return true;
    }
  }
  return false;
}

MaybeDirectHandle<String> NewWtf8AtomString(
    Isolate* isolate, DirectHandle<String> source,
    base::Vector<const base::uc16> pattern) {
  source = String::Flatten(isolate, source);
  if (ContainsMalformedNode8Bytes(source)) {
    // The parser preserves malformed source bytes in the atom data. Keep
    // those bytes raw instead of turning U+00xx into canonical UTF-8.
    return source;
  }
  std::vector<uint8_t> bytes(pattern.length() * 3);
  unibrow::Utf8::EncodingResult encoded = unibrow::Utf8::Encode(
      pattern, reinterpret_cast<char*>(bytes.data()), bytes.size(), false,
      false);
  CHECK_EQ(encoded.characters_processed, pattern.size());
  return isolate->factory()->NewStringFromOneByte(
      base::Vector<const uint8_t>(bytes.data(), encoded.bytes_written));
}

MaybeDirectHandle<String> NewWtf8CodePointString(Isolate* isolate,
                                                  base::uc32 code_point) {
  char bytes[unibrow::Utf8::kMaxEncodedSize];
  unsigned length = unibrow::Utf8::Encode(
      bytes, code_point, unibrow::Utf16::kNoPreviousCharacter, false);
  return isolate->factory()->NewStringFromOneByte(base::Vector<const uint8_t>(
      reinterpret_cast<const uint8_t*>(bytes), length));
}

std::optional<base::Vector<const base::uc16>> GetLiteralAtomPattern(
    RegExpTree* tree, ZoneVector<base::uc16>* scratch) {
  if (tree->IsAtom()) return tree->AsAtom()->data();
  DCHECK(tree->IsText());

  ZoneList<TextElement>* elements = tree->AsText()->elements();
  for (int i = 0; i < elements->length(); i++) {
    TextElement element = elements->at(i);
    if (element.text_type() != TextElement::ATOM) return std::nullopt;
    base::Vector<const base::uc16> atom = element.atom()->data();
    scratch->insert(scratch->end(), atom.begin(), atom.end());
  }
  return base::Vector<const base::uc16>(scratch->data(), scratch->size());
}

std::optional<base::uc32> GetSingletonClassCodePoint(RegExpTree* tree,
                                                      Zone* zone) {
  if (!tree->IsClassRanges()) return std::nullopt;
  RegExpClassRanges* character_class = tree->AsClassRanges();
  if (character_class->is_negated()) return std::nullopt;
  ZoneList<CharacterRange>* ranges = character_class->ranges(zone);
  if (ranges->length() != 1) return std::nullopt;
  CharacterRange range = ranges->at(0);
  if (range.from() != range.to()) return std::nullopt;
  return range.from();
}

struct Node8ByteRange {
  uint8_t from;
  uint8_t to;
};

struct Node8ByteSequence {
  Node8ByteRange bytes[unibrow::Utf8::kMaxEncodedSize];
  int length;
};

constexpr size_t kMaxNode8ClassAlternatives = 128;

bool AddNode8ByteSequence(const Node8ByteSequence& sequence,
                          ZoneVector<Node8ByteSequence>* output) {
  if (output->size() >= kMaxNode8ClassAlternatives) return false;
  output->push_back(sequence);
  return true;
}

// Split one lexicographic interval of equally-sized UTF-8 encodings into
// products of independent byte ranges.
bool AddNode8ByteInterval(const uint8_t* lower, const uint8_t* upper,
                          int length, int position,
                          Node8ByteSequence sequence,
                          ZoneVector<Node8ByteSequence>* output) {
  if (position == length) {
    return AddNode8ByteSequence(sequence, output);
  }

  bool lower_suffix_is_min = true;
  bool upper_suffix_is_max = true;
  for (int i = position + 1; i < length; ++i) {
    lower_suffix_is_min &= lower[i] == 0x80;
    upper_suffix_is_max &= upper[i] == 0xbf;
  }
  if (lower_suffix_is_min && upper_suffix_is_max) {
    sequence.bytes[position] = {lower[position], upper[position]};
    for (int i = position + 1; i < length; ++i) {
      sequence.bytes[i] = {0x80, 0xbf};
    }
    return AddNode8ByteSequence(sequence, output);
  }

  if (lower[position] == upper[position]) {
    sequence.bytes[position] = {lower[position], lower[position]};
    return AddNode8ByteInterval(lower, upper, length, position + 1, sequence,
                                output);
  }

  uint8_t lower_upper[unibrow::Utf8::kMaxEncodedSize];
  for (int i = 0; i < length; ++i) {
    lower_upper[i] = i <= position ? lower[i] : 0xbf;
  }
  sequence.bytes[position] = {lower[position], lower[position]};
  if (!AddNode8ByteInterval(lower, lower_upper, length, position + 1,
                            sequence, output)) {
    return false;
  }

  if (lower[position] + 1 < upper[position]) {
    sequence.bytes[position] = {static_cast<uint8_t>(lower[position] + 1),
                                static_cast<uint8_t>(upper[position] - 1)};
    for (int i = position + 1; i < length; ++i) {
      sequence.bytes[i] = {0x80, 0xbf};
    }
    if (!AddNode8ByteSequence(sequence, output)) return false;
  }

  uint8_t upper_lower[unibrow::Utf8::kMaxEncodedSize];
  for (int i = 0; i < length; ++i) {
    upper_lower[i] = i <= position ? upper[i] : 0x80;
  }
  sequence.bytes[position] = {upper[position], upper[position]};
  return AddNode8ByteInterval(upper_lower, upper, length, position + 1,
                              sequence, output);
}

bool AddNode8CodePointRange(CharacterRange range,
                            ZoneVector<Node8ByteSequence>* output) {
  struct EncodingRange {
    base::uc32 from;
    base::uc32 to;
  };
  static constexpr EncodingRange kEncodingRanges[] = {
      {0, 0x7f}, {0x80, 0x7ff}, {0x800, 0xffff}, {0x10000, 0x10ffff}};
  // UTF-8 encodings are lexicographically ordered within each byte length.
  for (EncodingRange encoding_range : kEncodingRanges) {
    base::uc32 from = std::max(range.from(), encoding_range.from);
    base::uc32 to = std::min(range.to(), encoding_range.to);
    if (from > to) continue;

    char lower_chars[unibrow::Utf8::kMaxEncodedSize];
    char upper_chars[unibrow::Utf8::kMaxEncodedSize];
    unsigned length = unibrow::Utf8::Encode(
        lower_chars, from, unibrow::Utf16::kNoPreviousCharacter, false);
    unsigned upper_length = unibrow::Utf8::Encode(
        upper_chars, to, unibrow::Utf16::kNoPreviousCharacter, false);
    CHECK_EQ(length, upper_length);
    uint8_t lower[unibrow::Utf8::kMaxEncodedSize];
    uint8_t upper[unibrow::Utf8::kMaxEncodedSize];
    for (unsigned i = 0; i < length; ++i) {
      lower[i] = static_cast<uint8_t>(lower_chars[i]);
      upper[i] = static_cast<uint8_t>(upper_chars[i]);
    }
    Node8ByteSequence sequence{};
    sequence.length = static_cast<int>(length);
    if (!AddNode8ByteInterval(lower, upper, sequence.length, 0, sequence,
                              output)) {
      return false;
    }
  }
  return true;
}

RegExpTree* NewNode8ByteSequenceTree(const Node8ByteSequence& sequence,
                                     Zone* zone) {
  ZoneList<RegExpTree*>* nodes =
      zone->New<ZoneList<RegExpTree*>>(sequence.length, zone);
  int position = 0;
  while (position < sequence.length) {
    if (sequence.bytes[position].from == sequence.bytes[position].to) {
      int run_start = position;
      while (position < sequence.length &&
             sequence.bytes[position].from == sequence.bytes[position].to) {
        ++position;
      }
      int run_length = position - run_start;
      base::Vector<base::uc16> atom =
          zone->AllocateVector<base::uc16>(run_length);
      for (int i = 0; i < run_length; ++i) {
        atom[i] = sequence.bytes[run_start + i].from;
      }
      nodes->Add(zone->New<RegExpAtom>(base::Vector<const base::uc16>(
                     atom.data(), atom.length())),
                 zone);
      continue;
    }

    ZoneList<CharacterRange>* ranges = CharacterRange::List(
        zone, CharacterRange::Range(sequence.bytes[position].from,
                                    sequence.bytes[position].to));
    nodes->Add(zone->New<RegExpClassRanges>(
                   zone, ranges,
                   RegExpClassRanges::IS_CERTAINLY_ONE_CODE_POINT),
               zone);
    ++position;
  }
  if (nodes->length() == 1) return nodes->first();
  return zone->New<RegExpAlternative>(nodes);
}

RegExpTree* GetPositiveClassByteTree(RegExpTree* tree, RegExpFlags flags,
                                     Zone* zone,
                                     bool non_ascii_only = false) {
  if (!tree->IsClassRanges()) return nullptr;
  RegExpClassRanges* character_class = tree->AsClassRanges();
  if (character_class->is_negated()) return nullptr;
  ZoneList<CharacterRange>* ranges = character_class->ranges(zone);
  CharacterRange::Canonicalize(ranges);
  if (ranges->is_empty()) return nullptr;

  bool contains_non_ascii = false;
  for (CharacterRange range : *ranges) {
    // Matching U+FFFD also requires the malformed-subpart decoder fallback.
    if (range.Contains(unibrow::Utf8::kBadChar)) return nullptr;
    // Legacy syntax can split one supplementary literal into two surrogates.
    if (!IsEitherUnicode(flags) && range.from() <= 0xdfff &&
        range.to() >= 0xd800) {
      return nullptr;
    }
    contains_non_ascii |= range.to() > unibrow::Utf8::kMaxOneByteChar;
  }
  if (!contains_non_ascii) return nullptr;

  ZoneVector<Node8ByteSequence> sequences(zone);
  for (CharacterRange range : *ranges) {
    if (!AddNode8CodePointRange(range, &sequences)) return nullptr;
  }

  ZoneList<RegExpTree*>* alternatives =
      zone->New<ZoneList<RegExpTree*>>(static_cast<int>(sequences.size()),
                                      zone);
  for (const Node8ByteSequence& sequence : sequences) {
    if (non_ascii_only && sequence.length == 1) continue;
    alternatives->Add(NewNode8ByteSequenceTree(sequence, zone), zone);
  }
  if (alternatives->is_empty()) return nullptr;
  if (alternatives->length() == 1) return alternatives->first();
  return zone->New<RegExpDisjunction>(alternatives);
}

RegExpTree* UnwrapCaptureChain(RegExpTree* tree, int* capture_count) {
  while (tree->IsCapture()) {
    (*capture_count)++;
    tree = tree->AsCapture()->body();
  }
  return tree;
}

RegExpTree* GetPositiveClassQuantifierByteTree(RegExpTree* tree,
                                               RegExpFlags flags, Zone* zone) {
  if (!tree->IsQuantifier()) return nullptr;
  RegExpQuantifier* quantifier = tree->AsQuantifier();
  if (quantifier->is_possessive()) return nullptr;
  RegExpTree* byte_body =
      GetPositiveClassByteTree(quantifier->body(), flags, zone);
  if (byte_body == nullptr) return nullptr;
  return zone->New<RegExpQuantifier>(
      quantifier->min(), quantifier->max(), quantifier->quantifier_type(),
      quantifier->index(), byte_body);
}

RegExpTree* RebuildCaptureChain(RegExpTree* tree, RegExpTree* body,
                                Zone* zone) {
  if (!tree->IsCapture()) return body;
  RegExpCapture* capture = tree->AsCapture();
  RegExpTree* inner = RebuildCaptureChain(capture->body(), body, zone);
  RegExpCapture* rebuilt = zone->New<RegExpCapture>(capture->index());
  rebuilt->set_name(capture->name());
  rebuilt->set_body(inner);
  return rebuilt;
}

RegExpTree* GetPositiveAsciiClassTree(RegExpTree* tree, Zone* zone) {
  DCHECK(tree->IsClassRanges());
  ZoneList<CharacterRange>* ranges = tree->AsClassRanges()->ranges(zone);
  ZoneList<CharacterRange>* ascii_ranges =
      zone->New<ZoneList<CharacterRange>>(ranges->length(), zone);
  for (CharacterRange range : *ranges) {
    if (range.from() > unibrow::Utf8::kMaxOneByteChar) break;
    ascii_ranges->Add(
        CharacterRange::Range(
            range.from(), std::min(range.to(), unibrow::Utf8::kMaxOneByteChar)),
        zone);
  }
  if (ascii_ranges->is_empty()) return nullptr;
  return zone->New<RegExpClassRanges>(
      zone, ascii_ranges, RegExpClassRanges::IS_CERTAINLY_ONE_CODE_POINT);
}

RegExpTree* GetUnrolledAsciiCaptureTree(RegExpTree* capture_tree,
                                        RegExpTree* class_tree, int repetition,
                                        Zone* zone) {
  if (repetition == 0) return zone->New<RegExpEmpty>();
  ZoneList<RegExpTree*>* nodes =
      zone->New<ZoneList<RegExpTree*>>(repetition, zone);
  for (int i = 0; i < repetition; ++i) {
    RegExpTree* ascii_class = GetPositiveAsciiClassTree(class_tree, zone);
    DCHECK_NOT_NULL(ascii_class);
    nodes->Add(RebuildCaptureChain(capture_tree, ascii_class, zone), zone);
  }
  if (nodes->length() == 1) return nodes->first();
  return zone->New<RegExpAlternative>(nodes);
}

RegExpTree* GetCapturedPositiveClassQuantifierByteTree(RegExpTree* tree,
                                                       int capture_count,
                                                       RegExpFlags flags,
                                                       Zone* zone) {
  int outer_capture_count = 0;
  RegExpTree* quantifier_tree = UnwrapCaptureChain(tree, &outer_capture_count);
  if (!quantifier_tree->IsQuantifier()) return nullptr;
  RegExpQuantifier* quantifier = quantifier_tree->AsQuantifier();
  if (quantifier->is_possessive()) return nullptr;

  int body_capture_count = 0;
  RegExpTree* class_tree =
      UnwrapCaptureChain(quantifier->body(), &body_capture_count);
  if (body_capture_count == 0 ||
      outer_capture_count + body_capture_count != capture_count) {
    return nullptr;
  }

  RegExpTree* byte_body = GetPositiveClassByteTree(class_tree, flags, zone);
  if (byte_body == nullptr) return nullptr;
  byte_body = RebuildCaptureChain(quantifier->body(), byte_body, zone);
  RegExpTree* byte_quantifier = zone->New<RegExpQuantifier>(
      quantifier->min(), quantifier->max(), quantifier->quantifier_type(),
      quantifier->index(), byte_body);
  RegExpTree* byte_tree = RebuildCaptureChain(tree, byte_quantifier, zone);

  const int fast_repetition =
      quantifier->is_greedy() ? quantifier->max() : quantifier->min();
  static constexpr int kMaxUnrolledAsciiRepetition = 8;
  if (fast_repetition > kMaxUnrolledAsciiRepetition ||
      GetPositiveAsciiClassTree(class_tree, zone) == nullptr) {
    return byte_tree;
  }

  RegExpTree* ascii_body = GetUnrolledAsciiCaptureTree(
      quantifier->body(), class_tree, fast_repetition, zone);
  RegExpTree* ascii_tree = RebuildCaptureChain(tree, ascii_body, zone);
  ZoneList<RegExpTree*>* alternatives =
      zone->New<ZoneList<RegExpTree*>>(2, zone);
  alternatives->Add(ascii_tree, zone);
  alternatives->Add(byte_tree, zone);
  return zone->New<RegExpDisjunction>(alternatives);
}

RegExpTree* GetPositiveScalarDispatchClassTree(RegExpTree* tree,
                                               RegExpFlags flags, Zone* zone) {
  RegExpTree* non_ascii_tree = GetPositiveClassByteTree(
      tree, flags, zone, true);
  if (non_ascii_tree == nullptr) return nullptr;

  ZoneList<CharacterRange>* ranges = tree->AsClassRanges()->ranges(zone);
  ZoneList<CharacterRange>* ascii_ranges =
      zone->New<ZoneList<CharacterRange>>(ranges->length(), zone);
  for (CharacterRange range : *ranges) {
    if (range.from() > unibrow::Utf8::kMaxOneByteChar) break;
    ascii_ranges->Add(
        CharacterRange::Range(
            range.from(), std::min(range.to(), unibrow::Utf8::kMaxOneByteChar)),
        zone);
  }
  if (ascii_ranges->is_empty()) return non_ascii_tree;
  RegExpClassRanges* dispatch_class = zone->New<RegExpClassRanges>(
      zone, ascii_ranges, RegExpClassRanges::IS_CERTAINLY_ONE_CODE_POINT);
  dispatch_class->set_node8_positive_non_ascii_tree(non_ascii_tree);
  return dispatch_class;
}

RegExpTree* GetOuterCapturedPositiveClassQuantifierTree(
    RegExpTree* tree, int capture_count, RegExpFlags flags, Zone* zone,
    bool allow_exact = false) {
  int outer_capture_count = 0;
  RegExpTree* quantifier_tree = UnwrapCaptureChain(tree, &outer_capture_count);
  if (outer_capture_count == 0 || outer_capture_count != capture_count ||
      !quantifier_tree->IsQuantifier()) {
    return nullptr;
  }
  RegExpQuantifier* quantifier = quantifier_tree->AsQuantifier();
  if (quantifier->is_possessive() ||
      (!allow_exact && quantifier->min() == quantifier->max()) ||
      !quantifier->body()->IsClassRanges()) {
    return nullptr;
  }

  RegExpTree* dispatch_class =
      GetPositiveScalarDispatchClassTree(quantifier->body(), flags, zone);
  if (dispatch_class == nullptr) return nullptr;
  RegExpTree* rebuilt_quantifier = zone->New<RegExpQuantifier>(
      quantifier->min(), quantifier->max(), quantifier->quantifier_type(),
      quantifier->index(), dispatch_class);
  return RebuildCaptureChain(tree, rebuilt_quantifier, zone);
}

RegExpTree* GetExactAsciiClassRepetition(RegExpTree* class_tree, int repetition,
                                         Zone* zone) {
  if (repetition == 0) return zone->New<RegExpEmpty>();
  ZoneList<RegExpTree*>* nodes =
      zone->New<ZoneList<RegExpTree*>>(repetition, zone);
  for (int i = 0; i < repetition; ++i) {
    RegExpTree* ascii_class = GetPositiveAsciiClassTree(class_tree, zone);
    DCHECK_NOT_NULL(ascii_class);
    nodes->Add(ascii_class, zone);
  }
  if (nodes->length() == 1) return nodes->first();
  return zone->New<RegExpAlternative>(nodes);
}

RegExpTree* GetExactScalarClassRepetition(RegExpTree* class_tree,
                                          int repetition, RegExpFlags flags,
                                          Zone* zone,
                                          RegExpTree* capture_tree = nullptr) {
  ZoneList<RegExpTree*>* nodes =
      zone->New<ZoneList<RegExpTree*>>(repetition, zone);
  for (int i = 0; i < repetition; ++i) {
    RegExpTree* scalar_class =
        GetPositiveScalarDispatchClassTree(class_tree, flags, zone);
    if (scalar_class == nullptr) return nullptr;
    if (capture_tree != nullptr) {
      scalar_class = RebuildCaptureChain(capture_tree, scalar_class, zone);
    }
    nodes->Add(scalar_class, zone);
  }
  return zone->New<RegExpAlternative>(nodes);
}

RegExpTree* GetLazyAsciiClassRepetition(RegExpTree* class_tree, int minimum,
                                        int maximum, Zone* zone,
                                        RegExpTree* capture_tree = nullptr) {
  RegExpTree* optional = zone->New<RegExpEmpty>();
  for (int count = minimum; count < maximum; ++count) {
    ZoneList<RegExpTree*>* extension_nodes =
        zone->New<ZoneList<RegExpTree*>>(2, zone);
    RegExpTree* ascii_class = GetPositiveAsciiClassTree(class_tree, zone);
    DCHECK_NOT_NULL(ascii_class);
    if (capture_tree != nullptr) {
      ascii_class = RebuildCaptureChain(capture_tree, ascii_class, zone);
    }
    extension_nodes->Add(ascii_class, zone);
    extension_nodes->Add(optional, zone);

    ZoneList<RegExpTree*>* choices = zone->New<ZoneList<RegExpTree*>>(2, zone);
    choices->Add(zone->New<RegExpEmpty>(), zone);
    choices->Add(zone->New<RegExpAlternative>(extension_nodes), zone);
    optional = zone->New<RegExpDisjunction>(choices);
  }
  if (minimum == 0) return optional;

  ZoneList<RegExpTree*>* nodes =
      zone->New<ZoneList<RegExpTree*>>(minimum + 1, zone);
  for (int count = 0; count < minimum; ++count) {
    RegExpTree* ascii_class = GetPositiveAsciiClassTree(class_tree, zone);
    DCHECK_NOT_NULL(ascii_class);
    if (capture_tree != nullptr) {
      ascii_class = RebuildCaptureChain(capture_tree, ascii_class, zone);
    }
    nodes->Add(ascii_class, zone);
  }
  nodes->Add(optional, zone);
  return zone->New<RegExpAlternative>(nodes);
}

bool IsAsciiAtomWithinLength(RegExpTree* tree, int maximum_length) {
  if (!tree->IsAtom()) return false;
  RegExpAtom* atom = tree->AsAtom();
  if (atom->length() == 0 || atom->length() > maximum_length) {
    return false;
  }
  for (int i = 0; i < atom->length(); ++i) {
    if (atom->data().at(i) > 0x7f) return false;
  }
  return true;
}

RegExpTree* GetOuterCapturedPositiveClassQuantifierTailTree(
    RegExpTree* tree, int capture_count, RegExpFlags flags, Zone* zone,
    bool outer_start = false, bool allow_assertions = true) {
  if (!tree->IsAlternative()) return nullptr;
  ZoneList<RegExpTree*>* nodes = tree->AsAlternative()->nodes();
  static constexpr int kMaxExistingAsciiAtomLength = 8;
  static constexpr int kMaxBodyAsciiAtomLength = 32;
  int first_core_index = 0;
  int core_end_index = nodes->length();
  RegExpAssertion* start_assertion = nullptr;
  RegExpAssertion* end_assertion = nullptr;
  if (allow_assertions && nodes->at(first_core_index)->IsAssertion() &&
      nodes->at(first_core_index)->AsAssertion()->assertion_type() ==
          RegExpAssertion::Type::START_OF_INPUT) {
    start_assertion = nodes->at(first_core_index++)->AsAssertion();
  }
  if (start_assertion != nullptr && first_core_index < core_end_index &&
      nodes->at(core_end_index - 1)->IsAssertion() &&
      nodes->at(core_end_index - 1)->AsAssertion()->assertion_type() ==
          RegExpAssertion::Type::END_OF_INPUT) {
    end_assertion = nodes->at(--core_end_index)->AsAssertion();
  }
  const int core_length = core_end_index - first_core_index;
  int captured_term_index = first_core_index;
  RegExpAtom* prefix = nullptr;
  if (core_length == 3) {
    if (!IsAsciiAtomWithinLength(nodes->at(first_core_index),
                                 kMaxBodyAsciiAtomLength)) {
      return nullptr;
    }
    prefix = nodes->at(first_core_index)->AsAtom();
    captured_term_index++;
  } else if (core_length != 2) {
    return nullptr;
  }
  if (!IsAsciiAtomWithinLength(nodes->at(captured_term_index + 1),
                               kMaxBodyAsciiAtomLength)) {
    return nullptr;
  }
  RegExpAtom* tail = nodes->at(captured_term_index + 1)->AsAtom();
  const bool has_medium_ascii_atom =
      (prefix != nullptr && prefix->length() > kMaxExistingAsciiAtomLength) ||
      tail->length() > kMaxExistingAsciiAtomLength;
  RegExpTree* captured_term = nodes->at(captured_term_index);

  int outer_capture_count = 0;
  RegExpTree* quantifier_tree =
      UnwrapCaptureChain(captured_term, &outer_capture_count);
  if (!quantifier_tree->IsQuantifier()) return nullptr;
  RegExpQuantifier* quantifier = quantifier_tree->AsQuantifier();
  int body_capture_count = 0;
  RegExpTree* class_tree =
      UnwrapCaptureChain(quantifier->body(), &body_capture_count);
  const bool is_pure_outer = outer_capture_count > 0 &&
                             outer_capture_count == capture_count &&
                             body_capture_count == 0;
  const bool is_body_or_mixed =
      body_capture_count > 0 &&
      outer_capture_count + body_capture_count == capture_count;
  if ((!is_pure_outer && !is_body_or_mixed) || !class_tree->IsClassRanges()) {
    return nullptr;
  }
  if (has_medium_ascii_atom && !is_body_or_mixed) return nullptr;
  const bool is_pure_outer_unbounded =
      is_pure_outer && quantifier->max() == RegExpTree::kInfinity;
  if ((start_assertion != nullptr || outer_start) && outer_capture_count > 0 &&
      quantifier->max() == RegExpTree::kInfinity) {
    return nullptr;
  }
  static constexpr int kMaxAsciiTailRepetition = 8;
  if ((!quantifier->is_greedy() && !quantifier->is_non_greedy()) ||
      (quantifier->max() == RegExpTree::kInfinity && !is_body_or_mixed &&
       !is_pure_outer_unbounded) ||
      (quantifier->max() != RegExpTree::kInfinity &&
       quantifier->max() > kMaxAsciiTailRepetition && !is_body_or_mixed) ||
      (quantifier->min() == quantifier->max() && quantifier->min() < 2)) {
    return nullptr;
  }

  RegExpTree* suffix;
  if (quantifier->min() == quantifier->max() &&
      quantifier->max() <= kMaxAsciiTailRepetition &&
      (capture_count > 1 || body_capture_count > 0)) {
    RegExpTree* scalar_choice = GetExactScalarClassRepetition(
        class_tree, quantifier->min(), flags, zone,
        body_capture_count > 0 ? quantifier->body() : nullptr);
    if (scalar_choice == nullptr) return nullptr;
    RegExpTree* scalar_capture =
        RebuildCaptureChain(captured_term, scalar_choice, zone);
    ZoneList<RegExpTree*>* scalar_nodes =
        zone->New<ZoneList<RegExpTree*>>(2, zone);
    scalar_nodes->Add(scalar_capture, zone);
    scalar_nodes->Add(tail, zone);
    suffix = zone->New<RegExpAlternative>(scalar_nodes);
  } else {
    RegExpTree* scalar_term;
    if (body_capture_count == 0) {
      scalar_term = GetOuterCapturedPositiveClassQuantifierTree(
          captured_term, capture_count, flags, zone, true);
    } else {
      RegExpTree* scalar_body =
          GetPositiveScalarDispatchClassTree(class_tree, flags, zone);
      if (scalar_body == nullptr) return nullptr;
      scalar_body = RebuildCaptureChain(quantifier->body(), scalar_body, zone);
      RegExpTree* scalar_quantifier = zone->New<RegExpQuantifier>(
          quantifier->min(), quantifier->max(), quantifier->quantifier_type(),
          quantifier->index(), scalar_body);
      scalar_term = RebuildCaptureChain(captured_term, scalar_quantifier, zone);
    }
    if (scalar_term == nullptr) return nullptr;
    ZoneList<RegExpTree*>* scalar_nodes =
        zone->New<ZoneList<RegExpTree*>>(2, zone);
    scalar_nodes->Add(scalar_term, zone);
    scalar_nodes->Add(tail, zone);
    RegExpTree* scalar_fallback = zone->New<RegExpAlternative>(scalar_nodes);

    if (quantifier->max() == RegExpTree::kInfinity ||
        quantifier->max() > kMaxAsciiTailRepetition ||
        GetPositiveAsciiClassTree(class_tree, zone) == nullptr) {
      suffix = scalar_fallback;
    } else {
      RegExpTree* ascii_choice;
      if (quantifier->min() == quantifier->max()) {
        ascii_choice =
            GetExactAsciiClassRepetition(class_tree, quantifier->min(), zone);
      } else if (quantifier->is_greedy()) {
        ZoneList<RegExpTree*>* repetitions = zone->New<ZoneList<RegExpTree*>>(
            quantifier->max() - quantifier->min() + 1, zone);
        for (int count = quantifier->max(); count >= quantifier->min();
             --count) {
          RegExpTree* repetition =
              body_capture_count == 0
                  ? GetExactAsciiClassRepetition(class_tree, count, zone)
                  : GetUnrolledAsciiCaptureTree(quantifier->body(), class_tree,
                                                count, zone);
          repetitions->Add(repetition, zone);
        }
        ascii_choice = zone->New<RegExpDisjunction>(repetitions);
      } else {
        ascii_choice = GetLazyAsciiClassRepetition(
            class_tree, quantifier->min(), quantifier->max(), zone,
            body_capture_count > 0 ? quantifier->body() : nullptr);
      }
      RegExpTree* ascii_capture =
          RebuildCaptureChain(captured_term, ascii_choice, zone);
      ZoneList<RegExpTree*>* ascii_nodes =
          zone->New<ZoneList<RegExpTree*>>(2, zone);
      ascii_nodes->Add(ascii_capture, zone);
      ascii_nodes->Add(tail, zone);

      ZoneList<RegExpTree*>* alternatives =
          zone->New<ZoneList<RegExpTree*>>(2, zone);
      alternatives->Add(zone->New<RegExpAlternative>(ascii_nodes), zone);
      alternatives->Add(scalar_fallback, zone);
      suffix = zone->New<RegExpDisjunction>(alternatives);
    }
  }
  RegExpTree* result = suffix;
  if (prefix != nullptr) {
    ZoneList<RegExpTree*>* prefixed_nodes =
        zone->New<ZoneList<RegExpTree*>>(2, zone);
    prefixed_nodes->Add(prefix, zone);
    prefixed_nodes->Add(result, zone);
    result = zone->New<RegExpAlternative>(prefixed_nodes);
  }
  if (start_assertion == nullptr && end_assertion == nullptr) return result;
  ZoneList<RegExpTree*>* anchored_nodes = zone->New<ZoneList<RegExpTree*>>(
      1 + (start_assertion != nullptr) + (end_assertion != nullptr), zone);
  if (start_assertion != nullptr) anchored_nodes->Add(start_assertion, zone);
  anchored_nodes->Add(result, zone);
  if (end_assertion != nullptr) anchored_nodes->Add(end_assertion, zone);
  return zone->New<RegExpAlternative>(anchored_nodes);
}

RegExpTree* GetTopLevelDisjunctionCapturedPositiveClassQuantifierTailTree(
    RegExpTree* tree, int capture_count, RegExpFlags flags, Zone* zone) {
  RegExpGroup* group = nullptr;
  if (tree->IsGroup()) {
    group = tree->AsGroup();
    if (group->flags() != flags) return nullptr;
    tree = group->body();
  }
  RegExpDisjunction* disjunction = nullptr;
  RegExpAssertion* start_assertion = nullptr;
  RegExpAssertion* end_assertion = nullptr;
  if (tree->IsDisjunction()) {
    disjunction = tree->AsDisjunction();
  } else if (tree->IsAlternative()) {
    ZoneList<RegExpTree*>* nodes = tree->AsAlternative()->nodes();
    if ((nodes->length() != 2 && nodes->length() != 3) ||
        !nodes->first()->IsAssertion() ||
        nodes->first()->AsAssertion()->assertion_type() !=
            RegExpAssertion::Type::START_OF_INPUT) {
      return nullptr;
    }
    start_assertion = nodes->first()->AsAssertion();
    RegExpTree* middle = nodes->at(1);
    if (middle->IsGroup() && middle->AsGroup()->body()->IsDisjunction()) {
      group = middle->AsGroup();
      if (group->flags() != flags) return nullptr;
      disjunction = group->body()->AsDisjunction();
    } else if (middle->IsDisjunction()) {
      disjunction = middle->AsDisjunction();
    } else {
      return nullptr;
    }
    if (nodes->length() == 3) {
      if (!nodes->at(2)->IsAssertion() ||
          nodes->at(2)->AsAssertion()->assertion_type() !=
              RegExpAssertion::Type::END_OF_INPUT) {
        return nullptr;
      }
      end_assertion = nodes->at(2)->AsAssertion();
    }
  } else {
    return nullptr;
  }

  ZoneList<RegExpTree*>* original = disjunction->alternatives();
  RegExpTree* replacement = GetOuterCapturedPositiveClassQuantifierTailTree(
      original->first(), capture_count, flags, zone,
      start_assertion != nullptr, true);
  if (replacement == nullptr) return nullptr;
  ZoneList<RegExpTree*>* alternatives =
      zone->New<ZoneList<RegExpTree*>>(original->length(), zone);
  alternatives->Add(replacement, zone);
  for (int i = 1; i < original->length(); ++i) {
    alternatives->Add(original->at(i), zone);
  }

  RegExpTree* result = zone->New<RegExpDisjunction>(alternatives);
  if (group != nullptr) {
    result = zone->New<RegExpGroup>(result, group->flags());
  }
  if (start_assertion != nullptr) {
    ZoneList<RegExpTree*>* anchored_nodes =
        zone->New<ZoneList<RegExpTree*>>(2 + (end_assertion != nullptr), zone);
    anchored_nodes->Add(start_assertion, zone);
    anchored_nodes->Add(result, zone);
    if (end_assertion != nullptr) anchored_nodes->Add(end_assertion, zone);
    result = zone->New<RegExpAlternative>(anchored_nodes);
  }
  return result;
}

RegExpTree* GetCaptureWrappedClass(RegExpTree* tree, int capture_count) {
  int wrapper_count = 0;
  while (tree->IsCapture()) {
    wrapper_count++;
    tree = tree->AsCapture()->body();
  }
  if (wrapper_count != capture_count || !tree->IsClassRanges()) return nullptr;
  return tree;
}

RegExpTree* GetOuterCaptureWrappedExactClass(RegExpTree* tree,
                                             int capture_count,
                                             int* exact_repetition,
                                             int* outer_capture_count) {
  int outer_count = 0;
  while (tree->IsCapture()) {
    outer_count++;
    tree = tree->AsCapture()->body();
  }
  if (outer_count == 0 || !tree->IsQuantifier()) return nullptr;

  RegExpQuantifier* quantifier = tree->AsQuantifier();
  if ((!quantifier->is_greedy() && !quantifier->is_non_greedy()) ||
      quantifier->min() < 2 || quantifier->min() != quantifier->max()) {
    return nullptr;
  }

  tree = quantifier->body();
  int body_count = 0;
  while (tree->IsCapture()) {
    body_count++;
    tree = tree->AsCapture()->body();
  }
  if (outer_count + body_count != capture_count || !tree->IsClassRanges()) {
    return nullptr;
  }

  *exact_repetition = quantifier->min();
  *outer_capture_count = outer_count;
  return tree;
}

RegExpTree* GetMixedCaptureWrappedGreedyRunClass(
    RegExpTree* tree, int capture_count, int* outer_capture_count) {
  int outer_count = 0;
  while (tree->IsCapture()) {
    outer_count++;
    tree = tree->AsCapture()->body();
  }
  if (outer_count == 0 || !tree->IsQuantifier()) return nullptr;

  RegExpQuantifier* quantifier = tree->AsQuantifier();
  if (!quantifier->is_greedy() ||
      (quantifier->min() != 0 && quantifier->min() != 1) ||
      quantifier->max() != RegExpTree::kInfinity) {
    return nullptr;
  }

  tree = quantifier->body();
  int body_count = 0;
  while (tree->IsCapture()) {
    body_count++;
    tree = tree->AsCapture()->body();
  }
  if (body_count == 0 || outer_count + body_count != capture_count ||
      !tree->IsClassRanges()) {
    return nullptr;
  }

  *outer_capture_count = outer_count;
  return tree;
}

ZoneList<CharacterRange>* GetNode8DecoderClassRanges(
    RegExpTree* tree, RegExpFlags flags, Zone* zone, bool force_decoder,
    bool* is_negated) {
  if (!tree->IsClassRanges()) return nullptr;
  RegExpClassRanges* character_class = tree->AsClassRanges();
  ZoneList<CharacterRange>* ranges = character_class->ranges(zone);
  CharacterRange::Canonicalize(ranges);
  if (!IsEitherUnicode(flags)) {
    for (CharacterRange range : *ranges) {
      if (range.from() <= 0xdfff && range.to() >= 0xd800) return nullptr;
    }
  }

  *is_negated = character_class->is_negated();
  if (*is_negated || force_decoder) return ranges;
  for (CharacterRange range : *ranges) {
    if (range.Contains(unibrow::Utf8::kBadChar)) return ranges;
  }
  return nullptr;
}

constexpr uint32_t kNode8ClassExactRepetitionTag = uint32_t{1} << 31;
constexpr uint32_t kNode8ClassExactRepetitionMarker = 0x4e384551;
constexpr uint32_t kNode8ClassExactOuterCaptureMarker = 0x4e390000;
constexpr uint32_t kNode8ClassExactOuterCaptureMask = 0xffff0000;
constexpr uint32_t kNode8ClassRunOuterCaptureTag = uint32_t{1} << 30;
constexpr uint32_t kNode8ClassRunOuterCaptureMask =
    kNode8ClassRunOuterCaptureTag - 1;
constexpr uint32_t kNode8ClassRunOuterCaptureMarker = 0x4e385255;

DirectHandle<TrustedByteArray> NewNode8ClassRangeTable(
    Isolate* isolate, ZoneList<CharacterRange>* ranges, int exact_repetition,
    int outer_capture_count) {
  static constexpr int kBytesPerRange = 2 * sizeof(uint32_t);
  const int metadata_records =
      exact_repetition >= 0 || outer_capture_count > 0 ? 1 : 0;
  CHECK_LE(ranges->length() + metadata_records,
           TrustedByteArray::kMaxLength / kBytesPerRange);
  DirectHandle<TrustedByteArray> table =
      isolate->factory()->NewTrustedByteArray(
          (ranges->length() + metadata_records) * kBytesPerRange);
  for (int i = 0; i < ranges->length(); ++i) {
    table->set_int(i * kBytesPerRange, ranges->at(i).from());
    table->set_int(i * kBytesPerRange + sizeof(uint32_t), ranges->at(i).to());
  }
  if (exact_repetition >= 0) {
    CHECK_LE(exact_repetition, RegExpTree::kInfinity);
    CHECK_GE(outer_capture_count, 0);
    CHECK_LE(outer_capture_count,
             static_cast<int>(~kNode8ClassExactOuterCaptureMask));
    const int offset = ranges->length() * kBytesPerRange;
    table->set_int(
        offset, kNode8ClassExactRepetitionTag |
                    static_cast<uint32_t>(exact_repetition));
    const uint32_t marker =
        outer_capture_count == 0
            ? kNode8ClassExactRepetitionMarker
            : kNode8ClassExactOuterCaptureMarker | outer_capture_count;
    table->set_int(offset + sizeof(uint32_t), marker);
  } else if (outer_capture_count > 0) {
    CHECK_LE(outer_capture_count,
             static_cast<int>(kNode8ClassRunOuterCaptureMask));
    const int offset = ranges->length() * kBytesPerRange;
    table->set_int(offset, kNode8ClassRunOuterCaptureTag |
                               static_cast<uint32_t>(outer_capture_count));
    table->set_int(offset + sizeof(uint32_t), kNode8ClassRunOuterCaptureMarker);
  }
  return table;
}

}  // namespace

// Generic RegExp methods. Dispatches to implementation specific methods.

// static
MaybeDirectHandle<Object> RegExp::Compile(Isolate* isolate,
                                          DirectHandle<JSRegExp> re,
                                          DirectHandle<String> pattern,
                                          RegExpFlags flags,
                                          uint32_t backtrack_limit) {
  DCHECK(pattern->IsFlat());

  // Caching is based only on the pattern and flags, but code also differs when
  // a backtrack limit is set. A present backtrack limit is very much *not* the
  // common case, so just skip the cache for these.
  const bool is_compilation_cache_enabled =
      (backtrack_limit == JSRegExp::kNoBacktrackLimit);

  Zone zone(isolate->allocator(), ZONE_NAME);
  CompilationCache* compilation_cache = nullptr;
  if (is_compilation_cache_enabled) {
    compilation_cache = isolate->compilation_cache();
    MaybeDirectHandle<RegExpData> maybe_cached =
        compilation_cache->LookupRegExp(pattern,
                                        JSRegExp::AsJSRegExpFlags(flags));
    DirectHandle<RegExpData> cached;
    if (maybe_cached.ToHandle(&cached)) {
      re->set_data(*cached);
      return re;
    }
  }

  PostponeInterruptsScope postpone(isolate);
  RegExpCompileData parse_result;
  DCHECK(!isolate->has_exception());
  if (!RegExpParser::ParseRegExpFromHeapString(isolate, &zone, pattern, flags,
                                               &parse_result)) {
    // Throw an exception if we fail to parse the pattern.
    return RegExp::ThrowRegExpException(isolate, flags, pattern,
                                        parse_result.error);
  }

  bool has_been_compiled = false;
  bool is_linear_executable = false;

  if (v8_flags.enable_experimental_regexp_engine ||
      v8_flags.enable_experimental_regexp_engine_on_excessive_backtracks) {
    is_linear_executable = ExperimentalRegExp::CanBeHandled(
        parse_result.tree, pattern, flags, parse_result.capture_count);
  }
  if (v8_flags.default_to_experimental_regexp_engine && is_linear_executable) {
    DCHECK(v8_flags.enable_experimental_regexp_engine);
    ExperimentalRegExp::Initialize(isolate, re, pattern, flags,
                                   parse_result.capture_count);
    has_been_compiled = true;
  } else if (flags & JSRegExp::kLinear) {
    DCHECK(v8_flags.enable_experimental_regexp_engine);
    if (!is_linear_executable) {
      // TODO(mbid): The error could provide a reason for why the regexp can't
      // be executed in linear time (e.g. due to back references).
      return RegExp::ThrowRegExpException(isolate, flags, pattern,
                                          RegExpError::kNotLinear);
    }
    ExperimentalRegExp::Initialize(isolate, re, pattern, flags,
                                   parse_result.capture_count);
    has_been_compiled = true;
  } else if (parse_result.simple && !IsIgnoreCase(flags) && !IsSticky(flags) &&
             (!v8_flags.utf8_string_semantics || IsAsciiPattern(pattern)) &&
             !HasFewDifferentCharacters(pattern)) {
    // Parse-tree is a single atom that is equal to the pattern.
    RegExpImpl::AtomCompile(isolate, re, pattern, flags, pattern);
    has_been_compiled = true;
  } else if ((parse_result.tree->IsAtom() ||
              (v8_flags.utf8_string_semantics &&
               parse_result.tree->IsText())) &&
             !IsSticky(flags) && parse_result.capture_count == 0) {
    // The pattern source might (?) contain escape sequences, but they're
    // resolved in atom_string.
    ZoneVector<base::uc16> compound_atom(&zone);
    std::optional<base::Vector<const base::uc16>> atom_pattern =
        GetLiteralAtomPattern(parse_result.tree, &compound_atom);
    if (atom_pattern.has_value()) {
      DirectHandle<String> atom_string;
      if (v8_flags.utf8_string_semantics) {
        ASSIGN_RETURN_ON_EXCEPTION(
            isolate, atom_string,
            NewWtf8AtomString(isolate, pattern, atom_pattern.value()));
      } else {
        ASSIGN_RETURN_ON_EXCEPTION(
            isolate, atom_string,
            isolate->factory()->NewStringFromTwoByte(atom_pattern.value()));
      }
      if (!IsIgnoreCase(flags) && !HasFewDifferentCharacters(atom_string)) {
        RegExpImpl::AtomCompile(isolate, re, pattern, flags, atom_string);
        has_been_compiled = true;
      }
    }
  } else if (v8_flags.utf8_string_semantics && !IsIgnoreCase(flags) &&
             !IsSticky(flags) && parse_result.capture_count == 0 &&
             parse_result.tree->IsClassRanges()) {
    std::optional<base::uc32> code_point =
        GetSingletonClassCodePoint(parse_result.tree, &zone);
    if (code_point.has_value() &&
        code_point.value() != unibrow::Utf8::kBadChar &&
        !ContainsMalformedNode8Bytes(pattern)) {
      DirectHandle<String> atom_string;
      ASSIGN_RETURN_ON_EXCEPTION(
          isolate, atom_string,
          NewWtf8CodePointString(isolate, code_point.value()));
      RegExpImpl::AtomCompile(isolate, re, pattern, flags, atom_string);
      has_been_compiled = true;
    }
  }
  if (!has_been_compiled) {
    const bool can_be_zero_length = parse_result.tree->min_match() == 0;
    const bool is_wtf8_dot = v8_flags.utf8_string_semantics &&
                             pattern->length() == 1 && pattern->Get(0) == '.';
    ZoneList<CharacterRange>* node8_class_ranges = nullptr;
    bool is_wtf8_class_negated = false;
    bool is_wtf8_class_run = false;
    bool is_wtf8_class_optional = false;
    int node8_class_exact_repetition = -1;
    int node8_class_outer_capture_count = 0;
    RegExpTree* node8_class_tree = GetCaptureWrappedClass(
        parse_result.tree, parse_result.capture_count);
    if (node8_class_tree == nullptr && parse_result.capture_count > 0) {
      node8_class_tree = GetOuterCaptureWrappedExactClass(
          parse_result.tree, parse_result.capture_count,
          &node8_class_exact_repetition,
          &node8_class_outer_capture_count);
    }
    if (node8_class_tree == nullptr && parse_result.capture_count > 0) {
      node8_class_tree = GetMixedCaptureWrappedGreedyRunClass(
          parse_result.tree, parse_result.capture_count,
          &node8_class_outer_capture_count);
      if (node8_class_tree != nullptr) is_wtf8_class_run = true;
    }
    if (node8_class_tree == nullptr && parse_result.tree->IsQuantifier()) {
      RegExpQuantifier* quantifier = parse_result.tree->AsQuantifier();
      if (parse_result.capture_count == 0 && quantifier->is_greedy() &&
          quantifier->body()->IsClassRanges()) {
        if ((quantifier->min() == 0 || quantifier->min() == 1) &&
            quantifier->max() == RegExpTree::kInfinity) {
          // CanBeZeroLength distinguishes star from plus for this run bit.
          is_wtf8_class_run = true;
        } else if (quantifier->min() == 0 && quantifier->max() == 1) {
          is_wtf8_class_optional = true;
        } else if (quantifier->min() >= 2 &&
                   quantifier->min() == quantifier->max()) {
          node8_class_exact_repetition = quantifier->min();
        }
        if (is_wtf8_class_run || is_wtf8_class_optional ||
            node8_class_exact_repetition >= 0) {
          node8_class_tree = quantifier->body();
        }
      } else if (parse_result.capture_count > 0 && quantifier->is_greedy() &&
                 (quantifier->min() == 0 || quantifier->min() == 1) &&
                 quantifier->max() == RegExpTree::kInfinity) {
        node8_class_tree = GetCaptureWrappedClass(
            quantifier->body(), parse_result.capture_count);
        if (node8_class_tree != nullptr) is_wtf8_class_run = true;
      } else if (parse_result.capture_count > 0 && quantifier->is_greedy() &&
                 quantifier->min() == 0 && quantifier->max() == 1) {
        node8_class_tree = GetCaptureWrappedClass(
            quantifier->body(), parse_result.capture_count);
        if (node8_class_tree != nullptr) is_wtf8_class_optional = true;
      } else if (parse_result.capture_count > 0 &&
                 quantifier->is_non_greedy() && quantifier->min() >= 1) {
        node8_class_tree = GetCaptureWrappedClass(
            quantifier->body(), parse_result.capture_count);
        if (node8_class_tree != nullptr && quantifier->min() >= 2) {
          node8_class_exact_repetition = quantifier->min();
        }
      } else if (parse_result.capture_count > 0 && quantifier->is_greedy() &&
                 quantifier->min() >= 2 &&
                 quantifier->min() == quantifier->max()) {
        node8_class_tree = GetCaptureWrappedClass(
            quantifier->body(), parse_result.capture_count);
        if (node8_class_tree != nullptr) {
          node8_class_exact_repetition = quantifier->min();
        }
      }
    }
    if (v8_flags.utf8_string_semantics && !is_wtf8_dot &&
        !IsIgnoreCase(flags) && node8_class_tree != nullptr) {
      node8_class_ranges = GetNode8DecoderClassRanges(
          node8_class_tree, flags, &zone,
          parse_result.capture_count > 0 || is_wtf8_class_run ||
              is_wtf8_class_optional || node8_class_exact_repetition >= 0,
          &is_wtf8_class_negated);
      const bool has_only_ascii_ranges =
          node8_class_ranges != nullptr &&
          (node8_class_ranges->is_empty() ||
           node8_class_ranges->at(node8_class_ranges->length() - 1).to() <=
               unibrow::Utf8::kMaxOneByteChar);
      // A capture-free greedy run has the same byte endpoints when every
      // non-ASCII scalar has uniform membership. A positive ASCII run also
      // captures only one-byte members. Positive optional and exact ASCII
      // classes have the same endpoints, while a captured negated run must
      // decode its final scalar start.
      if (has_only_ascii_ranges &&
          ((is_wtf8_class_run &&
            (parse_result.capture_count == 0 || !is_wtf8_class_negated)) ||
           ((is_wtf8_class_optional || node8_class_exact_repetition >= 0) &&
            !is_wtf8_class_negated))) {
        node8_class_ranges = nullptr;
        is_wtf8_class_negated = false;
        is_wtf8_class_run = false;
        is_wtf8_class_optional = false;
        node8_class_exact_repetition = -1;
        node8_class_outer_capture_count = 0;
      }
      if (node8_class_ranges != nullptr &&
          ContainsMalformedNode8Bytes(pattern)) {
        node8_class_ranges = nullptr;
        is_wtf8_class_negated = false;
        is_wtf8_class_run = false;
        is_wtf8_class_optional = false;
        node8_class_exact_repetition = -1;
        node8_class_outer_capture_count = 0;
      }
    }
    const bool is_wtf8_class = node8_class_ranges != nullptr;
    if (!is_wtf8_class) {
      is_wtf8_class_run = false;
      is_wtf8_class_optional = false;
      node8_class_exact_repetition = -1;
      node8_class_outer_capture_count = 0;
    }
    using Bits = IrRegExpData::Bits;
    const uint32_t bit_field =
        Bits::CanBeZeroLengthBit::encode(can_be_zero_length) |
        Bits::IsLinearExecutableBit::encode(is_linear_executable) |
        Bits::IsWtf8DotBit::encode(is_wtf8_dot) |
        Bits::IsWtf8ClassBit::encode(is_wtf8_class) |
        Bits::IsWtf8ClassNegatedBit::encode(is_wtf8_class_negated) |
        Bits::IsWtf8ClassPlusBit::encode(is_wtf8_class_run);
    RegExpImpl::IrregexpInitialize(isolate, re, pattern, flags,
                                   parse_result.capture_count, backtrack_limit,
                                   bit_field);
    if (is_wtf8_class) {
      DirectHandle<IrRegExpData> re_data =
          direct_handle(SbxCast<IrRegExpData>(re->data(isolate)), isolate);
      DirectHandle<TrustedByteArray> table = NewNode8ClassRangeTable(
          isolate, node8_class_ranges, node8_class_exact_repetition,
          node8_class_outer_capture_count);
      re_data->set_node8_class_ranges(*table);
      DirectHandle<FixedArray> capture_name_map =
          CreateCaptureNameMap(isolate, parse_result.named_captures);
      re_data->set_capture_name_map(capture_name_map);
    }
  }
  // Compilation succeeded so the data is set on the regexp
  // and we can store it in the cache.
  DirectHandle<RegExpData> data(re->data(isolate), isolate);
  if (is_compilation_cache_enabled) {
    compilation_cache->PutRegExp(pattern, JSRegExp::AsJSRegExpFlags(flags),
                                 data);
  }

  return re;
}

// static
bool RegExp::EnsureFullyCompiled(Isolate* isolate,
                                 DirectHandle<RegExpData> re_data,
                                 DirectHandle<String> subject) {
  switch (re_data->type_tag()) {
    case RegExpData::Type::ATOM:
      return true;
    case RegExpData::Type::IRREGEXP:
      if (RegExpImpl::IrregexpPrepare(
              isolate, TrustedCast<IrRegExpData>(re_data), subject) == -1) {
        DCHECK(isolate->has_exception());
        return false;
      }
      return true;
    case RegExpData::Type::EXPERIMENTAL:
      if (!ExperimentalRegExp::IsCompiled(TrustedCast<IrRegExpData>(re_data),
                                          isolate) &&
          !ExperimentalRegExp::Compile(isolate,
                                       TrustedCast<IrRegExpData>(re_data))) {
        DCHECK(isolate->has_exception());
        return false;
      }
      return true;
  }
  UNREACHABLE();
}

// static
std::optional<int> RegExp::ExperimentalOneshotExec(
    Isolate* isolate, DirectHandle<JSRegExp> regexp,
    DirectHandle<String> subject, int index, int32_t* result_offsets_vector,
    uint32_t result_offsets_vector_length) {
  DirectHandle<RegExpData> data(regexp->data(isolate), isolate);
  return ExperimentalRegExp::OneshotExec(isolate, SbxCast<IrRegExpData>(data),
                                         subject, index, result_offsets_vector,
                                         result_offsets_vector_length);
}

// static
std::optional<int> RegExp::Exec(Isolate* isolate, DirectHandle<JSRegExp> regexp,
                                DirectHandle<String> subject, int index,
                                int32_t* result_offsets_vector,
                                uint32_t result_offsets_vector_length) {
  DirectHandle<RegExpData> data(regexp->data(isolate), isolate);
  switch (data->type_tag()) {
    case RegExpData::Type::ATOM:
      return RegExpImpl::AtomExec(isolate, TrustedCast<AtomRegExpData>(data),
                                  subject, index, result_offsets_vector,
                                  result_offsets_vector_length);
    case RegExpData::Type::IRREGEXP:
      return RegExpImpl::IrregexpExec(isolate, TrustedCast<IrRegExpData>(data),
                                      subject, index, result_offsets_vector,
                                      result_offsets_vector_length);
    case RegExpData::Type::EXPERIMENTAL:
      return ExperimentalRegExp::Exec(isolate, TrustedCast<IrRegExpData>(data),
                                      subject, index, result_offsets_vector,
                                      result_offsets_vector_length);
  }
  // This UNREACHABLE() is necessary because we don't return a value here,
  // which causes the compiler to emit potentially unsafe code for the switch
  // above. See the commit message and b/326086002 for more details.
  UNREACHABLE();
}

// static
MaybeDirectHandle<Object> RegExp::Exec_Single(
    Isolate* isolate, DirectHandle<JSRegExp> regexp,
    DirectHandle<String> subject, int index,
    DirectHandle<RegExpMatchInfo> last_match_info) {
  RegExpStackScope stack_scope(isolate);
  DirectHandle<RegExpData> data(regexp->data(isolate), isolate);
  int capture_count = data->capture_count();
  int result_offsets_vector_length =
      JSRegExp::RegistersForCaptureCount(capture_count);
  RegExpResultVectorScope result_vector_scope(isolate,
                                              result_offsets_vector_length);
  std::optional<int> result =
      RegExp::Exec(isolate, regexp, subject, index, result_vector_scope.value(),
                   result_offsets_vector_length);
  DCHECK_EQ(!result, isolate->has_exception());
  if (!result) return {};

  if (result.value() == 0) {
    return isolate->factory()->null_value();
  }

  DCHECK_EQ(result.value(), 1);
  return RegExp::SetLastMatchInfo(isolate, last_match_info, subject,
                                  capture_count, result_vector_scope.value());
}

// RegExp Atom implementation: Simple string search using indexOf.

void RegExpImpl::AtomCompile(Isolate* isolate, DirectHandle<JSRegExp> re,
                             DirectHandle<String> pattern, RegExpFlags flags,
                             DirectHandle<String> match_pattern) {
  isolate->factory()->SetRegExpAtomData(
      re, pattern, JSRegExp::AsJSRegExpFlags(flags), match_pattern);
}

namespace {

template <typename SChar, typename PChar>
int AtomExecRawImpl(Isolate* isolate, base::Vector<const SChar> subject,
                    base::Vector<const PChar> pattern, int index,
                    RegExpFlags flags, int32_t* output, int output_size,
                    const DisallowGarbageCollection& no_gc) {
  const int subject_length = subject.length();
  const int pattern_length = pattern.length();
  DCHECK_GT(pattern_length, 0);
  const int max_index = subject_length - pattern_length;

  StringSearch<PChar, SChar> search(isolate, pattern);
  for (int i = 0; i < output_size; i += JSRegExp::kAtomRegisterCount) {
    if constexpr (std::is_same_v<SChar, uint16_t>) {
      if (index > 0 && index < subject_length &&
          ShouldOptionallyStepBackToLeadSurrogate(flags)) {
        // See https://github.com/tc39/ecma262/issues/128 and
        // https://codereview.chromium.org/1608693003.
        if (unibrow::Utf16::IsTrailSurrogate(subject[index]) &&
            unibrow::Utf16::IsLeadSurrogate(subject[index - 1])) {
          index--;
        }
      }
    }

    if (index > max_index) {
      static_assert(RegExp::RE_FAILURE == 0);
      return i / JSRegExp::kAtomRegisterCount;  // Return number of matches.
    }
    index = search.Search(subject, index);
    if (index == -1) {
      static_assert(RegExp::RE_FAILURE == 0);
      return i / JSRegExp::kAtomRegisterCount;  // Return number of matches.
    } else {
      output[i] = index;  // match start
      index += pattern_length;
      output[i + 1] = index;  // match end
    }
  }

  return output_size / JSRegExp::kAtomRegisterCount;
}

}  // namespace

// static
int RegExpImpl::AtomExecRaw(Isolate* isolate,
                            DirectHandle<AtomRegExpData> regexp_data,
                            DirectHandle<String> subject, int index,
                            int32_t* result_offsets_vector,
                            int result_offsets_vector_length) {
  subject = String::Flatten(isolate, subject);

  DisallowGarbageCollection no_gc;
  Tagged<String> needle = regexp_data->pattern(isolate);
  RegExpFlags flags = JSRegExp::AsRegExpFlags(regexp_data->flags());
  String::FlatContent needle_content = needle->GetFlatContent(no_gc);
  String::FlatContent subject_content = subject->GetFlatContent(no_gc);
  return AtomExecRaw(isolate, needle_content, subject_content, index, flags,
                     result_offsets_vector, result_offsets_vector_length,
                     no_gc);
}

// static
int RegExpImpl::AtomExecRaw(Isolate* isolate,
                            const String::FlatContent& pattern,
                            const String::FlatContent& subject, int index,
                            RegExpFlags flags, int32_t* result_offsets_vector,
                            int result_offsets_vector_length,
                            const DisallowGarbageCollection& no_gc) {
  DCHECK_GE(index, 0);
  DCHECK_LE(index, subject.length());
  CHECK_EQ(result_offsets_vector_length % JSRegExp::kAtomRegisterCount, 0);
  DCHECK(pattern.IsFlat());
  DCHECK(subject.IsFlat());

  return pattern.IsOneByte()
             ? (subject.IsOneByte()
                    ? AtomExecRawImpl(isolate, subject.ToOneByteVector(),
                                      pattern.ToOneByteVector(), index, flags,
                                      result_offsets_vector,
                                      result_offsets_vector_length, no_gc)
                    : AtomExecRawImpl(isolate, subject.ToUC16Vector(),
                                      pattern.ToOneByteVector(), index, flags,
                                      result_offsets_vector,
                                      result_offsets_vector_length, no_gc))
             : (subject.IsOneByte()
                    ? AtomExecRawImpl(isolate, subject.ToOneByteVector(),
                                      pattern.ToUC16Vector(), index, flags,
                                      result_offsets_vector,
                                      result_offsets_vector_length, no_gc)
                    : AtomExecRawImpl(isolate, subject.ToUC16Vector(),
                                      pattern.ToUC16Vector(), index, flags,
                                      result_offsets_vector,
                                      result_offsets_vector_length, no_gc));
}

// static
intptr_t RegExp::AtomExecRaw(Isolate* isolate,
                             Address /* AtomRegExpData */ data_address,
                             Address /* String */ subject_address,
                             int32_t index, int32_t* result_offsets_vector,
                             int32_t result_offsets_vector_length) {
  DisallowGarbageCollection no_gc;

  auto data = SbxCast<AtomRegExpData>(Tagged<Object>(data_address));
  auto subject = Cast<String>(Tagged<Object>(subject_address));

  Tagged<String> pattern = data->pattern(isolate);
  RegExpFlags flags = JSRegExp::AsRegExpFlags(data->flags());
  String::FlatContent pattern_content = pattern->GetFlatContent(no_gc);
  String::FlatContent subject_content = subject->GetFlatContent(no_gc);
  return RegExpImpl::AtomExecRaw(isolate, pattern_content, subject_content,
                                 index, flags, result_offsets_vector,
                                 result_offsets_vector_length, no_gc);
}

int RegExpImpl::AtomExec(Isolate* isolate, DirectHandle<AtomRegExpData> re_data,
                         DirectHandle<String> subject, int index,
                         int32_t* result_offsets_vector,
                         int result_offsets_vector_length) {
  int res = AtomExecRaw(isolate, re_data, subject, index, result_offsets_vector,
                        result_offsets_vector_length);

  DCHECK(res == RegExp::RE_FAILURE || res == RegExp::RE_SUCCESS);
  return res;
}

namespace {

int Wtf8DotExecRawImpl(const String::FlatContent& subject, int index,
                       RegExpFlags flags, int32_t* output, int output_size) {
  DCHECK(subject.IsOneByte());
  DCHECK_GE(index, 0);
  DCHECK_LE(index, subject.length());
  CHECK_EQ(output_size % JSRegExp::kAtomRegisterCount, 0);

  const bool global = IsGlobal(flags);
  const bool sticky = IsSticky(flags);
  const bool dot_all = IsDotAll(flags);
  const int max_matches =
      global ? output_size / JSRegExp::kAtomRegisterCount : 1;
  int matches = 0;
  Wtf8ByteCursor cursor(subject.ToByteVector(),
                        Wtf8ByteCursor::Policy::kInternalWtf8, index);

  while (matches < max_matches && cursor.has_next()) {
    int start = static_cast<int>(cursor.position());
    Wtf8ByteCursor::Result result = cursor.DecodeNext();
    if (!dot_all && unibrow::IsLineTerminator(result.code_point)) {
      if (sticky) break;
      continue;
    }

    int offset = matches * JSRegExp::kAtomRegisterCount;
    output[offset] = start;
    output[offset + 1] = static_cast<int>(cursor.position());
    matches++;
    if (!global) break;
  }

  return matches;
}

V8_INLINE bool Node8ClassContains(Tagged<TrustedByteArray> ranges,
                                  int range_count, uint32_t single_range_from,
                                  uint32_t single_range_to,
                                  unibrow::uchar code_point) {
  if (V8_LIKELY(range_count == 1)) {
    return code_point >= single_range_from && code_point <= single_range_to;
  }
  static constexpr int kBytesPerRange = 2 * sizeof(uint32_t);
  if (V8_LIKELY(range_count == 2)) {
    uint32_t first_from = ranges->get_int(0);
    uint32_t first_to = ranges->get_int(sizeof(uint32_t));
    if (code_point >= first_from && code_point <= first_to) return true;
    return code_point >= ranges->get_int(kBytesPerRange) &&
           code_point <=
               ranges->get_int(kBytesPerRange + sizeof(uint32_t));
  }
  int low = 0;
  int high = range_count;
  while (low < high) {
    int middle = low + (high - low) / 2;
    int offset = middle * kBytesPerRange;
    uint32_t from = ranges->get_int(offset);
    uint32_t to = ranges->get_int(offset + sizeof(uint32_t));
    if (code_point < from) {
      high = middle;
    } else if (code_point > to) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

V8_INLINE unibrow::uchar DecodeNode8ClassCodePoint(
    base::Vector<const uint8_t> bytes, size_t* position) {
  if (V8_LIKELY(bytes[*position] <= unibrow::Utf8::kMaxOneByteChar)) {
    return bytes[(*position)++];
  }
  Wtf8ByteCursor cursor(bytes, Wtf8ByteCursor::Policy::kInternalWtf8,
                        *position);
  unibrow::uchar code_point = cursor.DecodeNext().code_point;
  *position = cursor.position();
  return code_point;
}

int Wtf8ClassExecRawImpl(const String::FlatContent& subject,
                         Tagged<TrustedByteArray> ranges, bool is_negated,
                         bool is_run, bool can_be_zero_length,
                         int capture_count, int index, RegExpFlags flags,
                         int32_t* output, int output_size) {
  DCHECK(subject.IsOneByte());
  DCHECK_GE(index, 0);
  DCHECK_LE(index, subject.length());
  const int registers_per_match =
      JSRegExp::RegistersForCaptureCount(capture_count);
  CHECK_GE(output_size, registers_per_match);

  const bool global = IsGlobal(flags);
  const bool sticky = IsSticky(flags);
  const int max_matches = global ? output_size / registers_per_match : 1;
  int matches = 0;
  base::Vector<const uint8_t> bytes = subject.ToByteVector();
  static constexpr int kBytesPerRange = 2 * sizeof(uint32_t);
  CHECK_EQ(ranges->length() % kBytesPerRange, 0);
  int range_count = ranges->length() / kBytesPerRange;
  int exact_repetition = -1;
  int outer_capture_count = 0;
  if (range_count > 0) {
    const int metadata_offset = (range_count - 1) * kBytesPerRange;
    const uint32_t encoded_metadata = ranges->get_int(metadata_offset);
    if ((encoded_metadata & kNode8ClassExactRepetitionTag) != 0) {
      const uint32_t marker =
          ranges->get_int(metadata_offset + sizeof(uint32_t));
      if (marker != kNode8ClassExactRepetitionMarker) {
        CHECK_EQ(marker & kNode8ClassExactOuterCaptureMask,
                 kNode8ClassExactOuterCaptureMarker);
        outer_capture_count =
            static_cast<int>(marker & ~kNode8ClassExactOuterCaptureMask);
        CHECK_GT(outer_capture_count, 0);
        CHECK_LE(outer_capture_count, capture_count);
      }
      exact_repetition = static_cast<int>(
          encoded_metadata & ~kNode8ClassExactRepetitionTag);
      CHECK_GE(exact_repetition, 2);
      range_count--;
    } else if ((encoded_metadata & kNode8ClassRunOuterCaptureTag) != 0) {
      CHECK(is_run);
      CHECK_EQ(ranges->get_int(metadata_offset + sizeof(uint32_t)),
               kNode8ClassRunOuterCaptureMarker);
      outer_capture_count =
          static_cast<int>(encoded_metadata & kNode8ClassRunOuterCaptureMask);
      CHECK_GT(outer_capture_count, 0);
      CHECK_LE(outer_capture_count, capture_count);
      range_count--;
    }
  }
  const uint32_t single_range_from =
      range_count == 1 ? ranges->get_int(0) : 0;
  const uint32_t single_range_to =
      range_count == 1 ? ranges->get_int(sizeof(uint32_t)) : 0;
  size_t position = index;
  if (exact_repetition >= 0) {
    int repeated = 0;
    size_t run_start = position;
    while (matches < max_matches && position < bytes.size()) {
      size_t scalar_start = position;
      unibrow::uchar code_point =
          DecodeNode8ClassCodePoint(bytes, &position);
      bool is_match = Node8ClassContains(ranges, range_count,
                                         single_range_from, single_range_to,
                                         code_point);
      if (is_negated) is_match = !is_match;
      if (!is_match) {
        if (sticky) break;
        repeated = 0;
        continue;
      }

      if (repeated == 0) run_start = scalar_start;
      repeated++;
      if (repeated < exact_repetition) continue;

      int offset = matches * registers_per_match;
      output[offset + RegExpCapture::StartRegister(0)] =
          static_cast<int>(run_start);
      output[offset + RegExpCapture::EndRegister(0)] =
          static_cast<int>(position);
      for (int capture = 1; capture <= outer_capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] =
            static_cast<int>(run_start);
        output[offset + RegExpCapture::EndRegister(capture)] =
            static_cast<int>(position);
      }
      for (int capture = outer_capture_count + 1;
           capture <= capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] =
            static_cast<int>(scalar_start);
        output[offset + RegExpCapture::EndRegister(capture)] =
            static_cast<int>(position);
      }
      matches++;
      if (!global) break;
      repeated = 0;
    }
    return matches;
  }
  if (!can_be_zero_length && !is_run && is_negated && range_count == 1 &&
      single_range_to <= unibrow::Utf8::kMaxOneByteChar && global &&
      capture_count > 0) {
    while (matches < max_matches && position < bytes.size()) {
      int start = static_cast<int>(position);
      uint8_t byte = bytes[position];
      if (V8_LIKELY(byte <= unibrow::Utf8::kMaxOneByteChar)) {
        position++;
        if (byte >= single_range_from && byte <= single_range_to) {
          if (sticky) break;
          continue;
        }
      } else {
        DecodeNode8ClassCodePoint(bytes, &position);
      }

      int offset = matches * registers_per_match;
      for (int capture = 0; capture <= capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] = start;
        output[offset + RegExpCapture::EndRegister(capture)] =
            static_cast<int>(position);
      }
      matches++;
    }
    return matches;
  }
  if (can_be_zero_length && !is_run && is_negated && range_count == 1 &&
      single_range_to <= unibrow::Utf8::kMaxOneByteChar && global) {
    while (matches < max_matches && position <= bytes.size()) {
      int start = static_cast<int>(position);
      size_t match_end = position;
      if (position < bytes.size()) {
        uint8_t byte = bytes[position];
        if (V8_LIKELY(byte <= unibrow::Utf8::kMaxOneByteChar)) {
          if (byte < single_range_from || byte > single_range_to) {
            match_end++;
          }
        } else {
          DecodeNode8ClassCodePoint(bytes, &match_end);
        }
      }

      int offset = matches * registers_per_match;
      output[offset + RegExpCapture::StartRegister(0)] = start;
      output[offset + RegExpCapture::EndRegister(0)] =
          static_cast<int>(match_end);
      const bool is_empty = match_end == static_cast<size_t>(start);
      const int inner_start = is_empty ? -1 : start;
      const int inner_end = is_empty ? -1 : static_cast<int>(match_end);
      for (int capture = 1; capture <= capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] = inner_start;
        output[offset + RegExpCapture::EndRegister(capture)] = inner_end;
      }
      matches++;
      if (is_empty) {
        if (match_end == bytes.size()) break;
        position = match_end + 1;
      } else {
        position = match_end;
      }
    }
    return matches;
  }
  if (can_be_zero_length && !is_run && range_count == 1) {
    while (matches < max_matches && position <= bytes.size()) {
      int start = static_cast<int>(position);
      size_t match_end = position;
      if (position < bytes.size()) {
        size_t next_position = position;
        unibrow::uchar code_point;
        if (V8_LIKELY(bytes[position] <= unibrow::Utf8::kMaxOneByteChar)) {
          code_point = bytes[position];
          next_position++;
        } else {
          code_point = DecodeNode8ClassCodePoint(bytes, &next_position);
        }
        const bool in_range = code_point >= single_range_from &&
                              code_point <= single_range_to;
        if (in_range != is_negated) match_end = next_position;
      }

      int offset = matches * registers_per_match;
      output[offset + RegExpCapture::StartRegister(0)] = start;
      output[offset + RegExpCapture::EndRegister(0)] =
          static_cast<int>(match_end);
      const bool is_empty = match_end == static_cast<size_t>(start);
      const int inner_start = is_empty ? -1 : start;
      const int inner_end = is_empty ? -1 : static_cast<int>(match_end);
      for (int capture = 1; capture <= capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] = inner_start;
        output[offset + RegExpCapture::EndRegister(capture)] = inner_end;
      }
      matches++;
      if (!global) break;
      if (is_empty) {
        if (match_end == bytes.size()) break;
        position = match_end + 1;
      } else {
        position = match_end;
      }
    }
    return matches;
  }
  if (can_be_zero_length) {
    while (matches < max_matches && position <= bytes.size()) {
      int start = static_cast<int>(position);
      size_t match_end = position;
      size_t capture_start = position;
      if (position < bytes.size()) {
        size_t next_position = position;
        unibrow::uchar code_point =
            DecodeNode8ClassCodePoint(bytes, &next_position);
        bool is_match = Node8ClassContains(ranges, range_count,
                                           single_range_from, single_range_to,
                                           code_point);
        if (is_negated) is_match = !is_match;
        if (is_match) {
          position = next_position;
          match_end = position;
          while (is_run && position < bytes.size()) {
            size_t scalar_start = position;
            next_position = position;
            code_point = DecodeNode8ClassCodePoint(bytes, &next_position);
            is_match = Node8ClassContains(ranges, range_count,
                                          single_range_from, single_range_to,
                                          code_point);
            if (is_negated) is_match = !is_match;
            if (!is_match) break;
            capture_start = scalar_start;
            position = next_position;
            match_end = position;
          }
        }
      }

      int offset = matches * registers_per_match;
      output[offset + RegExpCapture::StartRegister(0)] = start;
      output[offset + RegExpCapture::EndRegister(0)] =
          static_cast<int>(match_end);
      const bool is_empty = match_end == static_cast<size_t>(start);
      const int inner_start =
          is_empty ? -1 : static_cast<int>(capture_start);
      const int inner_end = is_empty ? -1 : static_cast<int>(match_end);
      for (int capture = 1; capture <= outer_capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] = start;
        output[offset + RegExpCapture::EndRegister(capture)] =
            static_cast<int>(match_end);
      }
      for (int capture = outer_capture_count + 1;
           capture <= capture_count; ++capture) {
        output[offset + RegExpCapture::StartRegister(capture)] = inner_start;
        output[offset + RegExpCapture::EndRegister(capture)] = inner_end;
      }
      matches++;
      if (!global) break;
      if (is_empty) {
        if (match_end == bytes.size()) break;
        position = match_end + 1;
      } else {
        position = match_end;
      }
    }
    return matches;
  }

  while (matches < max_matches && position < bytes.size()) {
    int start = static_cast<int>(position);
    unibrow::uchar code_point =
        DecodeNode8ClassCodePoint(bytes, &position);
    bool is_match = Node8ClassContains(ranges, range_count, single_range_from,
                                       single_range_to, code_point);
    if (is_negated) is_match = !is_match;
    if (!is_match) {
      if (sticky) break;
      continue;
    }

    size_t match_end = position;
    size_t capture_start = static_cast<size_t>(start);
    if (is_run) {
      while (position < bytes.size()) {
        size_t scalar_start = position;
        unibrow::uchar next_code_point =
            DecodeNode8ClassCodePoint(bytes, &position);
        bool next_is_match = Node8ClassContains(
            ranges, range_count, single_range_from, single_range_to,
            next_code_point);
        if (is_negated) next_is_match = !next_is_match;
        if (!next_is_match) break;
        capture_start = scalar_start;
        match_end = position;
      }
    }

    int offset = matches * registers_per_match;
    output[offset + RegExpCapture::StartRegister(0)] = start;
    output[offset + RegExpCapture::EndRegister(0)] =
        static_cast<int>(match_end);
    for (int capture = 1; capture <= outer_capture_count; ++capture) {
      output[offset + RegExpCapture::StartRegister(capture)] = start;
      output[offset + RegExpCapture::EndRegister(capture)] =
          static_cast<int>(match_end);
    }
    for (int capture = outer_capture_count + 1;
         capture <= capture_count; ++capture) {
      output[offset + RegExpCapture::StartRegister(capture)] =
          static_cast<int>(capture_start);
      output[offset + RegExpCapture::EndRegister(capture)] =
          static_cast<int>(match_end);
    }
    matches++;
    if (!global || (sticky && is_run)) break;
  }
  return matches;
}

}  // namespace

// static
intptr_t RegExp::Wtf8DotExecRaw(Isolate* isolate,
                                Address /* IrRegExpData */ data_address,
                                Address /* String */ subject_address,
                                int32_t index, int32_t* result_offsets_vector,
                                int32_t result_offsets_vector_length) {
  DisallowGarbageCollection no_gc;
  auto data = SbxCast<IrRegExpData>(Tagged<Object>(data_address));
  auto subject = Cast<String>(Tagged<Object>(subject_address));
  DCHECK(data->is_wtf8_dot());
  String::FlatContent subject_content = subject->GetFlatContent(no_gc);
  return Wtf8DotExecRawImpl(
      subject_content, index, JSRegExp::AsRegExpFlags(data->flags()),
      result_offsets_vector, result_offsets_vector_length);
}

// static
intptr_t RegExp::Wtf8ClassExecRaw(Isolate* isolate,
                                  Address /* IrRegExpData */ data_address,
                                  Address /* String */ subject_address,
                                  int32_t index, int32_t* result_offsets_vector,
                                  int32_t result_offsets_vector_length) {
  DisallowGarbageCollection no_gc;
  auto data = SbxCast<IrRegExpData>(Tagged<Object>(data_address));
  auto subject = Cast<String>(Tagged<Object>(subject_address));
  DCHECK(data->is_wtf8_class());
  DCHECK(data->has_node8_class_ranges());
  String::FlatContent subject_content = subject->GetFlatContent(no_gc);
  return Wtf8ClassExecRawImpl(subject_content, data->node8_class_ranges(),
                              data->is_wtf8_class_negated(),
                              data->is_wtf8_class_plus(),
                              data->can_be_zero_length(),
                              data->capture_count(), index,
                              JSRegExp::AsRegExpFlags(data->flags()),
                              result_offsets_vector,
                              result_offsets_vector_length);
}

// Irregexp implementation.

// Ensures that the regexp object contains a compiled version of the
// source for either one-byte or two-byte subject strings.
// If the compiled version doesn't already exist, it is compiled
// from the source pattern.
// If compilation fails, an exception is thrown and this function
// returns false.
bool RegExpImpl::EnsureCompiledIrregexp(Isolate* isolate,
                                        DirectHandle<IrRegExpData> re_data,
                                        DirectHandle<String> sample_subject,
                                        bool is_one_byte) {
  bool has_bytecode = re_data->has_bytecode(is_one_byte);
  bool needs_initial_compilation = !re_data->has_code(is_one_byte);
  // Recompile is needed when we're dealing with the first execution of the
  // regexp after the decision to tier up has been made. If the tiering up
  // strategy is not in use, this value is always false.
  bool needs_tier_up_compilation = re_data->MarkedForTierUp() && has_bytecode;

#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  if (V8_UNLIKELY(v8_flags.trace_regexp_tier_up && needs_tier_up_compilation)) {
    PrintF("JSRegExp object (data: %p) needs tier-up compilation\n",
           reinterpret_cast<void*>(re_data->ptr()));
  }
#endif

  if (!needs_initial_compilation && !needs_tier_up_compilation) {
    DCHECK(re_data->has_code(is_one_byte));
    DCHECK_IMPLIES(v8_flags.regexp_interpret_all, has_bytecode);
    return true;
  }

  DCHECK_IMPLIES(needs_tier_up_compilation, has_bytecode);

  const bool is_tier_up_requested =
      v8_flags.regexp_tier_up_ticks > 0 && re_data->MarkedForTierUp();
  if (v8_flags.regexp_assemble_from_bytecode && is_tier_up_requested) {
    if (CompileIrregexpFromBytecode(isolate, re_data, sample_subject,
                                    is_one_byte)) {
      return true;
    }
    // CompileIrregexpFromBytecode() itself doesn't throw exceptions, but in
    // case of eager tier-ups we call CompileIrregexpFromSource() which might
    // throw.
    if (V8_UNLIKELY(isolate->has_exception())) {
      return false;
    }
    // If Assembling from bytecode wasn't successful, we fall-through to the
    // old pipeline compiling everything from scratch.
    if (v8_flags.trace_regexp_assembler) {
      PrintF(
          "JSRegExp object (data: %p) has unsupported bytecodes for assembling "
          "from bytecode. Falling back to re-compilation.\n",
          reinterpret_cast<void*>(re_data->ptr()));
    }
  }
  // The compilation target is a kBytecode if we're interpreting all regexp
  // objects, or if we're using the tier-up strategy but the tier-up hasn't
  // happened yet. The compilation target is a kNative if we're using the
  // tier-up strategy and we need to recompile to tier-up, or if we're producing
  // native code for all regexp objects.
  RegExpCompilationTarget compilation_target =
      re_data->ShouldProduceBytecode() ? RegExpCompilationTarget::kBytecode
                                       : RegExpCompilationTarget::kNative;
  return CompileIrregexpFromSource(isolate, re_data, sample_subject,
                                   is_one_byte, compilation_target);
}

namespace {

#ifdef DEBUG
bool RegExpCodeIsValidForPreCompilation(IsolateForSandbox isolate,
                                        DirectHandle<IrRegExpData> re_data,
                                        bool is_one_byte) {
  bool has_code = re_data->has_code(is_one_byte);
  bool has_bytecode = re_data->has_bytecode(is_one_byte);
  if (re_data->ShouldProduceBytecode()) {
    DCHECK(!has_code);
    DCHECK(!has_bytecode);
  } else {
    DCHECK_IMPLIES(has_code, has_bytecode);
  }

  return true;
}
#endif

struct RegExpCaptureIndexLess {
  bool operator()(const RegExpCapture* lhs, const RegExpCapture* rhs) const {
    DCHECK_NOT_NULL(lhs);
    DCHECK_NOT_NULL(rhs);
    return lhs->index() < rhs->index();
  }
};

}  // namespace

// static
DirectHandle<FixedArray> RegExp::CreateCaptureNameMap(
    Isolate* isolate, ZoneVector<RegExpCapture*>* named_captures) {
  if (named_captures == nullptr) return DirectHandle<FixedArray>();

  DCHECK(!named_captures->empty());

  // Named captures are sorted by name (because the set is used to ensure
  // name uniqueness). But the capture name map must to be sorted by index.

  std::sort(named_captures->begin(), named_captures->end(),
            RegExpCaptureIndexLess{});

  int len = static_cast<int>(named_captures->size()) * 2;
  DirectHandle<FixedArray> array = isolate->factory()->NewFixedArray(len);

  int i = 0;
  for (const RegExpCapture* capture : *named_captures) {
    base::Vector<const base::uc16> capture_name(capture->name()->data(),
                                                capture->name()->size());
    // CSA code in ConstructNewResultFromMatchInfo requires these strings to be
    // internalized so they can be used as property names in the 'exec' results.
    DirectHandle<String> name;
    if (v8_flags.utf8_string_semantics) {
      DirectHandle<String> encoded_name = isolate->factory()
                                              ->NewStringFromTwoByte(capture_name)
                                              .ToHandleChecked();
      name = isolate->factory()->InternalizeString(encoded_name);
    } else {
      name = isolate->factory()->InternalizeString(capture_name);
    }
    array->set(i * 2, *name);
    array->set(i * 2 + 1, Smi::FromInt(capture->index()));

    i++;
  }
  DCHECK_EQ(i * 2, len);

  return array;
}

bool RegExpImpl::CompileIrregexpFromSource(
    Isolate* isolate, DirectHandle<IrRegExpData> re_data,
    DirectHandle<String> sample_subject, bool is_one_byte,
    RegExpCompilationTarget compilation_target) {
  // Since we can't abort gracefully during compilation, check for sufficient
  // stack space (including the additional gap as used for Turbofan
  // compilation) here in advance.
  StackLimitCheck check(isolate);
  if (check.JsHasOverflowed(kStackSpaceRequiredForCompilation * KB)) {
    if (v8_flags.correctness_fuzzer_suppressions) {
      FATAL("Aborting on stack overflow");
    }
    RegExp::ThrowRegExpException(isolate, re_data,
                                 RegExpError::kAnalysisStackOverflow);
    return false;
  }

  // Compile the RegExp.
  Zone zone(isolate->allocator(), ZONE_NAME);
  PostponeInterruptsScope postpone(isolate);

  DCHECK(RegExpCodeIsValidForPreCompilation(isolate, re_data, is_one_byte));

  RegExpFlags flags = JSRegExp::AsRegExpFlags(re_data->flags());

  DirectHandle<String> pattern(re_data->source(), isolate);
  pattern = String::Flatten(isolate, pattern);
  RegExpCompileData compile_data;
  if (!RegExpParser::ParseRegExpFromHeapString(isolate, &zone, pattern, flags,
                                               &compile_data)) {
    // Throw an exception if we fail to parse the pattern.
    // THIS SHOULD NOT HAPPEN. We already pre-parsed it successfully once.
    USE(RegExp::ThrowRegExpException(isolate, flags, pattern,
                                     compile_data.error));
    return false;
  }

  // The capture_count cannot change in any valid scenario. Prevent corrupted
  // pattern strings from generating invalid regexp code.
  SBXCHECK_EQ(compile_data.capture_count, re_data->capture_count());

  if (v8_flags.utf8_string_semantics && is_one_byte && !IsIgnoreCase(flags) &&
      !IsSticky(flags)) {
    RegExpTree* byte_tree = nullptr;
    if (compile_data.capture_count == 0) {
      byte_tree = GetPositiveClassByteTree(compile_data.tree, flags, &zone);
      if (byte_tree == nullptr) {
        byte_tree =
            GetPositiveClassQuantifierByteTree(compile_data.tree, flags, &zone);
      }
    } else {
      byte_tree = GetCapturedPositiveClassQuantifierByteTree(
          compile_data.tree, compile_data.capture_count, flags, &zone);
      if (byte_tree == nullptr) {
        byte_tree = GetOuterCapturedPositiveClassQuantifierTree(
            compile_data.tree, compile_data.capture_count, flags, &zone);
      }
      if (byte_tree == nullptr) {
        byte_tree = GetOuterCapturedPositiveClassQuantifierTailTree(
            compile_data.tree, compile_data.capture_count, flags, &zone);
      }
      if (byte_tree == nullptr) {
        byte_tree =
            GetTopLevelDisjunctionCapturedPositiveClassQuantifierTailTree(
                compile_data.tree, compile_data.capture_count, flags, &zone);
      }
    }
    if (byte_tree != nullptr) {
      if (!ContainsMalformedNode8Bytes(pattern)) compile_data.tree = byte_tree;
    }
  }

  const bool can_be_zero_length = compile_data.tree->min_match() == 0;
  re_data->set_can_be_zero_length(can_be_zero_length);
  compile_data.compilation_target = compilation_target;
  const bool compilation_succeeded =
      Compile(isolate, &zone, &compile_data, flags, pattern, sample_subject,
              re_data, is_one_byte);
  if (!compilation_succeeded) {
    DCHECK(compile_data.error != RegExpError::kNone);
    RegExp::ThrowRegExpException(isolate, re_data, compile_data.error);
    return false;
  }

  if (compile_data.compilation_target == RegExpCompilationTarget::kNative) {
    re_data->set_code(is_one_byte, SbxCast<Code>(*compile_data.code));

    // Reset bytecode to uninitialized. In case we use tier-up we know that
    // tier-up has happened this way.
    re_data->clear_bytecode(is_one_byte);
  } else {
    DCHECK_EQ(compile_data.compilation_target,
              RegExpCompilationTarget::kBytecode);
    // Store code generated by compiler in bytecode and trampoline to
    // interpreter in code.
    re_data->set_bytecode(is_one_byte,
                          SbxCast<TrustedByteArray>(*compile_data.code));
    DirectHandle<Code> trampoline =
        BUILTIN_CODE(isolate, RegExpInterpreterTrampoline);
    re_data->set_code(is_one_byte, *trampoline);
  }
  DirectHandle<FixedArray> capture_name_map =
      RegExp::CreateCaptureNameMap(isolate, compile_data.named_captures);
  re_data->set_capture_name_map(capture_name_map);
  int register_max = re_data->max_register_count();
  if (compile_data.register_count > register_max) {
    re_data->set_max_register_count(compile_data.register_count);
  }

#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  if (V8_UNLIKELY(v8_flags.trace_regexp_tier_up)) {
    PrintF("JSRegExp data object %p %s size: %d\n",
           reinterpret_cast<void*>(re_data->ptr()),
           re_data->ShouldProduceBytecode() ? "bytecode" : "native code",
           re_data->ShouldProduceBytecode()
               ? re_data->bytecode(is_one_byte)->AllocatedSize()
               : re_data->code(isolate, is_one_byte)->Size());
  }
#endif

  return true;
}

namespace {

// Create the correct assembler for the architecture.
std::unique_ptr<RegExpMacroAssembler> CreateNativeMacroAssembler(
    Isolate* isolate, Zone* zone, bool is_one_byte, int output_register_count) {
  std::unique_ptr<RegExpMacroAssembler> macro_assembler;
  RegExpMacroAssembler::Mode mode =
      is_one_byte ? RegExpMacroAssembler::LATIN1 : RegExpMacroAssembler::UC16;

#if V8_TARGET_ARCH_IA32
  macro_assembler.reset(
      new RegExpMacroAssemblerIA32(isolate, zone, mode, output_register_count));
#elif V8_TARGET_ARCH_X64
  macro_assembler.reset(
      new RegExpMacroAssemblerX64(isolate, zone, mode, output_register_count));
#elif V8_TARGET_ARCH_ARM
  macro_assembler.reset(
      new RegExpMacroAssemblerARM(isolate, zone, mode, output_register_count));
#elif V8_TARGET_ARCH_ARM64
  macro_assembler.reset(new RegExpMacroAssemblerARM64(isolate, zone, mode,
                                                      output_register_count));
#elif V8_TARGET_ARCH_S390X
  macro_assembler.reset(
      new RegExpMacroAssemblerS390(isolate, zone, mode, output_register_count));
#elif V8_TARGET_ARCH_PPC64
  macro_assembler.reset(
      new RegExpMacroAssemblerPPC(isolate, zone, mode, output_register_count));
#elif V8_TARGET_ARCH_MIPS64
  macro_assembler.reset(
      new RegExpMacroAssemblerMIPS(isolate, zone, mode, output_register_count));
#elif V8_TARGET_ARCH_RISCV64
  macro_assembler.reset(new RegExpMacroAssemblerRISCV(isolate, zone, mode,
                                                      output_register_count));
#elif V8_TARGET_ARCH_RISCV32
  macro_assembler.reset(new RegExpMacroAssemblerRISCV(isolate, zone, mode,
                                                      output_register_count));
#elif V8_TARGET_ARCH_LOONG64
  macro_assembler.reset(new RegExpMacroAssemblerLOONG64(isolate, zone, mode,
                                                        output_register_count));
#else
#error "Unsupported architecture"
#endif

#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  if (V8_UNLIKELY(v8_flags.trace_regexp_assembler)) {
    return std::make_unique<RegExpMacroAssemblerTracer>(
        std::move(macro_assembler));
  }
#endif

  return macro_assembler;
}

void SetBacktrackAndExperimentalFallback(RegExpMacroAssembler* macro_assembler,
                                         DirectHandle<IrRegExpData> re_data) {
  uint32_t backtrack_limit = re_data->backtrack_limit();
  if (v8_flags.enable_experimental_regexp_engine_on_excessive_backtracks &&
      re_data->is_linear_executable()) {
    if (backtrack_limit == JSRegExp::kNoBacktrackLimit) {
      backtrack_limit = v8_flags.regexp_backtracks_before_fallback;
    } else {
      backtrack_limit = std::min(
          backtrack_limit, v8_flags.regexp_backtracks_before_fallback.value());
    }
    re_data->set_backtrack_limit(backtrack_limit);
    macro_assembler->set_backtrack_limit(backtrack_limit);
    macro_assembler->set_can_fallback(true);
  } else {
    macro_assembler->set_backtrack_limit(backtrack_limit);
    macro_assembler->set_can_fallback(false);
  }
}

}  // namespace

bool RegExpImpl::CompileIrregexpFromBytecode(
    Isolate* isolate, DirectHandle<IrRegExpData> re_data,
    DirectHandle<String> sample_subject, bool is_one_byte) {
  DCHECK(v8_flags.regexp_assemble_from_bytecode);

  if (!re_data->has_bytecode(is_one_byte)) {
    // This can only happen if we decided to immediately tier-up for long
    // subject strings or global mode. For this case we create bytecode and
    // immediately assemble JIT code from it.
    DCHECK(!re_data->has_code(is_one_byte));
    if (V8_UNLIKELY(!CompileIrregexpFromSource(
            isolate, re_data, sample_subject, is_one_byte,
            RegExpCompilationTarget::kBytecode))) {
      return false;
    }
  }

  DCHECK(re_data->has_bytecode(is_one_byte));
  DCHECK(re_data->MarkedForTierUp());

  Zone zone(isolate->allocator(), ZONE_NAME);

  DirectHandle<TrustedByteArray> bytecode{re_data->bytecode(is_one_byte),
                                          isolate};
  RegExpFlags flags = JSRegExp::AsRegExpFlags(re_data->flags());
  const int output_register_count =
      JSRegExp::RegistersForCaptureCount(re_data->capture_count());

  std::unique_ptr<RegExpMacroAssembler> macro_assembler =
      CreateNativeMacroAssembler(isolate, &zone, is_one_byte,
                                 output_register_count);
  if (IsGlobal(flags)) {
    RegExpMacroAssembler::GlobalMode mode = RegExpMacroAssembler::GLOBAL;
    if (!re_data->can_be_zero_length()) {
      mode = RegExpMacroAssembler::GLOBAL_NO_ZERO_LENGTH_CHECK;
    } else if (IsEitherUnicode(flags)) {
      mode = RegExpMacroAssembler::GLOBAL_UNICODE;
    }
    macro_assembler->set_global_mode(mode);
  }
  SetBacktrackAndExperimentalFallback(macro_assembler.get(), re_data);

  RegExpCodeGenerator code_gen{isolate, macro_assembler.get(), bytecode};
  DirectHandle<String> pattern(re_data->source(), isolate);
  pattern = String::Flatten(isolate, pattern);
  auto result = code_gen.Assemble(pattern, flags);
  if (!result.Succeeded()) {
    // We only expect unsupported bytecodes here if assembling failed.
    // This is an internal error, so we won't raise an exception.
    DCHECK_EQ(result.error(), RegExpError::kUnsupportedBytecode);
    return false;
  }
  re_data->set_code(is_one_byte, *result.code());

  // Reset bytecode to uninitialized. In case we use tier-up we know that
  // tier-up has happened this way.
  re_data->clear_bytecode(is_one_byte);

  // Code printing.
#ifdef ENABLE_DISASSEMBLER
  if (V8_UNLIKELY(v8_flags.print_regexp_code)) {
    CodeTracer::Scope trace_scope(isolate->GetCodeTracer());
    OFStream os(trace_scope.file());
    auto code = Cast<Code>(result.code());
    std::unique_ptr<char[]> pattern_cstring = pattern->ToCString();
    code->Disassemble(pattern_cstring.get(), os, isolate);
  }
#endif

#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  if (V8_UNLIKELY(v8_flags.trace_regexp_tier_up)) {
    PrintF("JSRegExp data object %p native code size: %d\n",
           reinterpret_cast<void*>(re_data->ptr()),
           re_data->code(isolate, is_one_byte)->Size());
  }
#endif

  return true;
}

void RegExpImpl::IrregexpInitialize(Isolate* isolate, DirectHandle<JSRegExp> re,
                                    DirectHandle<String> pattern,
                                    RegExpFlags flags, int capture_count,
                                    uint32_t backtrack_limit,
                                    uint32_t bit_field) {
  // Initialize compiled code entries to null.
  isolate->factory()->SetRegExpIrregexpData(
      re, pattern, JSRegExp::AsJSRegExpFlags(flags), capture_count,
      backtrack_limit, bit_field);
}

// static
int RegExpImpl::IrregexpPrepare(Isolate* isolate,
                                DirectHandle<IrRegExpData> re_data,
                                DirectHandle<String> subject) {
  DCHECK(subject->IsFlat());

  // Check representation of the underlying storage.
  bool is_one_byte = String::IsOneByteRepresentationUnderneath(*subject);
  if (is_one_byte && (re_data->is_wtf8_dot() || re_data->is_wtf8_class())) {
    return JSRegExp::RegistersForCaptureCount(re_data->capture_count());
  }
  if (!RegExpImpl::EnsureCompiledIrregexp(isolate, re_data, subject,
                                          is_one_byte)) {
    return -1;
  }

  // Only reserve room for output captures. Internal registers are allocated by
  // the engine.
  return JSRegExp::RegistersForCaptureCount(re_data->capture_count());
}

int RegExpImpl::IrregexpExecRaw(Isolate* isolate,
                                DirectHandle<IrRegExpData> regexp_data,
                                DirectHandle<String> subject, int index,
                                int32_t* output, int output_size) {
  DCHECK_LE(0, index);
  DCHECK_LE(index, subject->length());
  DCHECK(subject->IsFlat());
  DCHECK_GE(output_size,
            JSRegExp::RegistersForCaptureCount(regexp_data->capture_count()));

  bool is_one_byte = String::IsOneByteRepresentationUnderneath(*subject);

  if (is_one_byte && regexp_data->is_wtf8_dot()) {
    return static_cast<int>(RegExp::Wtf8DotExecRaw(isolate, regexp_data->ptr(),
                                                   subject->ptr(), index,
                                                   output, output_size));
  }
  if (is_one_byte && regexp_data->is_wtf8_class()) {
    return static_cast<int>(
        RegExp::Wtf8ClassExecRaw(isolate, regexp_data->ptr(), subject->ptr(),
                                 index, output, output_size));
  }

  if (!regexp_data->ShouldProduceBytecode()) {
    do {
      EnsureCompiledIrregexp(isolate, regexp_data, subject, is_one_byte);
      // The stack is used to allocate registers for the compiled regexp code.
      // This means that in case of failure, the output registers array is left
      // untouched and contains the capture results from the previous successful
      // match.  We can use that to set the last match info lazily.
      int res = NativeRegExpMacroAssembler::Match(regexp_data, subject, output,
                                                  output_size, index, isolate);
      if (res != NativeRegExpMacroAssembler::RETRY) {
        DCHECK(res != NativeRegExpMacroAssembler::EXCEPTION ||
               isolate->has_exception());
        static_assert(static_cast<int>(NativeRegExpMacroAssembler::SUCCESS) ==
                      RegExp::RE_SUCCESS);
        static_assert(static_cast<int>(NativeRegExpMacroAssembler::FAILURE) ==
                      RegExp::RE_FAILURE);
        static_assert(static_cast<int>(NativeRegExpMacroAssembler::EXCEPTION) ==
                      RegExp::RE_EXCEPTION);
        return res;
      }
      // If result is RETRY, the string has changed representation, and we
      // must restart from scratch.
      // In this case, it means we must make sure we are prepared to handle
      // the, potentially, different subject (the string can switch between
      // being internal and external, and even between being Latin1 and
      // UC16, but the characters are always the same).
      is_one_byte = String::IsOneByteRepresentationUnderneath(*subject);
    } while (true);
    UNREACHABLE();
  } else {
    DCHECK(regexp_data->ShouldProduceBytecode());

    do {
      int result = IrregexpInterpreter::MatchForCallFromRuntime(
          isolate, regexp_data, subject, output, output_size, index);
      DCHECK_IMPLIES(result == IrregexpInterpreter::EXCEPTION,
                     isolate->has_exception());

      static_assert(IrregexpInterpreter::FAILURE == 0);
      static_assert(IrregexpInterpreter::SUCCESS == 1);
      static_assert(IrregexpInterpreter::FALLBACK_TO_EXPERIMENTAL < 0);
      static_assert(IrregexpInterpreter::EXCEPTION < 0);
      static_assert(IrregexpInterpreter::RETRY < 0);
      if (result >= IrregexpInterpreter::FAILURE) {
        return result;
      }

      if (result == IrregexpInterpreter::RETRY) {
        // The string has changed representation, and we must restart the
        // match. We need to reset the tier up to start over with compilation.
        if (v8_flags.regexp_tier_up) regexp_data->ResetLastTierUpTick();
        is_one_byte = String::IsOneByteRepresentationUnderneath(*subject);
        EnsureCompiledIrregexp(isolate, regexp_data, subject, is_one_byte);
      } else {
        DCHECK(result == IrregexpInterpreter::EXCEPTION ||
               result == IrregexpInterpreter::FALLBACK_TO_EXPERIMENTAL);
        return result;
      }
    } while (true);
    UNREACHABLE();
  }
}

std::optional<int> RegExpImpl::IrregexpExec(
    Isolate* isolate, DirectHandle<IrRegExpData> regexp_data,
    DirectHandle<String> subject, int previous_index,
    int32_t* result_offsets_vector, uint32_t result_offsets_vector_length) {
  subject = String::Flatten(isolate, subject);

  if (regexp_data->is_wtf8_dot() &&
      String::IsOneByteRepresentationUnderneath(*subject)) {
    CHECK_LE(result_offsets_vector_length,
             static_cast<uint32_t>(std::numeric_limits<int32_t>::max()));
    return static_cast<int>(RegExp::Wtf8DotExecRaw(
        isolate, regexp_data->ptr(), subject->ptr(), previous_index,
        result_offsets_vector,
        static_cast<int32_t>(result_offsets_vector_length)));
  }
  if (regexp_data->is_wtf8_class() &&
      String::IsOneByteRepresentationUnderneath(*subject)) {
    CHECK_LE(result_offsets_vector_length,
             static_cast<uint32_t>(std::numeric_limits<int32_t>::max()));
    return static_cast<int>(RegExp::Wtf8ClassExecRaw(
        isolate, regexp_data->ptr(), subject->ptr(), previous_index,
        result_offsets_vector,
        static_cast<int32_t>(result_offsets_vector_length)));
  }

  const int original_register_count =
      JSRegExp::RegistersForCaptureCount(regexp_data->capture_count());

  // Maybe force early tier up:
  if (v8_flags.regexp_tier_up) {
    if (subject->length() >= JSRegExp::kTierUpForSubjectLengthValue) {
      // For very long subject strings, the regexp interpreter is currently much
      // slower than the jitted code execution. If the tier-up strategy is
      // turned on, we want to avoid this performance penalty so we eagerly
      // tier-up if the subject string length is equal or greater than the given
      // heuristic value.
      regexp_data->MarkTierUpForNextExec();
#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
      if (V8_UNLIKELY(v8_flags.trace_regexp_tier_up)) {
        PrintF(
            "Forcing tier-up for very long strings in "
            "RegExpImpl::IrregexpExec\n");
      }
#endif
    } else if (static_cast<uint32_t>(original_register_count) <
               result_offsets_vector_length) {
      // Tier up because the interpreter doesn't do global execution.
      regexp_data->MarkTierUpForNextExec();
#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
      if (V8_UNLIKELY(v8_flags.trace_regexp_tier_up)) {
        PrintF(
            "Forcing tier-up of RegExpData object %p for global irregexp "
            "mode\n",
            reinterpret_cast<void*>(regexp_data->ptr()));
      }
#endif
    }
  }

  int output_register_count =
      RegExpImpl::IrregexpPrepare(isolate, regexp_data, subject);
  if (output_register_count < 0) {
    DCHECK(isolate->has_exception());
    return {};
  }

  // TODO(jgruber): Consider changing these into DCHECKs once we're convinced
  // the conditions hold.
  CHECK_EQ(original_register_count, output_register_count);
  CHECK_LE(static_cast<uint32_t>(output_register_count),
           result_offsets_vector_length);

  RegExpStackScope stack_scope(isolate);

  int res = RegExpImpl::IrregexpExecRaw(isolate, regexp_data, subject,
                                        previous_index, result_offsets_vector,
                                        result_offsets_vector_length);

  if (res >= RegExp::RE_SUCCESS) {
    DCHECK_LE(res * output_register_count, result_offsets_vector_length);
    return res;
  } else if (res == RegExp::RE_FALLBACK_TO_EXPERIMENTAL) {
    return ExperimentalRegExp::OneshotExec(
        isolate, regexp_data, subject, previous_index, result_offsets_vector,
        result_offsets_vector_length);
  } else if (res == RegExp::RE_EXCEPTION) {
    DCHECK(isolate->has_exception());
    return {};
  } else {
    DCHECK(res == RegExp::RE_FAILURE);
    return 0;
  }
}

// static
DirectHandle<RegExpMatchInfo> RegExp::SetLastMatchInfo(
    Isolate* isolate, DirectHandle<RegExpMatchInfo> last_match_info,
    DirectHandle<String> subject, int capture_count, int32_t* match) {
  DirectHandle<RegExpMatchInfo> result =
      RegExpMatchInfo::ReserveCaptures(isolate, last_match_info, capture_count);
  if (*result != *last_match_info) {
    if (*last_match_info == *isolate->regexp_last_match_info()) {
      // This inner condition is only needed for special situations like the
      // regexp fuzzer, where we pass our own custom RegExpMatchInfo to
      // RegExpImpl::Exec; there actually want to bypass the Isolate's match
      // info and execute the regexp without side effects.
      isolate->native_context()->set_regexp_last_match_info(*result);
    }
  }

  int capture_register_count =
      JSRegExp::RegistersForCaptureCount(capture_count);
  DisallowGarbageCollection no_gc;
  if (match != nullptr) {
    for (int i = 0; i < capture_register_count; i += 2) {
      result->set_capture(i, match[i]);
      result->set_capture(i + 1, match[i + 1]);
    }
  }
  result->set_last_subject(*subject);
  result->set_last_input(*subject);
  return result;
}

// static
void RegExp::DotPrintForTesting(const char* label, RegExpNode* node) {
#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  DotPrinter::DotPrint(label, node);
#endif
}

namespace {

// Returns true if we've either generated too much irregex code within this
// isolate, or the pattern string is too long.
bool TooMuchRegExpCode(Isolate* isolate, DirectHandle<String> pattern) {
  // Limit the space regexps take up on the heap.  In order to limit this we
  // would like to keep track of the amount of regexp code on the heap.  This
  // is not tracked, however.  As a conservative approximation we track the
  // total regexp code compiled including code that has subsequently been freed
  // and the total executable memory at any point.
  static constexpr size_t kRegExpExecutableMemoryLimit = 16 * MB;
  static constexpr size_t kRegExpCompiledLimit = 1 * MB;

  Heap* heap = isolate->heap();
  if (pattern->length() > RegExp::kRegExpTooLargeToOptimize) return true;
  return (isolate->total_regexp_code_generated() > kRegExpCompiledLimit &&
          heap->CommittedMemoryExecutable() > kRegExpExecutableMemoryLimit);
}

}  // namespace

// static
bool RegExp::CompileForTesting(Isolate* isolate, Zone* zone,
                               RegExpCompileData* data, RegExpFlags flags,
                               DirectHandle<String> pattern,
                               DirectHandle<String> sample_subject,
                               DirectHandle<IrRegExpData> re_data,
                               bool is_one_byte) {
  return RegExpImpl::Compile(isolate, zone, data, flags, pattern,
                             sample_subject, re_data, is_one_byte);
}

bool RegExpImpl::Compile(Isolate* isolate, Zone* zone, RegExpCompileData* data,
                         RegExpFlags flags, DirectHandle<String> pattern,
                         DirectHandle<String> sample_subject,
                         DirectHandle<IrRegExpData> re_data, bool is_one_byte) {
  if (JSRegExp::RegistersForCaptureCount(data->capture_count) >
      RegExpMacroAssembler::kMaxRegisterCount) {
    data->error = RegExpError::kTooLarge;
    return false;
  }

  RegExpCompiler compiler(isolate, zone, data->capture_count, flags,
                          is_one_byte);
#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  const bool needs_graph_printer = v8_flags.print_regexp_graph ||
                                   v8_flags.trace_regexp_graph_building ||
                                   v8_flags.trace_regexp_compiler;
  const bool needs_ast_printer = v8_flags.trace_regexp_graph_building;
  std::unique_ptr<RegExpDiagnostics> diagnostics;
  if (V8_UNLIKELY(needs_ast_printer || needs_graph_printer)) {
    diagnostics = std::make_unique<RegExpDiagnostics>(std::cout, zone);
  }
  if (V8_UNLIKELY(needs_ast_printer)) {
    diagnostics->set_tree_labeller(
        std::make_unique<RegExpGraphLabeller<RegExpTree>>());
    diagnostics->set_ast_printer(std::make_unique<RegExpAstNodePrinter>(
        diagnostics->os(), diagnostics->tree_labeller(), diagnostics->zone()));
  }
  if (V8_UNLIKELY(needs_graph_printer)) {
    diagnostics->set_graph_labeller(
        std::make_unique<RegExpGraphLabeller<RegExpNode>>());
    diagnostics->set_graph_printer(std::make_unique<RegExpGraphPrinter>(
        std::make_unique<RegExpGraphNodePrinter>(diagnostics->os(),
                                                 diagnostics->graph_labeller(),
                                                 diagnostics->zone())));
  }
  if (V8_UNLIKELY(needs_ast_printer || needs_graph_printer)) {
    compiler.set_diagnostics(std::move(diagnostics));
  }
#endif

  if (compiler.optimize()) {
    compiler.set_optimize(!TooMuchRegExpCode(isolate, pattern));
  }

  // Sample some characters from the middle of the string.
  static const int kSampleSize = 128;

  sample_subject = String::Flatten(isolate, sample_subject);
  uint32_t start, end;
  if (sample_subject->length() > kSampleSize) {
    start = (sample_subject->length() - kSampleSize) / 2;
    end = start + kSampleSize;
  } else {
    start = 0;
    end = sample_subject->length();
  }
  for (uint32_t i = start; i < end; i++) {
    compiler.frequency_collator()->CountCharacter(sample_subject->Get(i));
  }

  data->node = compiler.PreprocessRegExp(data, is_one_byte);
  if (data->error != RegExpError::kNone) {
    return false;
  }
  data->error = AnalyzeRegExp(isolate, is_one_byte, flags, data->node);
  if (data->error != RegExpError::kNone) {
    return false;
  }

#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
  if (V8_UNLIKELY(v8_flags.print_regexp_graph))
    compiler.diagnostics()->graph_printer()->PrintGraph(data->node);
  if (v8_flags.trace_regexp_graph) DotPrinter::DotPrint("Start", data->node);
#endif

  std::unique_ptr<RegExpMacroAssembler> macro_assembler;
  if (data->compilation_target == RegExpCompilationTarget::kNative) {
    // Native regexp implementation.
    DCHECK(!v8_flags.jitless);

    const int output_register_count =
        JSRegExp::RegistersForCaptureCount(data->capture_count);
    macro_assembler = CreateNativeMacroAssembler(isolate, zone, is_one_byte,
                                                 output_register_count);
  } else {
    DCHECK_EQ(data->compilation_target, RegExpCompilationTarget::kBytecode);
    // Interpreted regexp implementation.
    macro_assembler.reset(
        new RegExpBytecodeGenerator(isolate, zone,
                                    is_one_byte ? RegExpMacroAssembler::LATIN1
                                                : RegExpMacroAssembler::UC16));
#ifdef V8_ENABLE_REGEXP_DIAGNOSTICS
    if (V8_UNLIKELY(v8_flags.trace_regexp_assembler)) {
      std::unique_ptr<RegExpMacroAssembler> tracer_macro_assembler =
          std::make_unique<RegExpMacroAssemblerTracer>(
              std::move(macro_assembler));
      macro_assembler = std::move(tracer_macro_assembler);
    }
#endif
  }

  macro_assembler->set_slow_safe(TooMuchRegExpCode(isolate, pattern));
  SetBacktrackAndExperimentalFallback(macro_assembler.get(), re_data);

  // Inserted here, instead of in Assembler, because it depends on information
  // in the AST that isn't replicated in the Node structure.
  bool is_end_anchored = data->tree->IsAnchoredAtEnd();
  bool is_start_anchored = data->tree->IsAnchoredAtStart();
  int max_length = data->tree->max_match();
  static const int kMaxBacksearchLimit = 1024;
  if (is_end_anchored && !is_start_anchored && !IsSticky(flags) &&
      max_length < kMaxBacksearchLimit) {
    macro_assembler->SetCurrentPositionFromEnd(max_length);
  }

  if (IsGlobal(flags)) {
    RegExpMacroAssembler::GlobalMode mode = RegExpMacroAssembler::GLOBAL;
    if (data->tree->min_match() > 0) {
      mode = RegExpMacroAssembler::GLOBAL_NO_ZERO_LENGTH_CHECK;
    } else if (IsEitherUnicode(flags)) {
      mode = RegExpMacroAssembler::GLOBAL_UNICODE;
    }
    macro_assembler->set_global_mode(mode);
  }

  RegExpCompiler::CompilationResult result = compiler.Assemble(
      isolate, macro_assembler.get(), data->node, data->capture_count, pattern);

  // Code / bytecode printing.
  {
#ifdef ENABLE_DISASSEMBLER
    if (V8_UNLIKELY(v8_flags.print_regexp_code &&
                    data->compilation_target ==
                        RegExpCompilationTarget::kNative &&
                    result.Succeeded())) {
      CodeTracer::Scope trace_scope(isolate->GetCodeTracer());
      OFStream os(trace_scope.file());
      auto code = CheckedCast<Code>(result.code);
      std::unique_ptr<char[]> pattern_cstring = pattern->ToCString();
      code->Disassemble(pattern_cstring.get(), os, isolate);
    }
    if (V8_UNLIKELY(v8_flags.print_regexp_bytecode &&
                    data->compilation_target ==
                        RegExpCompilationTarget::kBytecode &&
                    result.Succeeded())) {
      auto bytecode = CheckedCast<TrustedByteArray>(result.code);
      std::unique_ptr<char[]> pattern_cstring = pattern->ToCString();
      RegExpBytecodeDisassemble(bytecode->begin(), bytecode->length(),
                                pattern_cstring.get());
    }
#endif
  }

  if (result.error != RegExpError::kNone) {
    if (v8_flags.correctness_fuzzer_suppressions &&
        result.error == RegExpError::kStackOverflow) {
      FATAL("Aborting on stack overflow");
    }
    data->error = result.error;
  }

  data->code = result.code;
  data->register_count = result.num_registers;

  return result.Succeeded();
}

RegExpGlobalExecRunner::RegExpGlobalExecRunner(
    DirectHandle<RegExpData> regexp_data, DirectHandle<String> subject,
    Isolate* isolate)
    : result_vector_scope_(isolate),
      regexp_data_(regexp_data),
      subject_(subject),
      isolate_(isolate) {
  DCHECK(IsGlobal(JSRegExp::AsRegExpFlags(regexp_data->flags())));

  switch (regexp_data_->type_tag()) {
    case RegExpData::Type::ATOM: {
      registers_per_match_ = JSRegExp::kAtomRegisterCount;
      register_array_size_ = Isolate::kJSRegexpStaticOffsetsVectorSize;
      break;
    }
    case RegExpData::Type::IRREGEXP: {
      registers_per_match_ = RegExpImpl::IrregexpPrepare(
          isolate_, TrustedCast<IrRegExpData>(regexp_data_), subject_);
      if (registers_per_match_ < 0) {
        num_matches_ = -1;  // Signal exception.
        return;
      }
      if (TrustedCast<IrRegExpData>(regexp_data_)->ShouldProduceBytecode()) {
        // Global loop in interpreted regexp is not implemented.  We choose the
        // size of the offsets vector so that it can only store one match.
        register_array_size_ = registers_per_match_;
      } else {
        register_array_size_ = std::max(
            {registers_per_match_, Isolate::kJSRegexpStaticOffsetsVectorSize});
      }
      break;
    }
    case RegExpData::Type::EXPERIMENTAL: {
      if (!ExperimentalRegExp::IsCompiled(
              TrustedCast<IrRegExpData>(regexp_data_), isolate_) &&
          !ExperimentalRegExp::Compile(
              isolate_, TrustedCast<IrRegExpData>(regexp_data_))) {
        DCHECK(isolate->has_exception());
        num_matches_ = -1;  // Signal exception.
        return;
      }
      registers_per_match_ = JSRegExp::RegistersForCaptureCount(
          TrustedCast<IrRegExpData>(regexp_data_)->capture_count());
      register_array_size_ = std::max(
          {registers_per_match_, Isolate::kJSRegexpStaticOffsetsVectorSize});
      break;
    }
  }

  // Cache the result vector location.

  register_array_ = result_vector_scope_.Initialize(register_array_size_);

  // Set state so that fetching the results the first time triggers a call
  // to the compiled regexp.
  current_match_index_ = max_matches() - 1;
  num_matches_ = max_matches();
  DCHECK_LE(2, registers_per_match_);  // Each match has at least one capture.
  DCHECK_GE(register_array_size_, registers_per_match_);
  int32_t* last_match =
      &register_array_[current_match_index_ * registers_per_match_];
  last_match[0] = -1;
  last_match[1] = 0;
}

int RegExpGlobalExecRunner::AdvanceZeroLength(int last_index) const {
  if (IsEitherUnicode(JSRegExp::AsRegExpFlags(regexp_data_->flags())) &&
      static_cast<uint32_t>(last_index + 1) < subject_->length() &&
      unibrow::Utf16::IsLeadSurrogate(subject_->Get(last_index)) &&
      unibrow::Utf16::IsTrailSurrogate(subject_->Get(last_index + 1))) {
    // Advance over the surrogate pair.
    return last_index + 2;
  }
  return last_index + 1;
}

int32_t* RegExpGlobalExecRunner::FetchNext() {
  current_match_index_++;

  if (current_match_index_ >= num_matches_) {
    // Current batch of results exhausted.
    // Fail if last batch was not even fully filled.
    if (num_matches_ < max_matches()) {
      num_matches_ = 0;  // Signal failed match.
      return nullptr;
    }

    int32_t* last_match =
        &register_array_[(current_match_index_ - 1) * registers_per_match_];
    int last_end_index = last_match[1];

    switch (regexp_data_->type_tag()) {
      case RegExpData::Type::ATOM:
        num_matches_ = RegExpImpl::AtomExecRaw(
            isolate_, TrustedCast<AtomRegExpData>(regexp_data_), subject_,
            last_end_index, register_array_, register_array_size_);
        break;
      case RegExpData::Type::EXPERIMENTAL: {
        DCHECK(ExperimentalRegExp::IsCompiled(
            TrustedCast<IrRegExpData>(regexp_data_), isolate_));
        DisallowGarbageCollection no_gc;
        num_matches_ = ExperimentalRegExp::ExecRaw(
            isolate_, RegExp::kFromRuntime,
            *TrustedCast<IrRegExpData>(regexp_data_), *subject_,
            register_array_, register_array_size_, last_end_index);
        break;
      }
      case RegExpData::Type::IRREGEXP: {
        int last_start_index = last_match[0];
        if (last_start_index == last_end_index) {
          // Zero-length match. Advance by one code point.
          last_end_index = AdvanceZeroLength(last_end_index);
        }
        if (static_cast<uint32_t>(last_end_index) > subject_->length()) {
          num_matches_ = 0;  // Signal failed match.
          return nullptr;
        }
        num_matches_ = RegExpImpl::IrregexpExecRaw(
            isolate_, TrustedCast<IrRegExpData>(regexp_data_), subject_,
            last_end_index, register_array_, register_array_size_);
        break;
      }
    }

    // Fall back to experimental engine if needed and possible.
    if (num_matches_ == RegExp::kInternalRegExpFallbackToExperimental) {
      num_matches_ = ExperimentalRegExp::OneshotExecRaw(
          isolate_, TrustedCast<IrRegExpData>(regexp_data_), subject_,
          register_array_, register_array_size_, last_end_index);
    }

    if (num_matches_ <= 0) {
      return nullptr;
    }

    // Number of matches can't exceed maximum matches.
    // This check is enough to prevent OOB accesses to register_array_ in the
    // else branch below, since current_match_index < num_matches_ in this
    // branch, it follows that current_match_index < max_matches(). And since
    // max_matches() = register_array_size_ / registers_per_match it follows
    // that current_match_index * registers_per_match_ < register_array_size_.
    SBXCHECK_LE(num_matches_, max_matches());

    current_match_index_ = 0;
    return register_array_;
  } else {
    return &register_array_[current_match_index_ * registers_per_match_];
  }
}

int32_t* RegExpGlobalExecRunner::LastSuccessfulMatch() const {
  int index = current_match_index_ * registers_per_match_;
  if (num_matches_ == 0) {
    // After a failed match we shift back by one result.
    index -= registers_per_match_;
  }
  return &register_array_[index];
}

Tagged<Object> RegExpResultsCache::Lookup(Heap* heap, Tagged<String> key_string,
                                          Tagged<Object> key_pattern,
                                          Tagged<FixedArray>* last_match_cache,
                                          ResultsCacheType type) {
  if (V8_UNLIKELY(!v8_flags.regexp_results_cache)) return Smi::zero();
  Tagged<FixedArray> cache;
  if (!IsInternalizedString(key_string)) return Smi::zero();
  if (type == STRING_SPLIT_SUBSTRINGS) {
    DCHECK(IsString(key_pattern));
    if (!IsInternalizedString(key_pattern)) return Smi::zero();
    cache = heap->string_split_cache();
  } else {
    DCHECK(type == REGEXP_MULTIPLE_INDICES);
    DCHECK(IsRegExpDataWrapper(key_pattern));
    cache = heap->regexp_multiple_cache();
  }

  uint32_t hash = key_string->hash();
  uint32_t index = ((hash & (kRegExpResultsCacheSize - 1)) &
                    ~(kArrayEntriesPerCacheEntry - 1));
  if (cache->get(index + kStringOffset) != key_string ||
      cache->get(index + kPatternOffset) != key_pattern) {
    index =
        ((index + kArrayEntriesPerCacheEntry) & (kRegExpResultsCacheSize - 1));
    if (cache->get(index + kStringOffset) != key_string ||
        cache->get(index + kPatternOffset) != key_pattern) {
      return Smi::zero();
    }
  }

  *last_match_cache = Cast<FixedArray>(cache->get(index + kLastMatchOffset));
  return cache->get(index + kArrayOffset);
}

void RegExpResultsCache::Enter(Isolate* isolate,
                               DirectHandle<String> key_string,
                               DirectHandle<Object> key_pattern,
                               DirectHandle<FixedArray> value_array,
                               DirectHandle<FixedArray> last_match_cache,
                               ResultsCacheType type) {
  if (V8_UNLIKELY(!v8_flags.regexp_results_cache)) return;
  Factory* factory = isolate->factory();
  DirectHandle<FixedArray> cache;
  if (!IsInternalizedString(*key_string)) return;
  if (type == STRING_SPLIT_SUBSTRINGS) {
    DCHECK(IsString(*key_pattern));
    if (!IsInternalizedString(*key_pattern)) return;
    cache = factory->string_split_cache();
  } else {
    DCHECK(type == REGEXP_MULTIPLE_INDICES);
    DCHECK(IsRegExpDataWrapper(*key_pattern));
    cache = factory->regexp_multiple_cache();
  }

  uint32_t hash = key_string->hash();
  uint32_t index = ((hash & (kRegExpResultsCacheSize - 1)) &
                    ~(kArrayEntriesPerCacheEntry - 1));
  if (cache->get(index + kStringOffset) == Smi::zero()) {
    cache->set(index + kStringOffset, *key_string);
    cache->set(index + kPatternOffset, *key_pattern);
    cache->set(index + kArrayOffset, *value_array);
    cache->set(index + kLastMatchOffset, *last_match_cache);
  } else {
    uint32_t index2 =
        ((index + kArrayEntriesPerCacheEntry) & (kRegExpResultsCacheSize - 1));
    if (cache->get(index2 + kStringOffset) == Smi::zero()) {
      cache->set(index2 + kStringOffset, *key_string);
      cache->set(index2 + kPatternOffset, *key_pattern);
      cache->set(index2 + kArrayOffset, *value_array);
      cache->set(index2 + kLastMatchOffset, *last_match_cache);
    } else {
      cache->set(index2 + kStringOffset, Smi::zero());
      cache->set(index2 + kPatternOffset, Smi::zero());
      cache->set(index2 + kArrayOffset, Smi::zero());
      cache->set(index2 + kLastMatchOffset, Smi::zero());
      cache->set(index + kStringOffset, *key_string);
      cache->set(index + kPatternOffset, *key_pattern);
      cache->set(index + kArrayOffset, *value_array);
      cache->set(index + kLastMatchOffset, *last_match_cache);
    }
  }
  // If the array is a reasonably short list of substrings, convert it into a
  // list of internalized strings.
  if (type == STRING_SPLIT_SUBSTRINGS && value_array->length() < 100) {
    for (int i = 0; i < value_array->length(); i++) {
      DirectHandle<String> str(Cast<String>(value_array->get(i)), isolate);
      DirectHandle<String> internalized_str = factory->InternalizeString(str);
      value_array->set(i, *internalized_str);
    }
  }
  // Convert backing store to a copy-on-write array.
  value_array->set_map_no_write_barrier(
      isolate, ReadOnlyRoots(isolate).fixed_cow_array_map());
}

void RegExpResultsCache::Clear(Tagged<FixedArray> cache) {
  for (int i = 0; i < kRegExpResultsCacheSize; i++) {
    cache->set(i, Smi::zero());
  }
}

// static
void RegExpResultsCache_MatchGlobalAtom::TryInsert(Isolate* isolate,
                                                   Tagged<String> subject,
                                                   Tagged<String> pattern,
                                                   int number_of_matches,
                                                   int last_match_index) {
  DisallowGarbageCollection no_gc;
  DCHECK(Smi::IsValid(number_of_matches));
  DCHECK(Smi::IsValid(last_match_index));
  if (!IsSlicedString(subject)) return;
  Tagged<FixedArray> cache = isolate->heap()->regexp_match_global_atom_cache();
  DCHECK_EQ(cache->length(), kSize);
  cache->set(kSubjectIndex, subject);
  cache->set(kPatternIndex, pattern);
  cache->set(kNumberOfMatchesIndex, Smi::FromInt(number_of_matches));
  cache->set(kLastMatchIndexIndex, Smi::FromInt(last_match_index));
}

// static
bool RegExpResultsCache_MatchGlobalAtom::TryGet(Isolate* isolate,
                                                Tagged<String> subject,
                                                Tagged<String> pattern,
                                                int* number_of_matches_out,
                                                int* last_match_index_out) {
  DisallowGarbageCollection no_gc;
  Tagged<FixedArray> cache = isolate->heap()->regexp_match_global_atom_cache();
  DCHECK_EQ(cache->length(), kSize);

  if (!IsSlicedString(subject)) return false;
  if (pattern != cache->get(kPatternIndex)) return false;

  // Here we are looking for a subject slice that 1. starts at the same point
  // and 2. is of equal length or longer than the cached subject slice.
  Tagged<SlicedString> sliced_subject = Cast<SlicedString>(subject);
  Tagged<Object> cached_subject_object = cache->get(kSubjectIndex);
  if (!Is<SlicedString>(cached_subject_object)) {
    // Note while we insert only sliced strings, they may be converted into
    // other kinds, e.g. during GC or internalization.
    Clear(isolate->heap());
    return false;
  }
  auto cached_subject = Cast<SlicedString>(cached_subject_object);
  if (cached_subject->parent() != sliced_subject->parent()) return false;
  if (cached_subject->offset() != sliced_subject->offset()) return false;
  if (cached_subject->length() > sliced_subject->length()) return false;

  *number_of_matches_out = Smi::ToInt(cache->get(kNumberOfMatchesIndex));
  *last_match_index_out = Smi::ToInt(cache->get(kLastMatchIndexIndex));
  return true;
}

void RegExpResultsCache_MatchGlobalAtom::Clear(Heap* heap) {
  Relaxed_MemsetTagged(
      heap->regexp_match_global_atom_cache()->RawFieldOfFirstElement(),
      Smi::zero(), kSize);
}

std::ostream& operator<<(std::ostream& os, RegExpFlags flags) {
#define V(Lower, Camel, LowerCamel, Char, Bit) \
  if (flags & RegExpFlag::k##Camel) os << Char;
  REGEXP_FLAG_LIST(V)
#undef V
  return os;
}

}  // namespace internal
}  // namespace v8
