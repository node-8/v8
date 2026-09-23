// Copyright 2023 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include <string>
#include <string_view>

#include "include/v8-function.h"
#include "include/v8-regexp.h"
#include "src/api/api-inl.h"
#include "src/execution/frames-inl.h"
#include "src/flags/flags.h"
#include "src/objects/string-inl.h"
#include "src/regexp/regexp-macro-assembler.h"
#include "src/regexp/regexp-utils.h"
#include "test/cctest/cctest.h"
#include "test/cctest/heap/heap-utils.h"
#include "test/common/flag-utils.h"

using namespace v8;

#ifdef V8_INTL_SUPPORT
TEST(Node8Wtf8ForwardBackReferenceCompare) {
  CcTest::InitializeVM();
  HandleScope scope(CcTest::isolate());
  CHECK_EQ(i::v8_flags.utf8_string_semantics ? 2 : 1,
           v8_str("\xc3\xa9")->Length());
  int checks = 0;
  auto check = [&](std::string_view capture, std::string_view target,
                   size_t expected) {
    CHECK(!capture.empty());
    ++checks;
    const i::Address begin = reinterpret_cast<i::Address>(target.data());
    CHECK_EQ(expected, i::RegExpMacroAssembler::CaseInsensitiveCompareWtf8(
                           reinterpret_cast<i::Address>(capture.data()), begin,
                           capture.size(), begin + target.size()));
  };
  for (char upper = 'A'; upper <= 'Z'; ++upper) {
    char lower = upper + ('a' - 'A');
    check({&upper, 1}, {&lower, 1}, 1);
    check({&lower, 1}, {&upper, 1}, 1);
  }
  check("[", "{", 0);
  check("@", "\x60", 0);
  check("1", "1!", 1);
  check("ab", "A", 0);
  check("A", "", 0);
  check("A", "ab", 1);
  check({"a\0B", 3}, {"A\0b!", 4}, 3);
  check("k", "\xe2\x84\xaa!", 3);
  check("\xe2\x84\xaa", "k!", 1);
  check("\xc5\xbf", "S!", 1);
  check("s", "\xc5\xbf!", 2);
  check("\xc3\xa9", "\xc3\x89!", 2);
  check("\xcf\x83", "\xcf\x82!", 2);
  check("\xf0\x90\x90\x80", "\xf0\x90\x90\xa8!", 4);
  check("\xc3\x9f", "\xe1\xba\x9e!", 3);
  check("\xc3\x9f", "ss", 0);
  check("i", "\xc4\xb0", 0);
  check("\xed\xa0\x80", "\xed\xa0\x80!", 3);
  check("\xed\xa0\x80\xed\xb0\x80", "\xf0\x90\x80\x80", 0);
  check("\xef\xbf\xbd", "\xe2\x80", 2);
  check("\xe2\x80", "\xef\xbf\xbd!", 3);
  check("\xe2\x80", "\xe2\x80\xa8", 0);
  check("\xef\xbf\xbd", "\xc0\x80", 1);
  check("\xc0\x80", "\xef\xbf\xbd\xef\xbf\xbd!", 6);
  check("\xc0\x80", "\xef\xbf\xbd", 0);
  check("k", {"\xe2\x84\xaa", 2}, 0);
  check("\xe2\x84\xaa", {"k!", 1}, 1);
  const std::string captured(4096, 'a');
  const std::string target(4096, 'A');
  check(captured, target, 4096);
  check(captured, std::string_view(target).substr(0, 4095), 0);
  CHECK_EQ(81, checks);
  i::PrintF("node-8 forward fold helper: %d checks passed\n", checks);
}
#endif  // V8_INTL_SUPPORT

namespace {

const char kOneByteSubjectString[] = {
    'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a',
    'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a',
    'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', '\0'};
const uint16_t kTwoByteSubjectString[] = {
    0xCF80, 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a',
    'a',    'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a',
    'a',    'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', 'a', '\0'};

const int kSubjectStringLength = arraysize(kOneByteSubjectString) - 1;
static_assert(arraysize(kOneByteSubjectString) ==
              arraysize(kTwoByteSubjectString));

namespace base = v8::base;

class OneByteVectorResource : public String::ExternalOneByteStringResource {
 public:
  explicit OneByteVectorResource(base::Vector<const char> vector)
      : data_(vector) {}
  ~OneByteVectorResource() override = default;
  size_t length() const override { return data_.length(); }
  const char* data() const override { return data_.begin(); }
  void Dispose() override {}

