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
        weekday_display?: string;
        voice_duration_hours?: number | string;
        user_name?: string;
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
  }
}

