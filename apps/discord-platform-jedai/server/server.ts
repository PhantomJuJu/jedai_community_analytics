import "dotenv/config";

import { analytics, createApp, getExecutionContext, server } from "@databricks/appkit";
import express from "express";
import { z } from "zod";

import {
  announcementInputSchema,
  generateAnnouncementText,
} from "./announcement_generate.js";
import {
  cancelDiscordPost,
  createScheduledDiscordPost,
  discordScheduleInputSchema,
  getDiscordConfig,
  listDiscordPosts,
} from "./discord_api.js";

const notebookJobRunInputSchema = z.object({}).passthrough();

function parseNotebookJobIdFromEnv(): number {
  const raw = process.env.DATABRICKS_NOTEBOOK_JOB_ID?.trim();
  if (!raw) {
    throw new Error("DATABRICKS_NOTEBOOK_JOB_ID is not set");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("DATABRICKS_NOTEBOOK_JOB_ID must be a positive number");
  }
  return parsed;
}

async function runNotebookJobAndWait() {
  const jobId = parseNotebookJobIdFromEnv();
  // `getWorkspaceClient` on `@databricks/appkit` is Lakebase's helper and requires a config object;
  // use the AppKit execution context client (same as analytics plugin).
  const client = getExecutionContext().client;

  const waiter = await client.jobs.runNow({ job_id: jobId });
  const completedRun = (await waiter.wait()) as {
    run_id?: number;
    run_page_url?: string;
    state?: {
      life_cycle_state?: string;
      result_state?: string;
      state_message?: string;
    };
  };

  const runId = completedRun.run_id ?? waiter.run_id ?? null;
  const lifeCycleState = completedRun.state?.life_cycle_state ?? "UNKNOWN";
  const resultState = completedRun.state?.result_state ?? "UNKNOWN";
  const stateMessage = completedRun.state?.state_message ?? "";
  const runPageUrl = completedRun.run_page_url ?? null;

  if (resultState !== "SUCCESS") {
    throw new Error(
      `Notebook job failed: life_cycle_state=${lifeCycleState}, result_state=${resultState}${stateMessage ? `, message=${stateMessage}` : ""}`,
    );
  }

  return {
    jobId,
    runId,
    runPageUrl,
    lifeCycleState,
    resultState,
    stateMessage,
  };
}

const appkit = await createApp({
  plugins: [server({ autoStart: false }), analytics({})],
});

appkit.server.extend((app) => {
  app.use(express.json({ limit: "512kb" }));

  app.post("/api/announcement/generate", async (req, res) => {
    const parsed = announcementInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    try {
      const text = await generateAnnouncementText(parsed.data);
      res.json({ text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/discord/schedule", async (req, res) => {
    if (!getDiscordConfig()) {
      res.status(503).json({
        error: "Discord scheduling is not configured (DISCORD_API_URL, DISCORD_GUILD_ID)",
      });
      return;
    }
    const parsed = discordScheduleInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await createScheduledDiscordPost(parsed.data);
      res.status(201).json({ postId: result.post_id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
    }
  });

  app.get("/api/discord/posts", async (_req, res) => {
    if (!getDiscordConfig()) {
      res.status(503).json({
        error: "Discord scheduling is not configured (DISCORD_API_URL, DISCORD_GUILD_ID)",
      });
      return;
    }
    try {
      const posts = await listDiscordPosts();
      res.json(posts);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
    }
  });

  app.delete("/api/discord/posts/:postId", async (req, res) => {
    if (!getDiscordConfig()) {
      res.status(503).json({
        error: "Discord scheduling is not configured (DISCORD_API_URL, DISCORD_GUILD_ID)",
      });
      return;
    }
    const postId = typeof req.params.postId === "string" ? req.params.postId.trim() : "";
    if (!postId) {
      res.status(400).json({ error: "postId is required" });
      return;
    }
    try {
      const result = await cancelDiscordPost(postId);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/notebook-job/run", async (req, res) => {
    const parsed = notebookJobRunInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await runNotebookJobAndWait();
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });
});

await appkit.server.start();
