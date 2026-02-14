/**
 * Runner pipeline tests — template discovery, graph execution, trace query.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ToolCaller } from './runner-pipeline.js';
import {
  listTemplates,
  listGraphWorkflows,
  executeGraph,
  queryTrace,
  toRunResult,
  toErrorResult,
  countResults,
  runWorkflowPipeline,
} from './runner-pipeline.js';
import type { RunnerConfig, WorkflowRunResult } from './types.js';
import {
  MOCK_LIST_WORKFLOWS,
  MOCK_GRAPH_LIST,
  MOCK_ECHO_RESULT,
  MOCK_PIPELINE_RESULT,
  MOCK_CODE_REVIEW_RESULT,
  MOCK_FAILED_RESULT,
  MOCK_TRACE_RESPONSE,
  MOCK_TRACE_NOT_FOUND,
  EXPECTED_TEMPLATE_NAMES,
} from './fixtures/mock-responses.js';

function createMockCaller(
  responses: Record<string, unknown>
): ToolCaller & { calls: Array<{ tool: string; args: Record<string, unknown> }> } {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    call: vi.fn(async (toolName: string, args: Record<string, unknown>) => {
      calls.push({ tool: toolName, args });
      const response = responses[toolName];
      if (response === undefined) throw new Error(`No mock: ${toolName}`);
      return response;
    }),
  };
}

// ============================================================================
// listTemplates
// ============================================================================

describe('listTemplates', () => {
  it('returns all 9 workflow templates', async () => {
    const caller = createMockCaller({ list_workflows: MOCK_LIST_WORKFLOWS });

    const result = await listTemplates(caller);

    expect(result.count).toBe(9);
    expect(result.workflows.length).toBe(9);
  });

  it('contains expected template names', async () => {
    const caller = createMockCaller({ list_workflows: MOCK_LIST_WORKFLOWS });

    const result = await listTemplates(caller);
    const names = result.workflows.map((w) => w.name);

    for (const expected of EXPECTED_TEMPLATE_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it('passes format arg', async () => {
    const caller = createMockCaller({ list_workflows: MOCK_LIST_WORKFLOWS });

    await listTemplates(caller);

    expect(caller.calls[0]?.args['format']).toBe('names');
  });
});

// ============================================================================
// listGraphWorkflows
// ============================================================================

describe('listGraphWorkflows', () => {
  it('returns graph workflow list', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_GRAPH_LIST,
    });

    const result = await listGraphWorkflows(caller);

    expect(result.length).toBe(7);
    expect(result[0]!.name).toBe('echo');
  });

  it('passes workflow="list"', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_GRAPH_LIST,
    });

    await listGraphWorkflows(caller);

    expect(caller.calls[0]?.args['workflow']).toBe('list');
  });

  it('identifies conditional edge workflows', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_GRAPH_LIST,
    });

    const result = await listGraphWorkflows(caller);
    const conditional = result.filter((w) => w.hasConditionalEdges);

    expect(conditional.length).toBe(2);
    expect(conditional.map((c) => c.name)).toContain('code-review');
    expect(conditional.map((c) => c.name)).toContain('security-scan');
  });
});

// ============================================================================
// executeGraph
// ============================================================================

describe('executeGraph', () => {
  it('executes echo workflow', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_ECHO_RESULT,
    });

    const result = await executeGraph(caller, 'echo', { input: 'test' });

    expect(result.workflow).toBe('echo');
    expect(result.status).toBe('completed');
    expect(result.stepsExecuted).toBe(1);
  });

  it('executes pipeline workflow', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_PIPELINE_RESULT,
    });

    const result = await executeGraph(caller, 'pipeline', { input: 'data' });

    expect(result.stepsExecuted).toBe(2);
    expect(result.nodesExecuted).toBe(2);
    expect(result.checkpointCount).toBe(2);
  });

  it('handles conditional routing', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_CODE_REVIEW_RESULT,
    });

    const result = await executeGraph(caller, 'code-review', { code: 'x' });

    expect(result.stepsExecuted).toBe(3);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('handles failed workflow', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_FAILED_RESULT,
    });

    const result = await executeGraph(caller, 'security-scan', { code: '' });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
  });

  it('passes enableCheckpointing', async () => {
    const caller = createMockCaller({
      run_graph_workflow: MOCK_ECHO_RESULT,
    });

    await executeGraph(caller, 'echo', { input: 'x' });

    expect(caller.calls[0]?.args['enableCheckpointing']).toBe(true);
  });
});

// ============================================================================
// queryTrace
// ============================================================================

describe('queryTrace', () => {
  it('returns trace events', async () => {
    const caller = createMockCaller({ query_trace: MOCK_TRACE_RESPONSE });

    const result = await queryTrace(caller, 'wf-run-001');

    expect(result.events.length).toBe(3);
    expect(result.source).toBe('disk');
  });

  it('handles not-found trace', async () => {
    const caller = createMockCaller({ query_trace: MOCK_TRACE_NOT_FOUND });

    const result = await queryTrace(caller, 'nonexistent');

    expect(result.events.length).toBe(0);
    expect(result.source).toBe('not_found');
  });
});

// ============================================================================
// toRunResult / toErrorResult / countResults
// ============================================================================

describe('toRunResult', () => {
  it('converts graph response to run result', () => {
    const info = MOCK_GRAPH_LIST[0]!;
    const result = toRunResult(info, MOCK_ECHO_RESULT);

    expect(result.name).toBe('echo');
    expect(result.status).toBe('completed');
    expect(result.eventCount).toBe(5);
    expect(result.hasConditionalEdges).toBe(false);
  });

  it('preserves error from failed workflow', () => {
    const info = MOCK_GRAPH_LIST[3]!;
    const result = toRunResult(info, MOCK_FAILED_RESULT);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Empty code input');
  });
});

describe('toErrorResult', () => {
  it('creates error result', () => {
    const result = toErrorResult('test', 'something broke');
    expect(result.status).toBe('error');
    expect(result.error).toBe('something broke');
    expect(result.stepsExecuted).toBe(0);
  });
});

describe('countResults', () => {
  it('counts passed and failed', () => {
    const results: WorkflowRunResult[] = [
      { name: 'a', status: 'completed', stepsExecuted: 1, nodesExecuted: 1, durationMs: 1, checkpoints: 1, eventCount: 1, hasConditionalEdges: false },
      { name: 'b', status: 'failed', stepsExecuted: 0, nodesExecuted: 0, durationMs: 0, checkpoints: 0, eventCount: 0, hasConditionalEdges: false },
      { name: 'c', status: 'completed', stepsExecuted: 2, nodesExecuted: 2, durationMs: 2, checkpoints: 2, eventCount: 2, hasConditionalEdges: true },
    ];
    const { passed, failed } = countResults(results);
    expect(passed).toBe(2);
    expect(failed).toBe(1);
  });

  it('handles empty results', () => {
    const { passed, failed } = countResults([]);
    expect(passed).toBe(0);
    expect(failed).toBe(0);
  });
});

// ============================================================================
// runWorkflowPipeline
// ============================================================================

describe('runWorkflowPipeline', () => {
  it('runs full pipeline discovering and executing workflows', async () => {
    let graphCallCount = 0;
    const graphResponses = [MOCK_GRAPH_LIST, MOCK_ECHO_RESULT, MOCK_PIPELINE_RESULT];
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          return graphResponses[graphCallCount++];
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    // Only run echo + pipeline (first 2 graph workflows)
    const twoGraphs = MOCK_GRAPH_LIST.slice(0, 2);
    const listThenExec = [twoGraphs, MOCK_ECHO_RESULT, MOCK_PIPELINE_RESULT];
    let idx = 0;
    const simpleCaller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') return listThenExec[idx++];
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(simpleCaller);

    expect(result.templateCount).toBe(9);
    expect(result.graphWorkflowCount).toBe(2);
    expect(result.graphResults.length).toBe(2);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('includes trace when configured', async () => {
    let graphIdx = 0;
    const graphResponses = [MOCK_GRAPH_LIST.slice(0, 1), MOCK_ECHO_RESULT];
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') return graphResponses[graphIdx++];
        if (toolName === 'query_trace') return MOCK_TRACE_RESPONSE;
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const config: RunnerConfig = { traceRunId: 'wf-run-001' };
    const result = await runWorkflowPipeline(caller, config);

    expect(result.traceResult).not.toBeNull();
    expect(result.traceResult!.events.length).toBe(3);
  });

  it('skips graph execution when disabled', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') return MOCK_GRAPH_LIST;
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const config: RunnerConfig = { runGraphWorkflows: false };
    const result = await runWorkflowPipeline(caller, config);

    expect(result.templateCount).toBe(9);
    expect(result.graphResults.length).toBe(0);
  });

  it('handles execution errors gracefully', async () => {
    let graphIdx = 0;
    const caller: ToolCaller = {
      call: vi.fn(async (toolName: string) => {
        if (toolName === 'list_workflows') return MOCK_LIST_WORKFLOWS;
        if (toolName === 'run_graph_workflow') {
          if (graphIdx++ === 0) return MOCK_GRAPH_LIST.slice(0, 1);
          throw new Error('Execution timeout');
        }
        throw new Error(`Unexpected: ${toolName}`);
      }),
    };

    const result = await runWorkflowPipeline(caller);

    expect(result.graphResults.length).toBe(1);
    expect(result.graphResults[0]!.status).toBe('error');
    expect(result.failed).toBe(1);
  });
});