 private:
  base::Vector<const char> data_;
};

class UC16VectorResource : public String::ExternalStringResource {
 public:
  explicit UC16VectorResource(base::Vector<const base::uc16> vector)
      : data_(vector) {}
  ~UC16VectorResource() override = default;
  size_t length() const override { return data_.length(); }
  const base::uc16* data() const override { return data_.begin(); }
  void Dispose() override {}

 private:
  base::Vector<const base::uc16> data_;
};

OneByteVectorResource one_byte_string_resource(
    base::Vector<const char>(&kOneByteSubjectString[0], kSubjectStringLength));
UC16VectorResource two_byte_string_resource(base::Vector<const base::uc16>(
    &kTwoByteSubjectString[0], kSubjectStringLength));

class InterruptTest {
 public:
  InterruptTest()
      : i_thread(this),
        env_(),
        isolate_(env_.isolate()),
        sem_(0),
        ran_test_body_(false),
        ran_to_completion_(false) {}

  void RunTest(InterruptCallback test_body_fn) {
    HandleScope handle_scope(isolate_);
    Local<RegExp> re =
        RegExp::New(env_.local(), v8_str("((a*)*)*b"), v8::RegExp::kNone)
            .ToLocalChecked();
    regexp_handle_.Reset(isolate_, re);
    i_thread.SetTestBody(test_body_fn);
    CHECK(i_thread.Start());
    TestBody();
    i_thread.Join();
  }

  static void InvokeMajorGC(Isolate* isolate, void* data) {
    i::Isolate* i_isolate = reinterpret_cast<i::Isolate*>(isolate);
    i::heap::InvokeAtomicMajorGC(i_isolate->heap());
  }

  static void MakeSubjectOneByteExternal(Isolate* isolate, void* data) {
    auto instance = reinterpret_cast<InterruptTest*>(data);
    HandleScope scope(isolate);
    Local<String> string =
        Local<String>::New(isolate, instance->subject_string_handle_);
    CHECK(string->CanMakeExternal(String::Encoding::ONE_BYTE_ENCODING));
    string->MakeExternal(isolate, &one_byte_string_resource);
  }

  static void MakeSubjectTwoByteExternal(Isolate* isolate, void* data) {
    auto instance = reinterpret_cast<InterruptTest*>(data);
    HandleScope scope(isolate);
    Local<String> string =
        Local<String>::New(isolate, instance->subject_string_handle_);
    CHECK(string->CanMakeExternal(String::Encoding::TWO_BYTE_ENCODING));
    string->MakeExternal(isolate, &two_byte_string_resource);
  }

  static void TwoByteSubjectToOneByte(Isolate* isolate, void* data) {
    auto instance = reinterpret_cast<InterruptTest*>(data);
    HandleScope scope(isolate);
    i::Isolate* i_isolate = reinterpret_cast<i::Isolate*>(isolate);
    Local<RegExp> re = instance->regexp_handle_.Get(isolate);
    i::DirectHandle<i::JSRegExp> regexp = Utils::OpenDirectHandle(*re);
    // We executed on a two-byte subject so far, so we expect only bytecode for
    // two-byte to be present.
    i::Tagged<i::IrRegExpData> re_data =
        CheckedCast<i::IrRegExpData>(regexp->data(i_isolate));
    CHECK(!re_data->has_latin1_bytecode());
    CHECK(re_data->has_uc16_bytecode());

    // Transition the subject string to one-byte by internalizing it.
    // It already contains only one-byte characters.
    Local<String> string = instance->GetSubjectString();
    CHECK(!string->IsOneByte());
    CHECK(string->ContainsOnlyOneByte());
    // Internalize the subject by using it as a computed property name in an
    // object.
    CompileRun("o = { [subject_string]: 'foo' }");
    CHECK(string->IsOneByte());
  }

  static void IterateStack(Isolate* isolate, void* data) {
    HandleScope scope(isolate);

    i::Isolate* i_isolate = reinterpret_cast<i::Isolate*>(isolate);
    v8::RegisterState state;
#if defined(USE_SIMULATOR)
    SimulatorHelper simulator_helper;
    if (!simulator_helper.Init(isolate)) return;
    simulator_helper.FillRegisters(&state);
#else
    state.pc = nullptr;
    state.fp = &state;
    state.sp = &state;
#endif

    i::StackFrameIteratorForProfilerForTesting it(
        i_isolate, reinterpret_cast<i::Address>(state.pc),
        reinterpret_cast<i::Address>(state.fp),
        reinterpret_cast<i::Address>(state.sp),
        reinterpret_cast<i::Address>(state.lr), i_isolate->js_entry_sp());

    for (; !it.done(); it.Advance()) {
      // Ideally we'd access the frame a bit (doesn't matter how); but this
      // iterator is very limited in what it may access, and prints run into
      // DCHECKs. So we can't do this:
      // it.frame()->Print(&accumulator, i::StackFrame::OVERVIEW,
      //                   frame_index++);
    }
  }

