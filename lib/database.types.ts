export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type FeedbackSection =
  | "question"
  | "domain"
  | "literature_qc"
  | "protocol"
  | "materials"
  | "budget"
  | "timeline"
  | "validation"
  | "other";

export interface Experiment {
  id: string;
  user_id: string | null;
  original_query: string;
  domain: string;
  generated_plan: Json;
  literature_qc: Json | null;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentInsert {
  id?: string;
  user_id?: string | null;
  original_query: string;
  domain: string;
  generated_plan: Json;
  literature_qc?: Json | null;
  embedding?: number[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExperimentUpdate {
  id?: string;
  user_id?: string | null;
  original_query?: string;
  domain?: string;
  generated_plan?: Json;
  literature_qc?: Json | null;
  embedding?: number[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface Feedback {
  id: string;
  experiment_id: string;
  user_id: string | null;
  section: FeedbackSection;
  old_value: Json | null;
  corrected_value: Json;
  explanation: string;
  created_at: string;
}

export interface FeedbackInsert {
  id?: string;
  experiment_id: string;
  user_id?: string | null;
  section: FeedbackSection;
  old_value?: Json | null;
  corrected_value: Json;
  explanation: string;
  created_at?: string;
}

export interface FeedbackUpdate {
  id?: string;
  experiment_id?: string;
  user_id?: string | null;
  section?: FeedbackSection;
  old_value?: Json | null;
  corrected_value?: Json;
  explanation?: string;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      experiments: {
        Row: Experiment;
        Insert: ExperimentInsert;
        Update: ExperimentUpdate;
        Relationships: [];
      };
      feedback: {
        Row: Feedback;
        Insert: FeedbackInsert;
        Update: FeedbackUpdate;
        Relationships: [
          {
            foreignKeyName: "feedback_experiment_id_fkey";
            columns: ["experiment_id"];
            referencedRelation: "experiments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
