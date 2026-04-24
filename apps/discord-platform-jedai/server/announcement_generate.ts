import { getExecutionContext } from "@databricks/appkit";
import { z } from "zod";

import { buildFullPrompt, type AnnouncementInput } from "./build_prompt.js";
import { buildAiQueryStatement, runWarehouseStatement } from "./execute_ai_query.js";

function readContextFactsFromEnv(): string | undefined {
  const v = process.env.EVENT_CONTEXT_FOR_REQUEST?.trim();
  return v && v.length > 0 ? v : undefined;
}

const announcementCoreSchema = z.object({
  tone: z.string().min(1),
  length: z.string().min(1),
  formality: z.string().min(1),
  emoji_density: z.string().min(1),
  structure: z.string().min(1),
  cta_strength: z.string().min(1),
  user_request: z.string().min(1),
}) satisfies z.ZodType<AnnouncementInput>;

/** POST body: hyperparameters + user_request + optional context (notebook-style [Context facts]). */
export const announcementInputSchema = announcementCoreSchema.extend({
  context_for_request: z.string().optional(),
});

export type AnnouncementGenerateBody = z.infer<typeof announcementInputSchema>;

/** Runs the same ai_query path as the few-shot notebook. */
export async function generateAnnouncementText(input: AnnouncementGenerateBody): Promise<string> {
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  if (!warehouseId) {
    throw new Error("DATABRICKS_WAREHOUSE_ID is not set");
  }

  const foundationEndpoint =
    process.env.FOUNDATION_MODEL_ENDPOINT ?? "databricks-meta-llama-3-3-70b-instruct";
  const temperature = Number(process.env.MODEL_TEMPERATURE ?? 0.7);
  const maxTokens = Number(process.env.MODEL_MAX_TOKENS ?? 2048);

  const { context_for_request, ...core } = input;
  const contextFacts =
    context_for_request !== undefined && context_for_request.trim().length > 0
      ? context_for_request.trim()
      : readContextFactsFromEnv();

  const fullPrompt = buildFullPrompt(core, contextFacts);
  const sqlText = buildAiQueryStatement(
    foundationEndpoint,
    fullPrompt,
    temperature,
    maxTokens,
  );

  const client = getExecutionContext().client;
  const outcome = await runWarehouseStatement(client, warehouseId, sqlText);

  if (outcome.error) {
    throw new Error(outcome.error);
  }

  return outcome.text ?? "";
}
