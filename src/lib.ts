import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key && !url.includes("SEU-PROJETO") && !key.includes("SUA_CHAVE"));
export const supabase = configured ? createClient(url!, key!) : null;

export type Profile = {
  id: string;
  full_name: string;
  role: "admin" | "instructor" | "school";
  school_id?: string | null;
  rank: string | null;
  email?: string | null;
  is_primary_admin?: boolean;
};

export type School = {
  id: string;
  name: string;
  region: string;
  school_type: string;
  address: string | null;
};

export type Demand = {
  id: string;
  protocol: string;
  school_id: string;
  class_name: string;
  activity_type: string;
  preferred_date: string | null;
  status: string;
  assigned_to: string | null;
  refusal_reason: string | null;
  created_at: string;
  schools?: { name: string; region: string } | null;
  assignee?: { full_name: string } | null;
};

export type Activity = {
  id: string;
  demand_id: string;
  performed_on: string;
  students_present: number;
  result: string;
  notes: string | null;
  status: string;
  validation_note: string | null;
  created_at: string;
  demands?: { protocol: string; class_name: string; schools?: { name: string } | null } | null;
  instructor?: { full_name: string } | null;
};
