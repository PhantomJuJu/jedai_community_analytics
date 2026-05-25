import type { createApp } from "@databricks/appkit";
import type { Express, Request, Response } from "express";

type AppKitInstance = Awaited<ReturnType<typeof createApp>> & {
  genie: {
    sendMessage: (
      alias: string,
      content: string,
      conversationId?: string,
      options?: { timeout?: number },
    ) => AsyncGenerator<{ type: string }>;
    getConversation: (
      alias: string,
      conversationId: string,
    ) => Promise<{
      conversationId: string;
      spaceId: string;
      messages: Array<{
        messageId: string;
        conversationId: string;
        spaceId: string;
        status: string;
        content: string;
        attachments?: Array<{
          attachmentId?: string;
          query?: { statementId?: string };
        }>;
      }>;
    }>;
  };
};

function writeSseEvent(res: Response, data: unknown, eventId?: string): void {
  const lines: string[] = [];
  if (eventId) {
    lines.push(`id: ${eventId}`);
  }
  lines.push(`data: ${JSON.stringify(data)}`);
  res.write(`${lines.join("\n")}\n\n`);
}

function beginSse(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

async function streamGenieEvents(
  res: Response,
  events: AsyncGenerator<{ type: string }>,
  requestId?: string,
): Promise<void> {
  for await (const event of events) {
    writeSseEvent(res, event, requestId);
  }
}

/**
 * Genie routes that run as the app service principal (not user OBO).
 * Avoids "required scopes: genie" when the user's forwarded token lacks dashboards.genie/genie.
 */
export function registerGenieSpRoutes(app: Express, appkit: AppKitInstance): void {
  app.post("/api/genie-sp/:alias/messages", async (req: Request, res: Response) => {
    console.info("[genie-sp] POST messages (service principal)");
    const alias = typeof req.params.alias === "string" ? req.params.alias : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const conversationId =
      typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;
    const requestId =
      typeof req.query.requestId === "string" ? req.query.requestId : undefined;

    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    beginSse(res);
    try {
      await streamGenieEvents(
        res,
        appkit.genie.sendMessage(alias, content, conversationId),
        requestId,
      );
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeSseEvent(res, { type: "error", error: message }, requestId);
      res.end();
    }
  });

  app.get("/api/genie-sp/:alias/conversations/:conversationId", async (req: Request, res: Response) => {
    const alias = typeof req.params.alias === "string" ? req.params.alias : "";
    const conversationId =
      typeof req.params.conversationId === "string" ? req.params.conversationId : "";
    const requestId =
      typeof req.query.requestId === "string" ? req.query.requestId : undefined;
    if (!conversationId) {
      res.status(400).json({ error: "conversationId is required" });
      return;
    }

    beginSse(res);
    try {
      const history = await appkit.genie.getConversation(alias, conversationId);
      for (const message of history.messages) {
        writeSseEvent(res, { type: "message_result", message }, requestId);
      }
      writeSseEvent(
        res,
        {
          type: "history_info",
          conversationId: history.conversationId,
          spaceId: history.spaceId,
          nextPageToken: null,
          loadedCount: history.messages.length,
        },
        requestId,
      );
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeSseEvent(res, { type: "error", error: message }, requestId);
      res.end();
    }
  });
}
