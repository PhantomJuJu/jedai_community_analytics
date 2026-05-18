import { z } from "zod";

export const discordScheduleInputSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(2000),
  scheduledAt: z.string().datetime({ offset: true }),
});

type DiscordConfig = {
  apiUrl: string;
  apiSecret: string;
  guildId: string;
};

export function getDiscordConfig(): DiscordConfig | null {
  const apiUrl = process.env.DISCORD_API_URL?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!apiUrl || !guildId) {
    return null;
  }
  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    apiSecret: process.env.DISCORD_API_SECRET?.trim() ?? "",
    guildId,
  };
}

function discordHeaders(secret: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  return headers;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload.detail)) {
      return JSON.stringify(payload.detail);
    }
    return JSON.stringify(payload);
  } catch {
    return (await response.text().catch(() => "")) || response.statusText;
  }
}

export async function createScheduledDiscordPost(input: z.infer<typeof discordScheduleInputSchema>) {
  const config = getDiscordConfig();
  if (!config) {
    throw new Error("DISCORD_API_URL and DISCORD_GUILD_ID must be configured");
  }

  const response = await fetch(`${config.apiUrl}/api/posts/scheduled`, {
    method: "POST",
    headers: discordHeaders(config.apiSecret),
    body: JSON.stringify({
      channel_id: input.channelId,
      guild_id: config.guildId,
      content: input.content,
      scheduled_at: input.scheduledAt,
    }),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`Discord API error (${response.status}): ${detail}`);
  }

  return (await response.json()) as { post_id: string };
}

export async function listDiscordPosts() {
  const config = getDiscordConfig();
  if (!config) {
    throw new Error("DISCORD_API_URL and DISCORD_GUILD_ID must be configured");
  }

  const url = new URL(`${config.apiUrl}/api/posts`);
  url.searchParams.set("guild_id", config.guildId);

  const response = await fetch(url, {
    headers: discordHeaders(config.apiSecret),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`Discord API error (${response.status}): ${detail}`);
  }

  return (await response.json()) as {
    scheduled: Array<{
      post_id: string;
      channel_id: string;
      content: string;
      scheduled_at: string;
      created_by: string;
    }>;
    recurring: Array<{
      post_id: string;
      channel_id: string;
      content: string;
      frequency: string;
      post_time: string;
    }>;
  };
}

export async function cancelDiscordPost(postId: string) {
  const config = getDiscordConfig();
  if (!config) {
    throw new Error("DISCORD_API_URL and DISCORD_GUILD_ID must be configured");
  }

  const response = await fetch(`${config.apiUrl}/api/posts/${encodeURIComponent(postId)}`, {
    method: "DELETE",
    headers: discordHeaders(config.apiSecret),
  });

  if (response.status === 404) {
    return { cancelled: false };
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`Discord API error (${response.status}): ${detail}`);
  }

  return (await response.json()) as { cancelled: boolean };
}
