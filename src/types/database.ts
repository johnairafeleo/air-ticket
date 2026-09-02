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
          is_superuser: boolean;
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
          is_superuser?: boolean;
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
          is_superuser?: boolean;
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
      projects: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          is_active: boolean;
          ticket_seq: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          ticket_seq?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          ticket_seq?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          project_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["project_role"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["project_role"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          project_id?: string;
          user_id?: string;
          role?: Database["public"]["Enums"]["project_role"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tickets: {
        Row: {
          id: string;
          ticket_number: string;
          title: string;
          description: string | null;
          project_id: string;
          category_id: string | null;
          priority: Database["public"]["Enums"]["ticket_priority"];
          status: Database["public"]["Enums"]["ticket_status"];
          created_by: string;
          assignee_count: number;
          deleted_at: string | null;
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
          description?: string | null;
          project_id: string;
          category_id?: string | null;
          priority?: Database["public"]["Enums"]["ticket_priority"];
          status?: Database["public"]["Enums"]["ticket_status"];
          created_by: string;
          assignee_count?: number;
          deleted_at?: string | null;
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
          description?: string | null;
          project_id?: string;
          category_id?: string | null;
          priority?: Database["public"]["Enums"]["ticket_priority"];
          status?: Database["public"]["Enums"]["ticket_status"];
          created_by?: string;
          assignee_count?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
          closed_at?: string | null;
          start_date?: string | null;
          end_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
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
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          ticket_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          actor_id: string | null;
          from_status: Database["public"]["Enums"]["ticket_status"] | null;
          to_status: Database["public"]["Enums"]["ticket_status"] | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ticket_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          actor_id?: string | null;
          from_status?: Database["public"]["Enums"]["ticket_status"] | null;
          to_status?: Database["public"]["Enums"]["ticket_status"] | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };
      ticket_assignees: {
        Row: {
          ticket_id: string;
          user_id: string;
          assigned_at: string;
          assigned_by: string | null;
        };
        Insert: {
          ticket_id: string;
          user_id: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Update: {
          ticket_id?: string;
          user_id?: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ticket_assignees_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_assignees_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ticket_assignees_assigned_by_fkey";
            columns: ["assigned_by"];
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
        Args: { p_project_id: string };
        Returns: Json;
      };
      project_role_of: {
        Args: { p_project: string };
        Returns: Database["public"]["Enums"]["project_role"] | null;
      };
      can_view_project: { Args: { p_project: string }; Returns: boolean };
      is_project_staff: { Args: { p_project: string }; Returns: boolean };
      can_manage_project: { Args: { p_project: string }; Returns: boolean };
      shares_project_with: { Args: { p_user: string }; Returns: boolean };
      ticket_project: { Args: { p_ticket: string }; Returns: string | null };
      project_role_of_user: {
        Args: { p_project: string; p_user: string };
        Returns: Database["public"]["Enums"]["project_role"] | null;
      };
      find_user_by_email: { Args: { p_email: string }; Returns: string | null };
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
      project_role: "VIEWER" | "MEMBER" | "AGENT" | "MANAGER";
      notification_type: "STATUS_CHANGED" | "ASSIGNED" | "UNASSIGNED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