  void SetOneByteSubjectString() {
    HandleScope handle_scope(isolate_);
    i::Isolate* i_isolate = this->i_isolate();
    // The string must be in old space to support externalization.
    i::DirectHandle<i::String> i_one_byte_string =
        i_isolate->factory()->NewStringFromAsciiChecked(
            &kOneByteSubjectString[0], i::AllocationType::kOld);
    SetSubjectString(Utils::ToLocal(i_one_byte_string));
  }

  void SetTwoByteSubjectString() {
    HandleScope handle_scope(isolate_);
    i::Isolate* i_isolate = this->i_isolate();
    // The string must be in old space to support externalization.
    i::DirectHandle<i::String> i_two_byte_string =
        i_isolate->factory()
            ->NewStringFromTwoByte(
                base::Vector<const base::uc16>(&kTwoByteSubjectString[0],
                                               kSubjectStringLength),
                i::AllocationType::kOld)
            .ToHandleChecked();
    SetSubjectString(Utils::ToLocal(i_two_byte_string));
  }

  void SetSubjectString(Local<String> subject) {
    env_->Global()
        ->Set(env_.local(), v8_str("subject_string"), subject)
        .FromJust();
    subject_string_handle_.Reset(env_.isolate(), subject);
  }

  Local<String> GetSubjectString() const {
    return subject_string_handle_.Get(isolate_);
  }

  Local<RegExp> GetRegExp() const { return regexp_handle_.Get(isolate_); }

  i::Isolate* i_isolate() const {
    return reinterpret_cast<i::Isolate*>(isolate_);
  }

 private:
  static void SignalSemaphore(Isolate* isolate, void* data) {
    reinterpret_cast<InterruptTest*>(data)->sem_.Signal();
  }

  void TestBody() {
    CHECK(!ran_test_body_.load());
    CHECK(!ran_to_completion_.load());

    DCHECK(!subject_string_handle_.IsEmpty());

    TryCatch try_catch(env_.isolate());

    isolate_->RequestInterrupt(&SignalSemaphore, this);
    MaybeLocal<Object> result = regexp_handle_.Get(isolate_)->Exec(
        env_.local(), subject_string_handle_.Get(isolate_));
    CHECK(result.IsEmpty());

    CHECK(try_catch.HasTerminated());
    CHECK(ran_test_body_.load());
    CHECK(ran_to_completion_.load());
  }

  class InterruptThread : public base::Thread {
   public:
    explicit InterruptThread(InterruptTest* test)
        : Thread(Options("InterruptTest")), test_(test) {}

    void Run() override {
      CHECK_NOT_NULL(test_body_fn_);

      // Wait for JS execution to start.
      test_->sem_.Wait();

      // Sleep for a bit to allow irregexp execution to start up, then run the
      // test body.
      base::OS::Sleep(base::TimeDelta::FromMilliseconds(50));
      test_->isolate_->RequestInterrupt(&RunTestBody, test_);
      test_->isolate_->RequestInterrupt(&SignalSemaphore, test_);

      // Wait for the scheduled interrupt to signal.
      test_->sem_.Wait();

      // Sleep again to resume irregexp execution, then terminate.
      base::OS::Sleep(base::TimeDelta::FromMilliseconds(50));
      test_->ran_to_completion_.store(true);
      test_->isolate_->TerminateExecution();
    }

    static void RunTestBody(Isolate* isolate, void* data) {
      auto instance = reinterpret_cast<InterruptTest*>(data);
      instance->i_thread.test_body_fn_(isolate, data);
      instance->ran_test_body_.store(true);
    }

    void SetTestBody(InterruptCallback callback) { test_body_fn_ = callback; }

   private:
    InterruptCallback test_body_fn_;
    InterruptTest* test_;
  };

  InterruptThread i_thread;

  LocalContext env_;
  Isolate* isolate_;
  base::Semaphore sem_;  // Coordinates between main and interrupt threads.

  Persistent<String> subject_string_handle_;
  Persistent<RegExp> regexp_handle_;

