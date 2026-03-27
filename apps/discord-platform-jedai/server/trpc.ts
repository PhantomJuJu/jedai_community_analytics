import { getWorkspaceClient } from "@databricks/appkit";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

import { buildFullPrompt, type AnnouncementInput } from "./build_prompt.js";
import { buildAiQueryStatement, runWarehouseStatement } from "./execute_ai_query.js";

function readContextFacts(): string | undefined {
  const v = process.env.EVENT_CONTEXT_FOR_REQUEST?.trim();
  return v && v.length > 0 ? v : undefined;
}

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;

const announcementInputSchema: z.ZodType<AnnouncementInput> = z.object({
  tone: z.string().min(1),
  length: z.string().min(1),
  formality: z.string().min(1),
  emoji_density: z.string().min(1),
  structure: z.string().min(1),
  cta_strength: z.string().min(1),
  user_request: z.string().min(1),
});

export const appRouter = t.router({
  generateAnnouncement: publicProcedure
    .input(announcementInputSchema)
    .mutation(async ({ input }) => {
      const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
      if (!warehouseId) {
        throw new Error("DATABRICKS_WAREHOUSE_ID is not set");
      }

      const foundationEndpoint =
        process.env.FOUNDATION_MODEL_ENDPOINT ??
        "databricks-meta-llama-3-3-70b-instruct";
      const temperature = Number(process.env.MODEL_TEMPERATURE ?? 0.3);
      const maxTokens = Number(process.env.MODEL_MAX_TOKENS ?? 2048);

      const fullPrompt = buildFullPrompt(input, readContextFacts());
      const sqlText = buildAiQueryStatement(
        foundationEndpoint,
        fullPrompt,
        temperature,
        maxTokens,
      );

      const client = getWorkspaceClient();
      const outcome = await runWarehouseStatement(client, warehouseId, sqlText);

      if (outcome.error) {
        throw new Error(outcome.error);
      }

      return { text: outcome.text ?? "" };
    }),
});

export type AppRouter = typeof appRouter;
