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
      admin_designations: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          ends_at: string
          id: string
          notes: string
          patient_id: string
          professional_id: string
          service_id: string
          source: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          ends_at: string
          id?: string
          notes?: string
          patient_id: string
          professional_id: string
          service_id: string
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string
          patient_id?: string
          professional_id?: string
          service_id?: string
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          break_end: string | null
          break_start: string | null
          clinic_id: string
          close_time: string
          id: string
          is_open: boolean
          open_time: string
          weekday: number
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          clinic_id: string
          close_time?: string
          id?: string
          is_open?: boolean
          open_time?: string
          weekday: number
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          clinic_id?: string
          close_time?: string
          id?: string
          is_open?: boolean
          open_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_registrations: {
        Row: {
          clinic_id: string
          clinic_name: string
          contact_email: string
          contact_phone: string
          created_at: string
          responsible_name: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          clinic_name: string
          contact_email: string
          contact_phone: string
          created_at?: string
          responsible_name: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          clinic_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          responsible_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_registrations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string
          cancel_min_hours: number
          created_at: string
          id: string
          is_demo: boolean
          max_advance_days: number
          min_advance_minutes: number
          name: string
          owner_id: string
          phone: string
          reminder_hours_before: number
          slot_step_minutes: number
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string
          cancel_min_hours?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          owner_id: string
          phone?: string
          reminder_hours_before?: number
          slot_step_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          cancel_min_hours?: number
          created_at?: string
          id?: string
          is_demo?: boolean
          max_advance_days?: number
          min_advance_minutes?: number
          name?: string
          owner_id?: string
          phone?: string
          reminder_hours_before?: number
          slot_step_minutes?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          channel: string
          clinic_id: string
          contact_name: string
          contact_phone: string
          created_at: string
          id: string
          is_urgent: boolean
          last_intent: string | null
          last_message_at: string
          last_message_preview: string
          patient_id: string | null
          state: Json
          status: string
        }
        Insert: {
          channel?: string
          clinic_id: string
          contact_name: string
          contact_phone: string
          created_at?: string
          id?: string
          is_urgent?: boolean
          last_intent?: string | null
          last_message_at?: string
          last_message_preview?: string
          patient_id?: string | null
          state?: Json
          status?: string
        }
        Update: {
          channel?: string
          clinic_id?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          id?: string
          is_urgent?: boolean
          last_intent?: string | null
          last_message_at?: string
          last_message_preview?: string
          patient_id?: string | null
          state?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_written: boolean
          audio_label: string | null
          clinic_id: string
          content: string
          conversation_id: string
          created_at: string
          id: string
          intent: string | null
          kind: string
          options: Json | null
          sender: string
        }
        Insert: {
          ai_written?: boolean
          audio_label?: string | null
          clinic_id: string
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          intent?: string | null
          kind?: string
          options?: Json | null
          sender: string
        }
        Update: {
          ai_written?: boolean
          audio_label?: string | null
          clinic_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          intent?: string | null
          kind?: string
          options?: Json | null
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_demo: boolean
          name: string
          notes: string
          phone: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          notes?: string
          phone: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          notes?: string
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          clinic_id: string
          color: string
          created_at: string
          id: string
          name: string
          role_title: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          color?: string
          created_at?: string
          id?: string
          name: string
          role_title?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          role_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          appointment_id: string
          clinic_id: string
          created_at: string
          id: string
          message: string
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          created_at?: string
          id?: string
          message: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          created_at?: string
          id?: string
          message?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_blocks: {
        Row: {
          clinic_id: string
          created_at: string
          ends_at: string
          id: string
          professional_id: string | null
          reason: string
          starts_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          ends_at: string
          id?: string
          professional_id?: string | null
          reason?: string
          starts_at: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          professional_id?: string | null
          reason?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          description: string
          duration_minutes: number
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          description?: string
          duration_minutes: number
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          description?: string
          duration_minutes?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_allowed_numbers: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          phone_digits: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          phone_digits: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          phone_digits?: string
        }
        Relationships: []
      }
      whatsapp_inbound_messages: {
        Row: {
          body: string | null
          clinic_id: string | null
          conversation_id: string | null
          error: string | null
          from_digits: string
          id: string
          kind: string
          media_id: string | null
          mime_type: string | null
          provider_timestamp: string | null
          phone_number_id: string | null
          received_at: string
          state: string
          transcription: string | null
          updated_at: string
          wa_message_id: string
        }
        Insert: {
          body?: string | null
          clinic_id?: string | null
          conversation_id?: string | null
          error?: string | null
          from_digits: string
          id?: string
          kind: string
          media_id?: string | null
          mime_type?: string | null
          provider_timestamp?: string | null
          phone_number_id?: string | null
          received_at?: string
          state?: string
          transcription?: string | null
          updated_at?: string
          wa_message_id: string
        }
        Update: {
          body?: string | null
          clinic_id?: string | null
          conversation_id?: string | null
          error?: string | null
          from_digits?: string
          id?: string
          kind?: string
          media_id?: string | null
          mime_type?: string | null
          provider_timestamp?: string | null
          phone_number_id?: string | null
          received_at?: string
          state?: string
          transcription?: string | null
          updated_at?: string
          wa_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbound_messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_outbound_messages: {
        Row: {
          attempts: number
          body: string
          clinic_id: string | null
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          error: Json | null
          failed_at: string | null
          id: string
          inbound_wa_message_id: string
          phone_number_id: string | null
          read_at: string | null
          recipient_digits: string
          sent_at: string | null
          seq: number
          state: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          attempts?: number
          body: string
          clinic_id?: string | null
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: Json | null
          failed_at?: string | null
          id?: string
          inbound_wa_message_id: string
          phone_number_id?: string | null
          read_at?: string | null
          recipient_digits: string
          sent_at?: string | null
          seq: number
          state?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          clinic_id?: string | null
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error?: Json | null
          failed_at?: string | null
          id?: string
          inbound_wa_message_id?: string
          phone_number_id?: string | null
          read_at?: string | null
          recipient_digits?: string
          sent_at?: string | null
          seq?: number
          state?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbound_messages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbound_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_settings: {
        Row: {
          id: boolean
          paused_reason: string | null
          sending_paused: boolean
          target_clinic_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          paused_reason?: string | null
          sending_paused?: boolean
          target_clinic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          paused_reason?: string | null
          sending_paused?: boolean
          target_clinic_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_target_clinic_id_fkey"
            columns: ["target_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_status_events: {
        Row: {
          delivery_id: string
          errors: Json | null
          id: string
          provider_ts: string | null
          received_at: string
          recipient_digits: string
          status: string
          wa_message_id: string
        }
        Insert: {
          delivery_id: string
          errors?: Json | null
          id?: string
          provider_ts?: string | null
          received_at?: string
          recipient_digits: string
          status: string
          wa_message_id: string
        }
        Update: {
          delivery_id?: string
          errors?: Json | null
          id?: string
          provider_ts?: string | null
          received_at?: string
          recipient_digits?: string
          status?: string
          wa_message_id?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_my_clinic: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_clinic_owner: { Args: { _clinic: string }; Returns: boolean }
      is_designated_admin_email: { Args: { _email: string }; Returns: boolean }
      reset_demo_data: { Args: never; Returns: string }
      seed_demo_clinic: { Args: { _owner: string }; Returns: string }
      whatsapp_reconcile_status: {
        Args: { _wa_id: string }
        Returns: undefined
      }
      whatsapp_status_rank: { Args: { _s: string }; Returns: number }
    }
    Enums: {
      app_role: "admin"
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
    Enums: {
      app_role: ["admin"],
    },
  },
} as const
