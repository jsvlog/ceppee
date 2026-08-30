export type Track = "CSE" | "LET";

export type TxStatus = "pending" | "approved" | "rejected";
export type SubStatus = "active" | "expired" | "revoked";

export interface Profile {
  id: string;
  email?: string;
  full_name: string | null;
  is_admin: boolean;
  created_at?: string;
}

export interface PaymentRequest {
  id: string;
  user_id: string;
  track: Track;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  receipt_url: string | null;
  status: TxStatus;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  user_email?: string;
  user_name?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  track: Track;
  status: SubStatus;
  started_at: string;
  expires_at: string;
  payment_request_id: string | null;
}

export interface Exam {
  id: string;
  track: Track;
  title: string;
  description: string | null;
  mode: "mock" | "practice";
  topic: string | null;
  duration_minutes: number;
  is_free_preview: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface Question {
  id: string;
  exam_id: string;
  order_index: number;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: "A" | "B" | "C" | "D";
  explanation: string | null;
}

export interface Topic {
  id: string;
  track: Track;
  title: string;
  description: string | null;
  order_index: number;
  is_published: boolean;
}

export interface Lesson {
  id: string;
  topic_id: string;
  title: string;
  content: string;
  video_url: string | null;
  order_index: number;
  is_published: boolean;
  is_free: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SiteSettings {
  key: string;
  value: string;
  updated_at?: string;
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  exam_id: string;
  score: number;
  total: number;
  duration_used_seconds: number;
  answers: Record<string, string>;
  completed_at: string;
}

export interface ExamWithCount extends Exam {
  question_count?: number;
}
