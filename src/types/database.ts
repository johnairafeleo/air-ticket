// Hand-written stand-in for the generated schema types.
//
// VERIFIED against the live database on 2026-08-31 via the PostgREST OpenAPI
// schema: all eight columns, their types, nullability and defaults match, and
// current_user_role / is_admin / is_active_user are all present. So this is
// accurate — it is simply not machine-generated.
//
// Replace it with the real output as soon as SUPABASE_DB_URL is set:
//
//     npm run db:types
//
// After that, never hand-edit this file: change the schema with a migration and
// regenerate. Phase 2 adds several tables, so switch over before then rather
// than maintaining this by hand.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: Database["public"]["Enums"]["user_role"];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          ticket_number: string;
          title: string;
          description: string;
          category_id: string | null;
          priority: Database["public"]["Enums"]["ticket_priority"];
          status: Database["public"]["Enums"]["ticket_status"];
          created_by: string;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
          closed_at: string | null;
          start_date: string | null;
          end_date: string | null;
        };
        Insert: {
          id?: string;
          ticket_number?: string;
          title: string;
          description: string;
          category_id?: string | null;
          priority?: Database["public"]["Enums"]["ticket_priority"];
          status?: Database["public"]["Enums"]["ticket_status"];
          created_by: string;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          closed_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        };
        Update: {
          id?: string;
          ticket_number?: string;
          title?: string;
          description?: string;
          category_id?: string | null;
          priority?: Database["public"]["Enums"]["ticket_priority"];
          status?: Database["public"]["Enums"]["ticket_status"];
          created_by?: string;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          closed_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_active_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["ticket_status"];
          p_to: Database["public"]["Enums"]["ticket_status"];
        };
        Returns: boolean;
      };
      dashboard_stats: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: {
      user_role: "USER" | "AGENT" | "ADMIN";
      ticket_status:
        | "OPEN"
        | "IN_PROGRESS"
        | "PENDING"
        | "RESOLVED"
        | "CLOSED";
      ticket_priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
