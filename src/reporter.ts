/**
 * Runner report formatter.
 */

import type { RunnerReport, WorkflowRunResult } from './types.js';

export type ReportFormat = 'markdown' | 'json' | 'text';

/** Generate a formatted report. */
export function generateReport(
  report: RunnerReport,
  format: ReportFormat = 'markdown'
): string {
  if (format === 'json') return JSON.stringify(report, null, 2);
  if (format === 'text') return generateTextReport(report);
  return generateMarkdownReport(report);
}

function generateMarkdownReport(report: RunnerReport): string {
  const lines: string[] = ['# Workflow Runner Report', ''];

  lines.push(`**Templates:** ${report.templateCount}`);
  lines.push(`**Graph Workflows:** ${report.graphWorkflowCount}`);
  lines.push(
    `**Results:** ${report.passed} passed, ${report.failed} failed`
  );
  lines.push('');

  if (report.graphResults.length > 0) {
    lines.push('## Graph Workflow Results', '');
    lines.push('| Workflow | Status | Steps | Nodes | Events | Checkpoints |');
    lines.push('|----------|--------|-------|-------|--------|-------------|');
    for (const r of report.graphResults) {
      lines.push(formatResultRow(r));
    }
    lines.push('');
  }

  const failed = report.graphResults.filter((r) => r.status !== 'completed');
  if (failed.length > 0) {
    lines.push('## Failures', '');
    for (const r of failed) {
      lines.push(`- **${r.name}**: ${r.error ?? r.status}`);
    }
    lines.push('');
  }

  if (report.traceResult !== null) {
    lines.push('## Trace Data', '');
    lines.push(`- Run ID: ${report.traceResult.runId}`);
    lines.push(`- Events: ${report.traceResult.totalEvents}`);
    lines.push(`- Source: ${report.traceResult.source}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatResultRow(r: WorkflowRunResult): string {
  const icon = r.status === 'completed' ? 'PASS' : 'FAIL';
  return (
    `| ${r.name} | ${icon} | ${r.stepsExecuted} | ` +
    `${r.nodesExecuted} | ${r.eventCount} | ${r.checkpoints} |`
  );
}

function generateTextReport(report: RunnerReport): string {
  const lines: string[] = [];
  lines.push(
    `Workflow Runner: ${report.passed}/${report.graphResults.length} passed`
  );
  for (const r of report.graphResults) {
    const s = r.status === 'completed' ? '[PASS]' : '[FAIL]';
    lines.push(`${s} ${r.name} (${r.stepsExecuted} steps, ${r.durationMs}ms)`);
  }
  return lines.join('\n');
}