  std::atomic<bool> ran_test_body_;
  std::atomic<bool> ran_to_completion_;
};

void SetCommonV8FlagsForInterruptTests() {
  // Interrupt tests rely on quirks of the backtracking engine to trigger
  // pattern execution long enough s.t. we can reliably trigger an interrupt
  // while the regexp code is still executing.
  i::v8_flags.enable_experimental_regexp_engine_on_excessive_backtracks = false;
}

}  // namespace

TEST(InterruptAndInvokeMajorGC) {
  // Move all movable objects on GC.
  i::v8_flags.compact_on_every_full_gc = true;
  SetCommonV8FlagsForInterruptTests();
  InterruptTest test{};
  test.SetOneByteSubjectString();
  test.RunTest(InterruptTest::InvokeMajorGC);
}

TEST(InterruptAndMakeSubjectOneByteExternal) {
  SetCommonV8FlagsForInterruptTests();
  InterruptTest test{};
  test.SetOneByteSubjectString();
  test.RunTest(InterruptTest::MakeSubjectOneByteExternal);
}

TEST(InterruptAndMakeSubjectTwoByteExternal) {
  SetCommonV8FlagsForInterruptTests();
  InterruptTest test{};
  test.SetTwoByteSubjectString();
  test.RunTest(InterruptTest::MakeSubjectTwoByteExternal);
}

TEST(InterruptAndIterateStack) {
  i::v8_flags.regexp_tier_up = false;
  SetCommonV8FlagsForInterruptTests();
  InterruptTest test{};
  test.SetOneByteSubjectString();
  test.RunTest(InterruptTest::IterateStack);
}

TEST(InterruptAndTransitionSubjectFromTwoByteToOneByte) {
  SetCommonV8FlagsForInterruptTests();
  InterruptTest test{};
  i::Isolate* i_isolate = test.i_isolate();
  i::HandleScope handle_scope(i_isolate);
  // Internalize a one-byte copy of the two-byte string we are going to
  // internalize during the interrupt. This ensures that the two-byte string
  // transitions to a ThinString pointing to a one-byte string.
  Local<String> internalized_string =
      String::NewFromUtf8(
          reinterpret_cast<Isolate*>(i_isolate), &kOneByteSubjectString[1],
          v8::NewStringType::kInternalized, kSubjectStringLength - 1)
          .ToLocalChecked();
  CHECK(internalized_string->IsOneByte());

  test.SetTwoByteSubjectString();
  Local<String> string = test.GetSubjectString();
  CHECK(!string->IsOneByte());
  // Set the subject string as a substring of the original subject (containing
  // only one-byte characters).
  v8::Local<Value> value =
      CompileRun("subject_string = subject_string.substring(1)");
  test.SetSubjectString(value.As<String>());
  CHECK(test.GetSubjectString()->ContainsOnlyOneByte());

  test.RunTest(InterruptTest::TwoByteSubjectToOneByte);
  // After the test, we expect that bytecode for a one-byte subject has been
  // installed during the interrupt.
  i::DirectHandle<i::JSRegExp> regexp =
      Utils::OpenDirectHandle(*test.GetRegExp());
  i::Tagged<i::IrRegExpData> data =
      CheckedCast<i::IrRegExpData>(regexp->data(i_isolate));
  CHECK(data->has_latin1_bytecode());
}

