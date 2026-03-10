import { config } from '../config.js';

const MAX = config.logging.maxEntries;
const logs = [];

export function logApiCall(entry) {
  if (!config.logging.apiCalls) return;

  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  const tokens = entry.inputTokens
    ? ` [${entry.inputTokens}→${entry.outputTokens} tok]`
    : '';
  const status = entry.success ? '✓' : '✗';
  console.log(
    `[API] ${status} ${entry.provider}/${entry.model || '?'} ${entry.durationMs}ms${tokens}`
  );

  logs.push(record);
  if (logs.length > MAX) logs.splice(0, logs.length - MAX);
}

export function getLogs(limit = 50, offset = 0) {
  const reversed = [...logs].reverse();
  return {
    logs: reversed.slice(offset, offset + limit),
    total: logs.length,
  };
}

export function clearLogs() {
  logs.length = 0;
}
