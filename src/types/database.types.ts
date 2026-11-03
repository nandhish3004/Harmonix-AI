export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
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
      };
    };
  };
}