namespace {

class UncachedOneByteVectorResource : public OneByteVectorResource {
 public:
  using OneByteVectorResource::OneByteVectorResource;
  bool IsCacheable() const override { return false; }
};

void TestRegExpEmptyAdvancePreservesStringShapes(bool node8) {
  i::FlagScope<bool> utf8(&i::v8_flags.utf8_string_semantics, node8);
  CHECK(i::v8_flags.string_slices);
  CcTest::InitializeVM();
  Isolate* isolate = CcTest::isolate();
  i::Isolate* i_isolate = CcTest::i_isolate();
  HandleScope scope(isolate);
  LocalContext env;
  CHECK_EQ(node8 ? 2 : 1, CompileRun("String.fromCodePoint(233).length")
                              ->Int32Value(env.local())
                              .FromJust());

  // No real matcher runs: the empty custom result reaches CSA advancement
  // without the normal regexp execution path first flattening the subject.
  Local<Function> advance = CompileRun(R"JS(
    (function(subject, start, flags) {
      let calls = 0;
      const regexp = { flags, exec() {
        if (calls++ === 0) { this.lastIndex = start; return ['']; }
        return null;
      }};
      const matches = RegExp.prototype[Symbol.match].call(regexp, subject);
      if (calls !== 2 || matches.length !== 1 || matches[0] !== '') {
        throw new Error('custom exec did not exercise empty advancement');
      }
      return regexp.lastIndex;
    })
  )JS")
                                .As<Function>();

  auto check = [&](i::DirectHandle<i::String> subject, uint32_t index,
                   uint32_t byte_next, auto check_shape) {
    const uint32_t expected = node8 ? byte_next : index + 1;
    check_shape();
    for (bool unicode : {false, true}) {
      i::DisallowGarbageCollection no_gc;
      CHECK_EQ(expected,
               i::RegExpUtils::AdvanceStringIndex(*subject, index, unicode));
      check_shape();
    }
    const char* flags[] = {"g", "gu", "gv"};
    for (int i = 0; i < (node8 ? 3 : 1); ++i) {
      Local<Value> args[] = {Utils::ToLocal(subject),
                             Integer::NewFromUnsigned(isolate, index),
                             v8_str(flags[i])};
      CHECK_EQ(expected, advance->Call(env.local(), Undefined(isolate), 3, args)
                             .ToLocalChecked()
                             ->Uint32Value(env.local())
                             .FromJust());
      check_shape();
    }
  };

  // The emoji crosses the cons boundary at byte 16. Other local windows
  // contain a WTF-8 surrogate and a two-byte malformed maximal subpart.
  static const char bytes[] =
      "aaaaaaaaaaaaaa\xf0\x9f\x98\x80x\xed\xa0\x80y\xe4\xb8zbbbbbb";
  static_assert(sizeof(bytes) - 1 == 32);
  auto* factory = i_isolate->factory();
  i::Handle<i::String> left =
      factory->NewStringFromOneByte(base::OneByteVector(bytes, 16))
          .ToHandleChecked();
  i::Handle<i::String> right =
      factory->NewStringFromOneByte(base::OneByteVector(bytes + 16, 16))
          .ToHandleChecked();
  i::DirectHandle<i::String> rope =
      factory->NewConsString(left, right).ToHandleChecked();
  auto check_rope = [&] {
    CHECK(i::IsConsString(*rope));
    CHECK(!rope->IsFlat());
    CHECK_EQ(*left, i::Cast<i::ConsString>(*rope)->first());
    CHECK_EQ(*right, i::Cast<i::ConsString>(*rope)->second());
  };
  check(rope, 0, 1, check_rope);
  check(rope, 14, 18, check_rope);
  check(rope, 15, 16, check_rope);
  check(rope, 19, 22, check_rope);
  check(rope, 23, 25, check_rope);
  check(rope, 32, 33, check_rope);

  i::DirectHandle<i::String> parent =
      factory->NewStringFromOneByte(base::OneByteVector(bytes, 32))
          .ToHandleChecked();
  i::DirectHandle<i::String> slice = factory->NewSubString(parent, 1, 16);
  auto check_slice = [&] {
    CHECK(i::IsSlicedString(*slice));
    CHECK_EQ(*parent, i::Cast<i::SlicedString>(*slice)->parent());
    CHECK_EQ(1, i::Cast<i::SlicedString>(*slice)->offset());
    CHECK_EQ(15, slice->length());
  };
  // The parent has a complete emoji, but the slice ends after its first two
  // bytes. Decoding must stop at the slice boundary, not the parent's end.
  check(slice, 13, 15, check_slice);
  check(slice, 14, 15, check_slice);
  check(slice, 15, 16, check_slice);

  static OneByteVectorResource cached(base::Vector<const char>(bytes, 32));
  static UncachedOneByteVectorResource uncached(
      base::Vector<const char>(bytes, 32));
  const String::ExternalOneByteStringResource* resources[] = {&cached,
                                                              &uncached};
  for (const auto* resource : resources) {
    i::DirectHandle<i::String> external =
        factory->NewExternalStringFromOneByte(resource).ToHandleChecked();
    auto check_external = [&] {
      CHECK(i::IsExternalOneByteString(*external));
      auto string = i::Cast<i::ExternalOneByteString>(*external);
      CHECK_EQ(resource, string->resource());
      CHECK_EQ(!resource->IsCacheable(), string->is_uncached());
    };
    check(external, 0, 1, check_external);
    check(external, 14, 18, check_external);
    check(external, 19, 22, check_external);
    check(external, 23, 25, check_external);
  }
}

}  // namespace

TEST(Node8RegExpEmptyAdvancePreservesStringShapes) {
  TestRegExpEmptyAdvancePreservesStringShapes(true);
}

TEST(StockRegExpEmptyAdvancePreservesStringShapes) {
  TestRegExpEmptyAdvancePreservesStringShapes(false);
}
