/**
 * Zod schema validation tests for workflow-runner.
 */

import { describe, it, expect } from 'vitest';
import {
  ListWorkflowsInputSchema,
  ListWorkflowsResponseSchema,
  RunGraphInputSchema,
  RunGraphResponseSchema,
  GraphWorkflowListSchema,
  QueryTraceInputSchema,
  QueryTraceResponseSchema,
  RunWorkflowInputSchema,
  RunWorkflowResponseSchema,
  RunWorkflowDryRunSchema,
} from './types.js';
import {
  MOCK_LIST_WORKFLOWS,
  MOCK_GRAPH_LIST,
  MOCK_ECHO_RESULT,
  MOCK_PIPELINE_RESULT,
  MOCK_CODE_REVIEW_RESULT,
  MOCK_FAILED_RESULT,
  MOCK_TRACE_RESPONSE,
  MOCK_TRACE_NOT_FOUND,
  MOCK_RUN_WORKFLOW_SUCCESS,
  MOCK_RUN_WORKFLOW_FAILED,
  MOCK_RUN_WORKFLOW_DRY_RUN,
  MOCK_RUN_WORKFLOW_DRY_RUN_INVALID,
} from './fixtures/mock-responses.js';

describe('ListWorkflowsInputSchema', () => {
  it('accepts empty input', () => {
    expect(ListWorkflowsInputSchema.safeParse({}).success).toBe(true);
  });

  it('accepts format option', () => {
    for (const format of ['full', 'names']) {
      expect(
        ListWorkflowsInputSchema.safeParse({ format }).success
      ).toBe(true);
    }
  });

  it('rejects invalid format', () => {
    expect(
      ListWorkflowsInputSchema.safeParse({ format: 'xml' }).success
    ).toBe(false);
  });
});

describe('ListWorkflowsResponseSchema', () => {
  it('validates workflow list', () => {
    const result = ListWorkflowsResponseSchema.safeParse(MOCK_LIST_WORKFLOWS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(9);
    }
  });
});

describe('RunGraphInputSchema', () => {
  it('accepts valid input', () => {
    const result = RunGraphInputSchema.safeParse({
      workflow: 'echo',
      inputs: { input: 'test' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty workflow name', () => {
    expect(
      RunGraphInputSchema.safeParse({ workflow: '' }).success
    ).toBe(false);
  });

  it('accepts workflow name up to 100 chars', () => {
    expect(
      RunGraphInputSchema.safeParse({ workflow: 'a'.repeat(100) }).success
    ).toBe(true);
  });

  it('rejects workflow name over 100 chars', () => {
    expect(
      RunGraphInputSchema.safeParse({ workflow: 'a'.repeat(101) }).success
    ).toBe(false);
  });
});

describe('RunGraphResponseSchema', () => {
  it('validates echo result', () => {
    expect(RunGraphResponseSchema.safeParse(MOCK_ECHO_RESULT).success).toBe(true);
  });

  it('validates pipeline result', () => {
    expect(RunGraphResponseSchema.safeParse(MOCK_PIPELINE_RESULT).success).toBe(true);
  });

  it('validates code-review result', () => {
    expect(RunGraphResponseSchema.safeParse(MOCK_CODE_REVIEW_RESULT).success).toBe(true);
  });

  it('validates failed result with error', () => {
    const result = RunGraphResponseSchema.safeParse(MOCK_FAILED_RESULT);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.error).toBeDefined();
    }
  });

  it('rejects invalid status', () => {
    expect(
      RunGraphResponseSchema.safeParse({
        ...MOCK_ECHO_RESULT,
        status: 'pending',
      }).success
    ).toBe(false);
  });
});

describe('GraphWorkflowListSchema', () => {
  it('validates graph workflow list', () => {
    const result = GraphWorkflowListSchema.safeParse(MOCK_GRAPH_LIST);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(7);
    }
  });

  it('validates conditional edge flags', () => {
    const result = GraphWorkflowListSchema.safeParse(MOCK_GRAPH_LIST);
    expect(result.success).toBe(true);
    if (result.success) {
      const conditional = result.data.filter((w) => w.hasConditionalEdges);
      expect(conditional.length).toBe(2);
    }
  });
});

describe('QueryTraceInputSchema', () => {
  it('accepts valid input', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'run-123' }).success
    ).toBe(true);
  });

  it('rejects empty runId', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: '' }).success
    ).toBe(false);
  });

  it('accepts limit within range', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'x', limit: 50 }).success
    ).toBe(true);
  });

  it('rejects limit over 500', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'x', limit: 501 }).success
    ).toBe(false);
  });
});

