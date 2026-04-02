import { analytics, createApp, server } from "@databricks/appkit";
import express from "express";

import {
  announcementInputSchema,
  generateAnnouncementText,
} from "./announcement_generate.js";

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
});

await appkit.server.start();
