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
      clients: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          country: string | null
          created_at: string
          document_number: string | null
          document_type: string | null
          email: string | null
          full_name: string
          id: string
          nationality: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_tickets: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string
          id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          priority: Database["public"]["Enums"]["maintenance_priority"]
          room_id: string
          status: Database["public"]["Enums"]["maintenance_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          room_id: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          priority?: Database["public"]["Enums"]["maintenance_priority"]
          room_id?: string
          status?: Database["public"]["Enums"]["maintenance_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          reservation_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          reservation_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          adults: number
          category_id: string
          channel: string | null
          checkin_date: string
          checkout_date: string
          children: number
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_amount: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          reservation_code: string
          room_id: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          adults?: number
          category_id: string
          channel?: string | null
          checkin_date: string
          checkout_date: string
          children?: number
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reservation_code: string
          room_id?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          adults?: number
          category_id?: string
          channel?: string | null
          checkin_date?: string
          checkout_date?: string
          children?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          reservation_code?: string
          room_id?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "room_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_categories: {
        Row: {
          amenities: string[] | null
          base_price: number
          bed_type: string | null
          capacity_adults: number
          capacity_children: number
          created_at: string
          description: string | null
          id: string
          name: string
          size_sqm: number | null
          updated_at: string
        }
        Insert: {
          amenities?: string[] | null
          base_price: number
          bed_type?: string | null
          capacity_adults?: number
          capacity_children?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          size_sqm?: number | null
          updated_at?: string
        }
        Update: {
          amenities?: string[] | null
          base_price?: number
          bed_type?: string | null
          capacity_adults?: number
          capacity_children?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          size_sqm?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          category_id: string
          created_at: string
          floor: number | null
          id: string
          notes: string | null
          room_number: string
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          floor?: number | null
          id?: string
          notes?: string | null
          room_number: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          floor?: number | null
          id?: string
          notes?: string | null
          room_number?: string
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "room_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_reservation_code: { Args: never; Returns: string }
    }
    Enums: {
      maintenance_priority: "low" | "medium" | "high" | "urgent"
      maintenance_status: "open" | "in_progress" | "completed" | "cancelled"
      payment_status: "pending" | "partial" | "paid" | "refunded"
      reservation_status:
        | "pending"
        | "confirmed"
        | "checkedin"
        | "checkedout"
        | "cancelled"
        | "noshow"
      room_status:
        | "available"
        | "occupied"
        | "cleaning"
        | "maintenance"
        | "blocked"
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
      maintenance_priority: ["low", "medium", "high", "urgent"],
      maintenance_status: ["open", "in_progress", "completed", "cancelled"],
      payment_status: ["pending", "partial", "paid", "refunded"],
      reservation_status: [
        "pending",
        "confirmed",
        "checkedin",
        "checkedout",
        "cancelled",
        "noshow",
      ],
      room_status: [
        "available",
        "occupied",
        "cleaning",
        "maintenance",
        "blocked",
      ],
    },
  },
} as const
