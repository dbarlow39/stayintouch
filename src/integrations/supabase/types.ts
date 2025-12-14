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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          agent_id: string | null
          client_id: string | null
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          agent_id?: string | null
          client_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          agent_id?: string | null
          client_id?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agent: string | null
          agent_id: string
          cbs: string | null
          cell_phone: string | null
          city: string | null
          combo: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          home_phone: string | null
          id: string
          last_name: string | null
          listing_date: string | null
          location: string | null
          lock_box: string | null
          mls_id: string | null
          notes: string | null
          phone: string | null
          preferences: Json | null
          price: number | null
          showing_type: string | null
          special_instructions: string | null
          state: string | null
          status: string | null
          street_name: string | null
          street_number: string | null
          updated_at: string | null
          zillow_link: string | null
          zip: string | null
        }
        Insert: {
          agent?: string | null
          agent_id: string
          cbs?: string | null
          cell_phone?: string | null
          city?: string | null
          combo?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          home_phone?: string | null
          id?: string
          last_name?: string | null
          listing_date?: string | null
          location?: string | null
          lock_box?: string | null
          mls_id?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          price?: number | null
          showing_type?: string | null
          special_instructions?: string | null
          state?: string | null
          status?: string | null
          street_name?: string | null
          street_number?: string | null
          updated_at?: string | null
          zillow_link?: string | null
          zip?: string | null
        }
        Update: {
          agent?: string | null
          agent_id?: string
          cbs?: string | null
          cell_phone?: string | null
          city?: string | null
          combo?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          home_phone?: string | null
          id?: string
          last_name?: string | null
          listing_date?: string | null
          location?: string | null
          lock_box?: string | null
          mls_id?: string | null
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          price?: number | null
          showing_type?: string | null
          special_instructions?: string | null
          state?: string | null
          status?: string | null
          street_name?: string | null
          street_number?: string | null
          updated_at?: string | null
          zillow_link?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      deals: {
        Row: {
          agent_id: string
          client_id: string | null
          close_date: string | null
          created_at: string | null
          id: string
          lead_id: string | null
          notes: string | null
          property_address: string | null
          property_details: Json | null
          stage: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          close_date?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_address?: string | null
          property_details?: Json | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          close_date?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_address?: string | null
          property_details?: Json | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          agent_id: string
          client_id: string
          id: string
          metadata: Json | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          agent_id: string
          client_id: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          agent_id?: string
          client_id?: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_schedules: {
        Row: {
          agent_id: string
          created_at: string | null
          enabled: boolean | null
          id: string
          schedule_day: number | null
          schedule_time: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          schedule_day?: number | null
          schedule_time?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          schedule_day?: number | null
          schedule_time?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          agent_id: string
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          preferences: Json | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          preferences?: Json | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string | null
        }
        Relationships: []
      }
      mls_properties: {
        Row: {
          address: string
          bathrooms: number | null
          bedrooms: number | null
          city: string | null
          created_at: string | null
          details: Json | null
          id: string
          images: Json | null
          last_synced_at: string | null
          listing_date: string | null
          mls_id: string
          price: number | null
          property_type: string | null
          square_feet: number | null
          state: string | null
          status: string | null
          zip: string | null
        }
        Insert: {
          address: string
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          images?: Json | null
          last_synced_at?: string | null
          listing_date?: string | null
          mls_id: string
          price?: number | null
          property_type?: string | null
          square_feet?: number | null
          state?: string | null
          status?: string | null
          zip?: string | null
        }
        Update: {
          address?: string
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          images?: Json | null
          last_synced_at?: string | null
          listing_date?: string | null
          mls_id?: string
          price?: number | null
          property_type?: string | null
          square_feet?: number | null
          state?: string | null
          status?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          cell_phone: string | null
          created_at: string | null
          email: string
          email_template: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          preferred_email: string | null
          profile_completed: boolean | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          cell_phone?: string | null
          created_at?: string | null
          email: string
          email_template?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          preferred_email?: string | null
          profile_completed?: boolean | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          cell_phone?: string | null
          created_at?: string | null
          email?: string
          email_template?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          preferred_email?: string | null
          profile_completed?: boolean | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      property_views: {
        Row: {
          agent_id: string
          client_id: string | null
          id: string
          property_id: string | null
          source: string | null
          viewed_at: string | null
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          id?: string
          property_id?: string | null
          source?: string | null
          viewed_at?: string | null
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          id?: string
          property_id?: string | null
          source?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_views_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_views_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "mls_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          agent_id: string
          created_at: string | null
          id: string
          message_template: string
          name: string
          scheduled_for: string | null
          status: string
          target_filters: Json | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          id?: string
          message_template: string
          name: string
          scheduled_for?: string | null
          status?: string
          target_filters?: Json | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          id?: string
          message_template?: string
          name?: string
          scheduled_for?: string | null
          status?: string
          target_filters?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          agent_id: string
          client_id: string | null
          id: string
          lead_id: string | null
          message: string
          metadata: Json | null
          phone: string
          sent_at: string | null
          status: string
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          id?: string
          lead_id?: string | null
          message: string
          metadata?: Json | null
          phone: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          id?: string
          lead_id?: string | null
          message?: string
          metadata?: Json | null
          phone?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_id: string
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_email_logs: {
        Row: {
          agent_id: string
          body: string
          client_id: string
          id: string
          market_data_id: string | null
          sent_at: string
          subject: string
          zillow_days: number | null
          zillow_saves: number | null
          zillow_views: number | null
        }
        Insert: {
          agent_id: string
          body: string
          client_id: string
          id?: string
          market_data_id?: string | null
          sent_at?: string
          subject: string
          zillow_days?: number | null
          zillow_saves?: number | null
          zillow_views?: number | null
        }
        Update: {
          agent_id?: string
          body?: string
          client_id?: string
          id?: string
          market_data_id?: string | null
          sent_at?: string
          subject?: string
          zillow_days?: number | null
          zillow_saves?: number | null
          zillow_views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_email_logs_market_data_id_fkey"
            columns: ["market_data_id"]
            isOneToOne: false
            referencedRelation: "weekly_market_data"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_market_data: {
        Row: {
          active_homes: number
          active_homes_last_week: number | null
          agent_id: string
          created_at: string
          id: string
          inventory_change: number | null
          market_avg_dom: number
          price_reductions: number | null
          price_trend: string
          updated_at: string
          week_of: string
        }
        Insert: {
          active_homes: number
          active_homes_last_week?: number | null
          agent_id: string
          created_at?: string
          id?: string
          inventory_change?: number | null
          market_avg_dom: number
          price_reductions?: number | null
          price_trend: string
          updated_at?: string
          week_of: string
        }
        Update: {
          active_homes?: number
          active_homes_last_week?: number | null
          agent_id?: string
          created_at?: string
          id?: string
          inventory_change?: number | null
          market_avg_dom?: number
          price_reductions?: number | null
          price_trend?: string
          updated_at?: string
          week_of?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "agent"
      deal_stage:
        | "lead"
        | "qualified"
        | "proposal"
        | "negotiation"
        | "closed_won"
        | "closed_lost"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "unqualified"
        | "nurturing"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "agent"],
      deal_stage: [
        "lead",
        "qualified",
        "proposal",
        "negotiation",
        "closed_won",
        "closed_lost",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "nurturing",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
    },
  },
} as const
