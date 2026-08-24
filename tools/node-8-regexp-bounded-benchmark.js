// Run with:
//   out/x64.release/d8 --utf8-string-semantics --no-regexp-tier-up \
//     tools/node-8-regexp-bounded-benchmark.js

'use strict';

const samples = 11;
const iterations = 1000;
const gateRatio = 1.02;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

function execute(regexp, subject, count) {
  let checksum = 0;
  for (let iteration = 0; iteration < count; ++iteration) {
    regexp.lastIndex = 0;
    let match;
    while ((match = regexp.exec(subject)) !== null) {
      checksum = (checksum * 33 + match.index * 7 + match[0].length) >>> 0;
      // RegExp.prototype.exec does not advance after an empty global match.
      if (match[0].length === 0) regexp.lastIndex++;
    }
  }
  return checksum;
}

function measureOnce(regexp, subject) {
  const start = performance.now();
  const checksum = execute(regexp, subject, iterations);
  return {elapsed_ms: performance.now() - start, checksum};
}

function compare(name, candidate, baseline, subject) {
  execute(candidate, subject, 100);
  execute(baseline, subject, 100);
  const candidateTimes = [];
  const baselineTimes = [];
  let checksum;
  for (let sample = 0; sample < samples; ++sample) {
    const first = sample % 2 === 0 ? candidate : baseline;
    const second = sample % 2 === 0 ? baseline : candidate;
    const firstResult = measureOnce(first, subject);
    const secondResult = measureOnce(second, subject);
    if (firstResult.checksum !== secondResult.checksum ||
        (checksum !== undefined && checksum !== firstResult.checksum)) {
      throw new Error(`${name}: candidate and baseline did different work`);
    }
    checksum = firstResult.checksum;
    candidateTimes.push(
        (sample % 2 === 0 ? firstResult : secondResult).elapsed_ms);
    baselineTimes.push(
        (sample % 2 === 0 ? secondResult : firstResult).elapsed_ms);
  }
  const candidateMedian = median(candidateTimes);
  const baselineMedian = median(baselineTimes);
  const ratio = candidateMedian / baselineMedian;
  return {
    name,
    subject_bytes: subject.length,
    checksum,
    samples,
    iterations,
    candidate_median_ms: candidateMedian,
    baseline_median_ms: baselineMedian,
    candidate_time_over_baseline: ratio,
    gate_ratio: gateRatio,
    passed: ratio <= gateRatio,
  };
}

function observe(name, regexp, subject) {
  execute(regexp, subject, 100);
  const times = [];
  let checksum;
  for (let sample = 0; sample < samples; ++sample) {
    const result = measureOnce(regexp, subject);
    if (checksum !== undefined && checksum !== result.checksum) {
      throw new Error(`${name}: unstable checksum`);
    }
    checksum = result.checksum;
    times.push(result.elapsed_ms);
  }
  return {
    name,
    subject_bytes: subject.length,
    checksum,
    samples,
    iterations,
    candidate_median_ms: median(times),
  };
}

const run25 = ('bcdefa'.repeat(1700) + 'bcdef').slice(0, 10185);
const run03 = ('bcad'.repeat(4070)).slice(0, 16280);
const unicodeRun = (String.fromCodePoint(0x4e2d) +
                    String.fromCodePoint(0x1f600) + 'a').repeat(1600);
const malformedUnit = String.fromCharCode(0xe2, 0x82, 0x62, 0x61);
const malformedRun = malformedUnit.repeat(4000);

const results = [
  compare('ascii_negated_2_5', /[^a]{2,5}/g, /(?:[^a]){2,5}/g, run25),
  compare('ascii_negated_0_3', /[^a]{0,3}/g, /(?:[^a]){0,3}/g, run03),
];
const observations = [
  observe('unicode_negated_2_5', /[^a]{2,5}/gu, unicodeRun),
  observe('malformed_negated_2_5', /[^\n]{2,5}/gu, malformedRun),
];

print(JSON.stringify({
  schema_version: 1,
  generated_native_wtf8_bounded: true,
  same_work: true,
  gate_ratio: gateRatio,
  passed: results.every(result => result.passed),
  results,
  observations,
}));