describe('QueryTraceResponseSchema', () => {
  it('validates trace response', () => {
    expect(
      QueryTraceResponseSchema.safeParse(MOCK_TRACE_RESPONSE).success
    ).toBe(true);
  });

  it('validates not-found response', () => {
    expect(
      QueryTraceResponseSchema.safeParse(MOCK_TRACE_NOT_FOUND).success
    ).toBe(true);
  });

  it('rejects invalid source', () => {
    expect(
      QueryTraceResponseSchema.safeParse({
        ...MOCK_TRACE_RESPONSE,
        source: 'memory',
      }).success
    ).toBe(false);
  });
});

// ============================================================================
// run_workflow
// ============================================================================

describe('RunWorkflowInputSchema', () => {
  it('accepts valid input', () => {
    const r = RunWorkflowInputSchema.safeParse({
      template: 'code-review',
      inputs: { file: 'src/index.ts' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts dryRun option', () => {
    const r = RunWorkflowInputSchema.safeParse({
      template: 'documentation-update',
      inputs: { section: 'overview' },
      dryRun: true,
    });
    expect(r.success).toBe(true);
  });

  it('accepts empty inputs object', () => {
    const r = RunWorkflowInputSchema.safeParse({
      template: 'code-review',
      inputs: {},
    });
    expect(r.success).toBe(true);
  });

  it('accepts file-path template', () => {
    const r = RunWorkflowInputSchema.safeParse({
      template: './workflows/custom.yaml',
      inputs: {},
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty template', () => {
    expect(
      RunWorkflowInputSchema.safeParse({ template: '', inputs: {} }).success
    ).toBe(false);
  });

  it('rejects missing inputs', () => {
    expect(
      RunWorkflowInputSchema.safeParse({ template: 'code-review' }).success
    ).toBe(false);
  });

  it('rejects non-string template', () => {
    expect(
      RunWorkflowInputSchema.safeParse({ template: 42, inputs: {} }).success
    ).toBe(false);
  });

  it('rejects input key over 100 chars', () => {
    const longKey = 'a'.repeat(101);
    expect(
      RunWorkflowInputSchema.safeParse({
        template: 'code-review',
        inputs: { [longKey]: 'x' },
      }).success
    ).toBe(false);
  });

  it('accepts unknown value types in inputs', () => {
    const r = RunWorkflowInputSchema.safeParse({
      template: 'code-review',
      inputs: {
        str: 'hello',
        num: 42,
        bool: true,
        obj: { nested: 'value' },
        arr: [1, 2, 3],
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('RunWorkflowResponseSchema', () => {
  it('parses success response', () => {
    const r = RunWorkflowResponseSchema.safeParse(MOCK_RUN_WORKFLOW_SUCCESS);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('completed');
      expect(r.data.stepResults).toHaveLength(2);
      expect(r.data.stepResults[0]?.status).toBe('success');
    }
  });

  it('parses failed response with error on step', () => {
    const r = RunWorkflowResponseSchema.safeParse(MOCK_RUN_WORKFLOW_FAILED);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('failed');
      const failedStep = r.data.stepResults.find((s) => s.status === 'failed');
      expect(failedStep).toBeDefined();
      expect(failedStep?.error).toBe('Adapter unavailable');
    }
  });

  it('accepts skipped step status', () => {
    const r = RunWorkflowResponseSchema.safeParse(MOCK_RUN_WORKFLOW_FAILED);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stepResults.some((s) => s.status === 'skipped')).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(
      RunWorkflowResponseSchema.safeParse({
        ...MOCK_RUN_WORKFLOW_SUCCESS,
        status: 'pending',
      }).success
    ).toBe(false);
  });

  it('rejects invalid stepResult status', () => {
    const bad = {
      ...MOCK_RUN_WORKFLOW_SUCCESS,
      stepResults: [
        { stepId: 'x', status: 'bogus', durationMs: 1 },
      ],
    };
    expect(RunWorkflowResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts null output', () => {
    expect(RunWorkflowResponseSchema.safeParse(MOCK_RUN_WORKFLOW_FAILED).success).toBe(true);
  });
});

describe('RunWorkflowDryRunSchema', () => {
  it('parses valid dry run', () => {
    const r = RunWorkflowDryRunSchema.safeParse(MOCK_RUN_WORKFLOW_DRY_RUN);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.valid).toBe(true);
      expect(r.data.inputsMissing).toHaveLength(0);
    }
  });

  it('parses invalid dry run with missing inputs', () => {
    const r = RunWorkflowDryRunSchema.safeParse(MOCK_RUN_WORKFLOW_DRY_RUN_INVALID);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.valid).toBe(false);
      expect(r.data.inputsMissing).toContain('section');
      expect(r.data.validationErrors.length).toBeGreaterThan(0);
    }
  });
});
