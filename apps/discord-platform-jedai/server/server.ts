import { analytics, createApp, server } from "@databricks/appkit";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "./trpc.js";

const appkit = await createApp({
  plugins: [server({ autoStart: false }), analytics({})],
});

appkit.server.extend((app) => {
  app.use(express.json({ limit: "512kb" }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: async () => ({}),
    }),
  );
});

await appkit.server.start();
