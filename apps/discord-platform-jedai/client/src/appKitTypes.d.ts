// Type declarations for AppKit query results.
// This is a lightweight fallback when `npm run typegen` cannot connect to a SQL Warehouse.

declare module "@databricks/appkit-ui/react" {
  interface QueryRegistry {
    activity_summary_kpis: {
      name: "activity_summary_kpis";
      parameters: {};
      result: Array<{
        total_messages?: number | string;
        total_voice_hours?: number | string;
      }>;
    };
    activity_daily_message_trend: {
      name: "activity_daily_message_trend";
      parameters: {};
      result: Array<{
        activity_date?: string;
        guild_name?: string;
        message_count?: number | string;
      }>;
    };
    activity_by_weekday_hour: {
      name: "activity_by_weekday_hour";
      parameters: {};
      result: Array<{
        weekday?: number | string;
        weekday_display?: string;
        hour_slot?: number | string;
        message_count_aggregated?: number | string;
        voice_duration_seconds_aggregated?: number | string;
        voice_duration_hours?: number | string;
        user_name?: string;
        guild_name?: string;
      }>;
    };
    user_voice_ranking: {
      name: "user_voice_ranking";
      parameters: {};
      result: Array<{
        user_name?: string;
        voice_hours?: number | string;
      }>;
    };
    user_messages_ranking: {
      name: "user_messages_ranking";
      parameters: {};
      result: Array<{
        user_name?: string;
        message_count?: number | string;
      }>;
    };
    activity_daily_voice_trend: {
      name: "activity_daily_voice_trend";
      parameters: {};
      result: Array<{
        activity_date?: string;
        guild_name?: string;
        voice_hours?: number | string;
      }>;
    };
    channel_activity: {
      name: "channel_activity";
      parameters: {};
      result: Array<{
        channel_name?: string;
        category_name?: string;
        guild_name?: string;
        message_count_aggregated?: number | string;
      }>;
    };
  }
}

