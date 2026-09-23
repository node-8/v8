// Copyright 2016 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "src/inspector/search-util.h"

#include "src/inspector/protocol/Protocol.h"
#include "src/inspector/v8-inspector-impl.h"
#include "src/inspector/v8-inspector-session-impl.h"
#include "src/inspector/v8-regex.h"

namespace v8_inspector {

namespace {

String8 findMagicComment(const String8& content, const String8& name,
                         bool multiline) {
  DCHECK_EQ(String8::kNotFound, name.find("="));
  size_t length = content.length();
  size_t nameLength = name.length();

  size_t pos = length;
  size_t equalSignPos = 0;
  size_t closingCommentPos = 0;
  while (true) {
    pos = content.reverseFind(name, pos);
    if (pos == String8::kNotFound) return String8();

    // Check for a /\/[\/*][@#][ \t]/ regexp (length of 4) before found name.
    if (pos < 4) return String8();
    pos -= 4;
    if (content[pos] != '/') continue;
    if ((content[pos + 1] != '/' || multiline) &&
        (content[pos + 1] != '*' || !multiline))
      continue;
    if (content[pos + 2] != '#' && content[pos + 2] != '@') continue;
    if (content[pos + 3] != ' ' && content[pos + 3] != '\t') continue;
    equalSignPos = pos + 4 + nameLength;
    if (equalSignPos >= length) continue;
    if (content[equalSignPos] != '=') continue;
    if (multiline) {
      closingCommentPos = content.find("*/", equalSignPos + 1);
      if (closingCommentPos == String8::kNotFound) return String8();
    }

    break;
  }

  DCHECK(equalSignPos);
  DCHECK_LT(equalSignPos, length);
  DCHECK(!multiline || closingCommentPos);
  size_t urlPos = equalSignPos + 1;
  String8 match = multiline
                      ? content.substring(urlPos, closingCommentPos - urlPos)
                      : content.substring(urlPos);

  size_t newLine = match.find("\n");
  if (newLine != String8::kNotFound) match = match.substring(0, newLine);
  match = match.stripWhiteSpace();

  for (size_t i = 0; i < match.length(); ++i) {
    uint8_t c = match[i];
    if (c == '"' || c == '\'' || c == ' ' || c == '\t') return "";
  }

  return match;
}

String8 createSearchRegexSource(const String8& text) {
  String8Builder result;

  for (size_t i = 0; i < text.length(); i++) {
    uint8_t c = text[i];
    if (c == '[' || c == ']' || c == '(' || c == ')' || c == '{' || c == '}' ||
        c == '+' || c == '-' || c == '*' || c == '.' || c == ',' || c == '?' ||
        c == '\\' || c == '^' || c == '$' || c == '|') {
      result.append('\\');
    }
    result.append(c);
  }

  return result.toString();
}

std::unique_ptr<std::vector<size_t>> lineEndings(const String8& text) {
  std::unique_ptr<std::vector<size_t>> result(new std::vector<size_t>());

  const String8 lineEndString = "\n";
  size_t start = 0;
  while (start < text.length()) {
    size_t lineEnd = text.find(lineEndString, start);
    if (lineEnd == String8::kNotFound) break;

    result->push_back(lineEnd);
    start = lineEnd + 1;
  }
  result->push_back(text.length());

  return result;
}

std::vector<std::pair<int, String8>> scriptRegexpMatchesByLines(
    const V8Regex& regex, const String8& text) {
  std::vector<std::pair<int, String8>> result;
  if (text.isEmpty()) return result;

  std::unique_ptr<std::vector<size_t>> endings(lineEndings(text));
  size_t size = endings->size();
  size_t start = 0;
  for (size_t lineNumber = 0; lineNumber < size; ++lineNumber) {
    size_t lineEnd = endings->at(lineNumber);
    String8 line = text.substring(start, lineEnd - start);
    if (line.length() && line[line.length() - 1] == '\r')
      line = line.substring(0, line.length() - 1);

    int matchLength;
    if (regex.match(line, 0, &matchLength) != -1)
      result.push_back(std::pair<int, String8>(lineNumber, line));

    start = lineEnd + 1;
  }
  return result;
}

std::unique_ptr<protocol::Debugger::SearchMatch> buildObjectForSearchMatch(
    int lineNumber, const String8& lineContent) {
  return protocol::Debugger::SearchMatch::create()
      .setLineNumber(lineNumber)
      .setLineContent(lineContent)
      .build();
}

std::unique_ptr<V8Regex> createSearchRegex(V8InspectorImpl* inspector,
                                           const String8& query,
                                           bool caseSensitive, bool isRegex) {
  String8 regexSource = isRegex ? query : createSearchRegexSource(query);
  return std::unique_ptr<V8Regex>(
      new V8Regex(inspector, regexSource, caseSensitive));
}

}  // namespace

std::vector<std::unique_ptr<protocol::Debugger::SearchMatch>>
searchInTextByLinesImpl(V8InspectorImpl* inspector, const String8& text,
                        const String8& query, const bool caseSensitive,
                        const bool isRegex) {
  std::unique_ptr<V8Regex> regex =
      createSearchRegex(inspector, query, caseSensitive, isRegex);
  std::vector<std::pair<int, String8>> matches =
      scriptRegexpMatchesByLines(*regex, text);

  std::vector<std::unique_ptr<protocol::Debugger::SearchMatch>> result;
  result.reserve(matches.size());
  for (const auto& match : matches)
    result.push_back(buildObjectForSearchMatch(match.first, match.second));
  return result;
}

String8 findSourceURL(const String8& content, bool multiline) {
  return findMagicComment(content, "sourceURL", multiline);
}

String8 findSourceMapURL(const String8& content, bool multiline) {
  return findMagicComment(content, "sourceMappingURL", multiline);
}

String8 findDebugId(const String8& content, bool multiline) {
  return findMagicComment(content, "debugId", multiline);
}

}  // namespace v8_inspector
