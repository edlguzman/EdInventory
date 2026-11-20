export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name_en: string | null
          name_ru: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_en?: string | null
          name_ru?: string | null
          sort_order?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string | null
          name_ru?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      item_photos: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          item_id: string
          source_hash: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id: string
          source_hash?: string | null
          storage_path: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          item_id?: string
          source_hash?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_photos_item_fkey"
            columns: ["item_id", "user_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      items: {
        Row: {
          category_id: string | null
          created_at: string
          description_en: string | null
          description_ru: string | null
          id: string
          location_id: string | null
          name_en: string | null
          name_ru: string | null
          search_text: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description_en?: string | null
          description_ru?: string | null
          id?: string
          location_id?: string | null
          name_en?: string | null
          name_ru?: string | null
          search_text?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description_en?: string | null
          description_ru?: string | null
          id?: string
          location_id?: string | null
          name_en?: string | null
          name_ru?: string | null
          search_text?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "items_location_fkey"
            columns: ["location_id", "user_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          id: string
          name_en: string | null
          name_ru: string | null
          parent_id: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_en?: string | null
          name_ru?: string | null
          parent_id?: string | null
          sort_order?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string | null
          name_ru?: string | null
          parent_id?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      plans: {
        Row: {
          ai_daily_limit: number | null
          code: string
          created_at: string
          item_limit: number | null
          name_en: string
          name_ru: string
          sort_order: number
          stripe_price_month: string | null
          stripe_price_year: string | null
        }
        Insert: {
          ai_daily_limit?: number | null
          code: string
          created_at?: string
          item_limit?: number | null
          name_en: string
          name_ru: string
          sort_order?: number
          stripe_price_month?: string | null
          stripe_price_year?: string | null
        }
        Update: {
          ai_daily_limit?: number | null
          code?: string
          created_at?: string
          item_limit?: number | null
          name_en?: string
          name_ru?: string
          sort_order?: number
          stripe_price_month?: string | null
          stripe_price_year?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          data_lang: string
          manual_plan: string | null
          manual_until: string | null
          role: string
          status: string
          status_changed_at: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_plan: string | null
          subscription_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_lang?: string
          manual_plan?: string | null
          manual_until?: string | null
          role?: string
          status?: string
          status_changed_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data_lang?: string
          manual_plan?: string | null
          manual_until?: string | null
          role?: string
          status?: string
          status_changed_at?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manual_plan_fkey"
            columns: ["manual_plan"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "profiles_subscription_plan_fkey"
            columns: ["subscription_plan"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
        ]
      }
      system_status: {
        Row: {
          id: boolean
          last_keepalive_at: string | null
        }
        Insert: {
          id?: boolean
          last_keepalive_at?: string | null
        }
        Update: {
          id?: boolean
          last_keepalive_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      location_item_counts: {
        Row: {
          direct_items: number | null
          location_id: string | null
          total_items: number | null
        }
        Relationships: []
      }
      location_paths: {
        Row: {
          depth: number | null
          id: string | null
          id_path: string[] | null
          parent_id: string | null
          path_en: string | null
          path_ru: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_check_delete: { Args: { p_user_id: string }; Returns: string }
      admin_create_plan: {
        Args: {
          p_ai_daily_limit: number
          p_code: string
          p_item_limit: number
          p_name_en: string
          p_name_ru: string
        }
        Returns: undefined
      }
      admin_delete_plan: { Args: { p_code: string }; Returns: undefined }
      admin_list_users_v2: {
        Args: never
        Returns: {
          ai_24h: number
          ai_total: number
          created_at: string
          email: string
          items_count: number
          last_sign_in_at: string
          manual_plan: string
          manual_until: string
          plan_code: string
          plan_source: string
          plan_until: string
          role: string
          status: string
          user_id: string
        }[]
      }
      admin_list_users_v3: {
        Args: {
          p_limit: number
          p_offset: number
          p_plan: string
          p_search: string
          p_sort: string
          p_status: string
        }
        Returns: {
          ai_24h: number
          ai_total: number
          created_at: string
          email: string
          items_count: number
          last_sign_in_at: string
          manual_plan: string
          manual_until: string
          plan_code: string
          plan_source: string
          plan_until: string
          role: string
          status: string
          total: number
          user_id: string
        }[]
      }
      admin_overview: {
        Args: never
        Returns: {
          pending_count: number
          plans_count: number
          users_count: number
        }[]
      }
      admin_pending_count: { Args: never; Returns: number }
      admin_plan_stats: {
        Args: never
        Returns: {
          code: string
          users_linked: number
          users_now: number
        }[]
      }
      admin_reorder_plans: { Args: { p_codes: string[] }; Returns: undefined }
      admin_set_plan: {
        Args: { p_plan: string; p_until: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: {
          data_lang: string
          email: string
          old_status: string
        }[]
      }
      admin_update_plan: {
        Args: {
          p_ai_daily_limit: number
          p_code: string
          p_item_limit: number
          p_name_en: string
          p_name_ru: string
          p_sort_order: number
        }
        Returns: undefined
      }
      consume_ai_quota_v2: {
        Args: { p_fallback: number; p_kind: string }
        Returns: string
      }
      delete_my_account: { Args: never; Returns: undefined }
      effective_plan: {
        Args: { p_user: string }
        Returns: {
          code: string
          source: string
          until: string
        }[]
      }
      immutable_text_array_to_string: {
        Args: { arr: string[]; sep: string }
        Returns: string
      }
      is_active: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      keepalive: { Args: never; Returns: string }
      location_descendants: { Args: { loc_id: string }; Returns: string[] }
      my_plan: {
        Args: never
        Returns: {
          ai_daily_limit: number
          ai_used_24h: number
          code: string
          is_admin: boolean
          item_limit: number
          items_count: number
          name_en: string
          name_ru: string
          source: string
          until: string
        }[]
      }
      normalize_search: { Args: { t: string }; Returns: string }
      search_items: {
        Args: {
          p_category_id?: string
          p_limit?: number
          p_location_id?: string
          p_terms: string[]
        }
        Returns: {
          id: string
          score: number
        }[]
      }
      seed_default_categories: { Args: { uid: string }; Returns: undefined }
      similar_items: {
        Args: {
          p_location_id?: string
          p_min?: number
          p_names_en: string[]
          p_names_ru: string[]
        }
        Returns: {
          idx: number
          in_place: boolean
          item_id: string
          score: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
