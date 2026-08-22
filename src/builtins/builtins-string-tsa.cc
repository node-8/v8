// Copyright 2024 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/builtins/builtins-string-tsa-inl.h"
#include "src/builtins/builtins-utils-gen.h"
#include "src/codegen/turboshaft-builtins-assembler-inl.h"
#include "src/common/globals.h"
#include "src/compiler/globals.h"
#include "src/compiler/turboshaft/representations.h"
#include "src/compiler/turboshaft/string-view.h"
#include "src/compiler/write-barrier-kind.h"
#include "src/objects/string.h"
#include "src/objects/tagged-field.h"

namespace v8::internal {

#include "src/compiler/turboshaft/define-assembler-macros.inc"

using namespace compiler::turboshaft;  // NOLINT(build/namespaces)

#ifdef V8_ENABLE_EXPERIMENTAL_TSA_BUILTINS

TS_BUILTIN(StringFromCodePointAt, StringBuiltinsAssemblerTS) {
  auto receiver = Parameter<String>(Descriptor::kReceiver);
  auto position = Parameter<WordPtr>(Descriptor::kPosition);

  // Load the character code at the {position} from the {receiver}.
  V<Word32> codepoint =
      LoadSurrogatePairAt(receiver, {}, position, UnicodeEncoding::UTF16);
  // Create a String from the UTF16 encoded code point
  V<String> result =
      StringFromSingleCodePoint(codepoint, UnicodeEncoding::UTF16);
  Return(result);
}

// ES6 #sec-string.fromcharcode
TS_BUILTIN(StringFromCharCode, StringBuiltinsAssemblerTS) {
  V<Context> context = Parameter<Context>(Descriptor::kContext);
  V<Word32> argc = Parameter<Word32>(Descriptor::kJSActualArgumentsCount);
  BuiltinArgumentsTS arguments(this, argc);

  V<WordPtr> character_count = arguments.GetLengthWithoutReceiver();
  // Check if we have exactly one argument (plus the implicit receiver), i.e.
  // if the parent frame is not an inlined arguments frame.
  IF (WordPtrEqual(arguments.GetLengthWithoutReceiver(), 1)) {
    // Single argument case, perform fast single character string cache lookup
    // for one-byte code units, or fall back to creating a single character
    // string on the fly otherwise.
    V<Object> code = arguments.AtIndex(0);
    V<Word32> code32 = TruncateTaggedToWord32(context, code);
    V<Word32> code8 = Word32BitwiseAnd(code32, String::kMaxOneByteCharCode);
    V<String> result = StringFromSingleCharCode(code8);
    PopAndReturn(arguments, result);
  } ELSE {
    V<SeqOneByteString> one_byte_result =
        AllocateSeqOneByteString(character_count);

    ScopedVar<WordPtr> var_max_index(this, 0);
    FOREACH(arg, arguments.Range()) {
      V<Word32> code32 = TruncateTaggedToWord32(context, arg);
      V<Word32> code8 =
          Word32BitwiseAnd(code32, String::kMaxOneByteCharCode);

      StoreElement(one_byte_result,
                   AccessBuilderTS::ForSeqOneByteStringCharacter(),
                   var_max_index, code8);
      var_max_index = WordPtrAdd(var_max_index, 1);
    }
    PopAndReturn(arguments, one_byte_result);
  }
}

#ifndef V8_ENABLE_EXPERIMENTAL_TQ_TO_TSA
TS_BUILTIN(ToString, StringBuiltinsAssemblerTS) {
  V<Context> context = Parameter<Context>(Descriptor::kContext);
  V<JSAny> o = Parameter<JSAny>(Descriptor::kO);
  Return(ToStringImpl(context, o));
}
#endif  // !V8_ENABLE_EXPERIMENTAL_TQ_TO_TSA

#endif  // V8_ENABLE_EXPERIMENTAL_TSA_BUILTINS

#include "src/compiler/turboshaft/undef-assembler-macros.inc"

}  // namespace v8::internal
