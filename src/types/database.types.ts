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
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          language_preference: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          language_preference?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          language_preference?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      workpiece_scans: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          material_type: string;
          thickness_mm: number;
          boundary_polygon: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          material_type: string;
          thickness_mm?: number;
          boundary_polygon?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          material_type?: string;
          thickness_mm?: number;
          boundary_polygon?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workpiece_scans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      inspection_sessions: {
        Row: {
          id: string;
          scan_id: string;
          peak_frequency_hz: number;
          active_mode: string;
          vibration_score: number;
          defect_detected: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          scan_id: string;
          peak_frequency_hz: number;
          active_mode: string;
          vibration_score?: number;
          defect_detected?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          scan_id?: string;
          peak_frequency_hz?: number;
          active_mode?: string;
          vibration_score?: number;
          defect_detected?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inspection_sessions_scan_id_fkey";
            columns: ["scan_id"];
            isOneToOne: false;
            referencedRelation: "workpiece_scans";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<
  T extends keyof Database["public"]["Tables"]
> = Database["public"]["Tables"][T]["Row"];

export type TablesInsert<
  T extends keyof Database["public"]["Tables"]
> = Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<
  T extends keyof Database["public"]["Tables"]
> = Database["public"]["Tables"][T]["Update"];
