/**
 * Reporter tests for workflow-runner.
 */

import { describe, it, expect } from 'vitest';
import { generateReport } from './reporter.js';
import type { RunnerReport } from './types.js';
import { MOCK_TRACE_RESPONSE } from './fixtures/mock-responses.js';

const SAMPLE_REPORT: RunnerReport = {
  templateCount: 9,
  graphWorkflowCount: 7,
  graphResults: [
    { name: 'echo', status: 'completed', stepsExecuted: 1, nodesExecuted: 1, durationMs: 1, checkpoints: 1, eventCount: 5, hasConditionalEdges: false },
    { name: 'pipeline', status: 'completed', stepsExecuted: 2, nodesExecuted: 2, durationMs: 1, checkpoints: 2, eventCount: 7, hasConditionalEdges: false },
    { name: 'security-scan', status: 'failed', stepsExecuted: 1, nodesExecuted: 1, durationMs: 0, checkpoints: 1, eventCount: 3, hasConditionalEdges: true, error: 'Empty input' },
  ],
  passed: 2,
  failed: 1,
  traceResult: MOCK_TRACE_RESPONSE,
};

describe('generateReport', () => {
  it('generates markdown with table', () => {
    const report = generateReport(SAMPLE_REPORT, 'markdown');
    expect(report).toContain('# Workflow Runner Report');
    expect(report).toContain('**Templates:** 9');
    expect(report).toContain('2 passed, 1 failed');
    expect(report).toContain('| echo |');
    expect(report).toContain('PASS');
    expect(report).toContain('FAIL');
  });

  it('includes failures section', () => {
    const report = generateReport(SAMPLE_REPORT, 'markdown');
    expect(report).toContain('## Failures');
    expect(report).toContain('security-scan');
    expect(report).toContain('Empty input');
  });

  it('includes trace section', () => {
    const report = generateReport(SAMPLE_REPORT, 'markdown');
    expect(report).toContain('## Trace Data');
    expect(report).toContain('wf-run-001');
  });

  it('generates valid JSON', () => {
    const report = generateReport(SAMPLE_REPORT, 'json');
    const parsed = JSON.parse(report) as RunnerReport;
    expect(parsed.templateCount).toBe(9);
    expect(parsed.graphResults.length).toBe(3);
  });

  it('generates text format', () => {
    const report = generateReport(SAMPLE_REPORT, 'text');
    expect(report).toContain('[PASS] echo');
    expect(report).toContain('[FAIL] security-scan');
    expect(report).toContain('2/3 passed');
  });

  it('omits failures section when all pass', () => {
    const allPass: RunnerReport = {
      ...SAMPLE_REPORT,
      graphResults: SAMPLE_REPORT.graphResults.filter((r) => r.status === 'completed'),
      passed: 2,
      failed: 0,
    };
    const report = generateReport(allPass, 'markdown');
    expect(report).not.toContain('## Failures');
  });

  it('omits trace section when null', () => {
    const noTrace: RunnerReport = { ...SAMPLE_REPORT, traceResult: null };
    const report = generateReport(noTrace, 'markdown');
    expect(report).not.toContain('## Trace Data');
  });
});
