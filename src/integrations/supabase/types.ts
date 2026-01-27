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
      client_email_logs: {
        Row: {
          agent_id: string
          body_preview: string | null
          client_id: string | null
          created_at: string
          direction: string
          from_email: string
          gmail_message_id: string
          id: string
          is_read: boolean | null
          labels: string[] | null
          notes: string | null
          received_at: string
          snippet: string | null
          subject: string | null
          thread_id: string | null
          to_email: string
        }
        Insert: {
          agent_id: string
          body_preview?: string | null
          client_id?: string | null
          created_at?: string
          direction: string
          from_email: string
          gmail_message_id: string
          id?: string
          is_read?: boolean | null
          labels?: string[] | null
          notes?: string | null
          received_at: string
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_email: string
        }
        Update: {
          agent_id?: string
          body_preview?: string | null
          client_id?: string | null
          created_at?: string
          direction?: string
          from_email?: string
          gmail_message_id?: string
          id?: string
          is_read?: boolean | null
          labels?: string[] | null
          notes?: string | null
          received_at?: string
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          agent_id: string
          client_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          client_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
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
          annual_taxes: number | null
          cbs: string | null
          cell_phone: string | null
          city: string | null
          combo: string | null
          created_at: string | null
          days_on_market: number | null
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
          showings_to_date: number | null
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
          annual_taxes?: number | null
          cbs?: string | null
          cell_phone?: string | null
          city?: string | null
          combo?: string | null
          created_at?: string | null
          days_on_market?: number | null
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
          showings_to_date?: number | null
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
          annual_taxes?: number | null
          cbs?: string | null
          cell_phone?: string | null
          city?: string | null
          combo?: string | null
          created_at?: string | null
          days_on_market?: number | null
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
          showings_to_date?: number | null
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
      estimated_net_properties: {
        Row: {
          admin_fee: number
          agent_contact: string | null
          agent_email: string | null
          agent_id: string
          agent_name: string | null
          annual_taxes: number
          appliances: string | null
          buyer_agent_commission: number
          city: string
          client_id: string | null
          closing_cost: number
          closing_date: string | null
          created_at: string
          days_first_half_taxes: number | null
          days_second_half_taxes: number | null
          deposit: number
          deposit_collection: string | null
          final_walk_through: string | null
          first_half_paid: boolean
          first_mortgage: number
          home_warranty: number
          home_warranty_company: string | null
          id: string
          in_contract: string | null
          inspection_days: number | null
          listing_agent_commission: number
          listing_agent_email: string | null
          listing_agent_name: string | null
          listing_agent_phone: string | null
          loan_app_time_frame: string | null
          loan_commitment: string | null
          name: string
          notes: string | null
          offer_price: number
          possession: string | null
          pre_approval_days: number | null
          remedy_period_days: number | null
          respond_to_offer_by: string | null
          second_half_paid: boolean
          second_mortgage: number
          seller_email: string | null
          seller_phone: string | null
          state: string
          street_address: string
          tax_days_due_this_year: number | null
          type_of_loan: string | null
          updated_at: string
          zip: string
        }
        Insert: {
          admin_fee?: number
          agent_contact?: string | null
          agent_email?: string | null
          agent_id: string
          agent_name?: string | null
          annual_taxes?: number
          appliances?: string | null
          buyer_agent_commission?: number
          city: string
          client_id?: string | null
          closing_cost?: number
          closing_date?: string | null
          created_at?: string
          days_first_half_taxes?: number | null
          days_second_half_taxes?: number | null
          deposit?: number
          deposit_collection?: string | null
          final_walk_through?: string | null
          first_half_paid?: boolean
          first_mortgage?: number
          home_warranty?: number
          home_warranty_company?: string | null
          id?: string
          in_contract?: string | null
          inspection_days?: number | null
          listing_agent_commission?: number
          listing_agent_email?: string | null
          listing_agent_name?: string | null
          listing_agent_phone?: string | null
          loan_app_time_frame?: string | null
          loan_commitment?: string | null
          name: string
          notes?: string | null
          offer_price?: number
          possession?: string | null
          pre_approval_days?: number | null
          remedy_period_days?: number | null
          respond_to_offer_by?: string | null
          second_half_paid?: boolean
          second_mortgage?: number
          seller_email?: string | null
          seller_phone?: string | null
          state?: string
          street_address: string
          tax_days_due_this_year?: number | null
          type_of_loan?: string | null
          updated_at?: string
          zip: string
        }
        Update: {
          admin_fee?: number
          agent_contact?: string | null
          agent_email?: string | null
          agent_id?: string
          agent_name?: string | null
          annual_taxes?: number
          appliances?: string | null
          buyer_agent_commission?: number
          city?: string
          client_id?: string | null
          closing_cost?: number
          closing_date?: string | null
          created_at?: string
          days_first_half_taxes?: number | null
          days_second_half_taxes?: number | null
          deposit?: number
          deposit_collection?: string | null
          final_walk_through?: string | null
          first_half_paid?: boolean
          first_mortgage?: number
          home_warranty?: number
          home_warranty_company?: string | null
          id?: string
          in_contract?: string | null
          inspection_days?: number | null
          listing_agent_commission?: number
          listing_agent_email?: string | null
          listing_agent_name?: string | null
          listing_agent_phone?: string | null
          loan_app_time_frame?: string | null
          loan_commitment?: string | null
          name?: string
          notes?: string | null
          offer_price?: number
          possession?: string | null
          pre_approval_days?: number | null
          remedy_period_days?: number | null
          respond_to_offer_by?: string | null
          second_half_paid?: boolean
          second_mortgage?: number
          seller_email?: string | null
          seller_phone?: string | null
          state?: string
          street_address?: string
          tax_days_due_this_year?: number | null
          type_of_loan?: string | null
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimated_net_properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_sequences: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      gmail_oauth_tokens: {
        Row: {
          access_token: string
          agent_id: string
          created_at: string
          email_address: string
          id: string
          refresh_token: string
          token_expiry: string
          updated_at: string
        }
        Insert: {
          access_token: string
          agent_id: string
          created_at?: string
          email_address: string
          id?: string
          refresh_token: string
          token_expiry: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          agent_id?: string
          created_at?: string
          email_address?: string
          id?: string
          refresh_token?: string
          token_expiry?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_sequence_enrollments: {
        Row: {
          completed_at: string | null
          current_step: number
          enrolled_at: string
          id: string
          lead_id: string
          next_send_at: string | null
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          lead_id: string
          next_send_at?: string | null
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          lead_id?: string
          next_send_at?: string | null
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sequence_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
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
      master_email_templates: {
        Row: {
          id: string
          template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          template: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          template?: string
          updated_at?: string
          updated_by?: string | null
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
      scheduled_messages: {
        Row: {
          agent_id: string
          ai_enhanced: boolean
          channel: string
          created_at: string
          enrollment_id: string
          error_message: string | null
          id: string
          lead_id: string
          message_content: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          step_id: string
          subject: string | null
        }
        Insert: {
          agent_id: string
          ai_enhanced?: boolean
          channel: string
          created_at?: string
          enrollment_id: string
          error_message?: string | null
          id?: string
          lead_id: string
          message_content?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          step_id: string
          subject?: string | null
        }
        Update: {
          agent_id?: string
          ai_enhanced?: boolean
          channel?: string
          created_at?: string
          enrollment_id?: string
          error_message?: string | null
          id?: string
          lead_id?: string
          message_content?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          step_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "lead_sequence_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "sequence_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_steps: {
        Row: {
          channel: string
          created_at: string
          delay_days: number
          id: string
          message_template: string
          sequence_id: string
          step_order: number
          subject: string | null
          use_ai_enhancement: boolean
        }
        Insert: {
          channel: string
          created_at?: string
          delay_days?: number
          id?: string
          message_template: string
          sequence_id: string
          step_order: number
          subject?: string | null
          use_ai_enhancement?: boolean
        }
        Update: {
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          message_template?: string
          sequence_id?: string
          step_order?: number
          subject?: string | null
          use_ai_enhancement?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "follow_up_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      showing_feedback: {
        Row: {
          agent_id: string
          buyer_interest_level: string | null
          client_id: string | null
          created_at: string
          feedback: string | null
          id: string
          raw_email_content: string | null
          showing_agent_email: string | null
          showing_agent_name: string | null
          showing_agent_phone: string | null
          showing_date: string | null
          source_email_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          buyer_interest_level?: string | null
          client_id?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          raw_email_content?: string | null
          showing_agent_email?: string | null
          showing_agent_name?: string | null
          showing_agent_phone?: string | null
          showing_date?: string | null
          source_email_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          buyer_interest_level?: string | null
          client_id?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          raw_email_content?: string | null
          showing_agent_email?: string | null
          showing_agent_name?: string | null
          showing_agent_phone?: string | null
          showing_date?: string | null
          source_email_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "showing_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "showing_feedback_source_email_id_fkey"
            columns: ["source_email_id"]
            isOneToOne: false
            referencedRelation: "client_email_logs"
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
      suggested_tasks: {
        Row: {
          agent_id: string
          category: string
          created_at: string
          description: string | null
          id: string
          priority: string
          reasoning: string | null
          related_client: string | null
          status: string
          title: string
        }
        Insert: {
          agent_id: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          reasoning?: string | null
          related_client?: string | null
          status?: string
          title: string
        }
        Update: {
          agent_id?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          priority?: string
          reasoning?: string | null
          related_client?: string | null
          status?: string
          title?: string
        }
        Relationships: []
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
          is_archived: boolean
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
          is_archived?: boolean
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
          is_archived?: boolean
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
          article_summary: string | null
          closed_deals: number | null
          created_at: string
          freddie_mac_summary: string | null
          id: string
          in_contracts: number | null
          inventory_change: number | null
          market_avg_dom: number
          mortgage_rate_15yr: number | null
          mortgage_rate_15yr_week_ago: number | null
          mortgage_rate_15yr_year_ago: number | null
          mortgage_rate_30yr: number | null
          mortgage_rate_30yr_week_ago: number | null
          mortgage_rate_30yr_year_ago: number | null
          new_listings: number | null
          price_reductions: number | null
          price_trend: string
          updated_at: string
          week_of: string
        }
        Insert: {
          active_homes: number
          active_homes_last_week?: number | null
          agent_id: string
          article_summary?: string | null
          closed_deals?: number | null
          created_at?: string
          freddie_mac_summary?: string | null
          id?: string
          in_contracts?: number | null
          inventory_change?: number | null
          market_avg_dom: number
          mortgage_rate_15yr?: number | null
          mortgage_rate_15yr_week_ago?: number | null
          mortgage_rate_15yr_year_ago?: number | null
          mortgage_rate_30yr?: number | null
          mortgage_rate_30yr_week_ago?: number | null
          mortgage_rate_30yr_year_ago?: number | null
          new_listings?: number | null
          price_reductions?: number | null
          price_trend: string
          updated_at?: string
          week_of: string
        }
        Update: {
          active_homes?: number
          active_homes_last_week?: number | null
          agent_id?: string
          article_summary?: string | null
          closed_deals?: number | null
          created_at?: string
          freddie_mac_summary?: string | null
          id?: string
          in_contracts?: number | null
          inventory_change?: number | null
          market_avg_dom?: number
          mortgage_rate_15yr?: number | null
          mortgage_rate_15yr_week_ago?: number | null
          mortgage_rate_15yr_year_ago?: number | null
          mortgage_rate_30yr?: number | null
          mortgage_rate_30yr_week_ago?: number | null
          mortgage_rate_30yr_year_ago?: number | null
          new_listings?: number | null
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
      clear_user_templates: { Args: never; Returns: undefined }
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
