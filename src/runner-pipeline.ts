/**
 * Workflow runner pipeline.
 *
 * Chains: list_workflows → run_graph_workflow → query_trace
 * to exercise all workflow templates and validate outputs.
 */

import type {
  ListWorkflowsResponse,
  RunGraphResponse,
  GraphWorkflowInfo,
  QueryTraceResponse,
  WorkflowRunResult,
  RunnerReport,
  RunnerConfig,
} from './types.js';
import {
  ListWorkflowsResponseSchema,
  GraphWorkflowListSchema,
  RunGraphResponseSchema,
  QueryTraceResponseSchema,
} from './types.js';

// ============================================================================
// Tool caller abstraction
// ============================================================================

export interface ToolCaller {
  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================================
// Default graph workflow inputs
// ============================================================================

const DEFAULT_GRAPH_INPUTS: Readonly<Record<string, Record<string, unknown>>> = {
  echo: { input: 'workflow-runner test' },
  pipeline: { input: 'validation test data' },
  'code-review': { code: 'function add(a: number, b: number): number { return a + b; }' },
  'security-scan': { code: 'import fs from "fs"; fs.readFileSync("/etc/passwd");' },
  'security-audit': { code: 'const password = process.env.DB_PASSWORD;' },
  'test-generation': { code: 'export function sum(a: number, b: number): number { return a + b; }' },
  documentation: { topic: 'API design', code: 'app.get("/users", getUsers);' },
};

// ============================================================================
// Individual steps
// ============================================================================

/** Step 1: List all workflow templates. */
export async function listTemplates(
  caller: ToolCaller
): Promise<ListWorkflowsResponse> {
  const raw = await caller.call('list_workflows', { format: 'names' });
  return ListWorkflowsResponseSchema.parse(raw);
}

/** Step 2: List all graph workflows. */
export async function listGraphWorkflows(
  caller: ToolCaller
): Promise<readonly GraphWorkflowInfo[]> {
  const raw = await caller.call('run_graph_workflow', { workflow: 'list' });
  return GraphWorkflowListSchema.parse(raw);
}

/** Step 3: Execute a single graph workflow. */
export async function executeGraph(
  caller: ToolCaller,
  name: string,
  inputs: Record<string, unknown>
): Promise<RunGraphResponse> {
  const raw = await caller.call('run_graph_workflow', {
    workflow: name,
    inputs,
    enableCheckpointing: true,
  });
  return RunGraphResponseSchema.parse(raw);
}

/** Step 4: Query traces for a run. */
export async function queryTrace(
  caller: ToolCaller,
  runId: string
): Promise<QueryTraceResponse> {
  const raw = await caller.call('query_trace', { runId });
  return QueryTraceResponseSchema.parse(raw);
}

// ============================================================================
// Analysis helpers
// ============================================================================

/** Convert a graph execution to a WorkflowRunResult. */
export function toRunResult(
  info: GraphWorkflowInfo,
  response: RunGraphResponse
): WorkflowRunResult {
  return {
    name: response.workflow,
    status: response.status,
    stepsExecuted: response.stepsExecuted,
    nodesExecuted: response.nodesExecuted,
    durationMs: response.durationMs,
    checkpoints: response.checkpointCount,
    eventCount: response.events.length,
    hasConditionalEdges: info.hasConditionalEdges,
    ...(response.error !== undefined ? { error: response.error } : {}),
  };
}

/** Create an error result for a failed execution. */
export function toErrorResult(
  name: string,
  error: string
): WorkflowRunResult {
  return {
    name,
    status: 'error',
    stepsExecuted: 0,
    nodesExecuted: 0,
    durationMs: 0,
    checkpoints: 0,
    eventCount: 0,
    hasConditionalEdges: false,
    error,
  };
}

/** Count passed/failed results. */
export function countResults(
  results: readonly WorkflowRunResult[]
): { passed: number; failed: number } {
  const passed = results.filter((r) => r.status === 'completed').length;
  return { passed, failed: results.length - passed };
}

// ============================================================================
// Full pipeline
// ============================================================================

/** Run the complete workflow runner pipeline. */
export async function runWorkflowPipeline(
  caller: ToolCaller,
  config: RunnerConfig = {}
): Promise<RunnerReport> {
  // Step 1: Discover templates
  const templates = await listTemplates(caller);

  // Step 2: Discover and execute graph workflows
  const graphInfos = await listGraphWorkflows(caller);
  const graphResults: WorkflowRunResult[] = [];

  if (config.runGraphWorkflows !== false) {
    const userInputs = config.graphInputs ?? {};
    for (const info of graphInfos) {
      const inputs =
        userInputs[info.name] ?? DEFAULT_GRAPH_INPUTS[info.name] ?? {};
      try {
        const response = await executeGraph(caller, info.name, inputs);
        graphResults.push(toRunResult(info, response));
      } catch {
        graphResults.push(toErrorResult(info.name, 'Execution failed'));
      }
    }
  }

  // Step 3: Query traces (if configured)
  let traceResult: QueryTraceResponse | null = null;
  if (config.traceRunId !== undefined) {
    try {
      traceResult = await queryTrace(caller, config.traceRunId);
    } catch {
      traceResult = null;
    }
  }

  const { passed, failed } = countResults(graphResults);

  return {
    templateCount: templates.count,
    graphWorkflowCount: graphInfos.length,
    graphResults,
    passed,
    failed,
    traceResult,
  };
}
