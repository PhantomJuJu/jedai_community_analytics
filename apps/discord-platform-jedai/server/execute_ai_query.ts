import type { WorkspaceClient } from "@databricks/sdk-experimental";

function escapeSqlStringLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

export function buildAiQueryStatement(
  foundationEndpoint: string,
  fullPrompt: string,
  temperature: number,
  maxTokens: number,
): string {
  const escaped = escapeSqlStringLiteral(fullPrompt);
  const ep = escapeSqlStringLiteral(foundationEndpoint);
  return (
    `SELECT ai_query('${ep}', '${escaped}', ` +
    `modelParameters => named_struct('temperature', CAST(${temperature} AS DOUBLE), ` +
    `'max_tokens', CAST(${maxTokens} AS INT)), ` +
    `failOnError => false) AS announcement`
  );
}

type AiStruct = { result?: string; errorMessage?: string };

function parseAnnouncementCell(raw: string): { text?: string; error?: string } {
  try {
    const parsed = JSON.parse(raw) as AiStruct;
    if (parsed.errorMessage) return { error: parsed.errorMessage };
    if (parsed.result !== undefined) return { text: parsed.result };
  } catch {
    /* not JSON */
  }
  return { text: raw };
}

export async function runWarehouseStatement(
  client: WorkspaceClient,
  warehouseId: string,
  statement: string,
): Promise<{ text?: string; error?: string }> {
  let resp = await client.statementExecution.executeStatement({
    warehouse_id: warehouseId,
    statement,
    wait_timeout: "50s",
    on_wait_timeout: "CONTINUE",
    disposition: "INLINE",
    format: "JSON_ARRAY",
  });

  const deadline = Date.now() + 120_000;
  while (resp.status?.state === "PENDING" || resp.status?.state === "RUNNING") {
    if (Date.now() > deadline) {
      return { error: "Statement polling exceeded timeout" };
    }
    await new Promise((r) => setTimeout(r, 1000));
    const sid = resp.statement_id;
    if (!sid) return { error: "Missing statement_id from warehouse" };
    resp = await client.statementExecution.getStatement({ statement_id: sid });
  }

  if (resp.status?.state === "FAILED") {
    return { error: resp.status.error?.message ?? "Statement failed" };
  }

  const cell = resp.result?.data_array?.[0]?.[0];
  if (cell === undefined || cell === null) {
    return { error: "Empty result from ai_query" };
  }
  return parseAnnouncementCell(cell);
}
