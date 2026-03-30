import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/trpc.js";

/** Must match server/trpc.ts transformer or responses fail to deserialize in the browser. */
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
});

