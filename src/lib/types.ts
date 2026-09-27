export type Track = "CSE" | "LET";

/** CSE: professional | subprofessional. LET: elementary | secondary. "both" = shared. */
export type Level = "both" | "professional" | "subprofessional" | "elementary" | "secondary";

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
  /** Which paper this is for (professional / subprofessional / elementary / secondary / both). */
  level: Level;
  /** LET majorship for a specialization paper. */
  specialization: string | null;
  /** Subjects this paper draws from (null = the whole bank of the track). */
  subjects: string[] | null;
  /** How many items to draw. 0 = use the pinned questions instead. */
  question_count: number;
  duration_minutes: number;
  passing_pct: number;
  difficulty: number;
  order_index?: number;
  is_free_preview: boolean;
  is_active: boolean;
  created_at?: string;
}

/** A question as the student sees it while a TIMED paper is running — no answer key. */
export interface BankQuestion {
  id: string;
  order_index: number;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  subject: string | null;
  subtopic: string | null;
}

/** Practice/flashcard question — the key is included because feedback is instant. */
export interface PracticeQuestion {
  id: string;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: "A" | "B" | "C" | "D";
  explanation: string | null;
  subject: string | null;
  subtopic: string | null;
}

/** Returned by grade_attempt() after a timed paper is submitted. */
export interface GradedAnswer {
  question_id: string;
  chosen: string | null;
  correct_choice: "A" | "B" | "C" | "D";
  explanation: string | null;
  ok: boolean;
  subject: string | null;
  subtopic: string | null;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
}

export interface BankStat {
  track: Track;
  subject: string | null;
  level: Level;
  total: number;
  accessible: number;
}

export interface SubjectProgress {
  subject: string;
  answered: number;
  correct: number;
  pct: number;
}

/** Admin view of a bank question: the prompt plus its tags and answer key. */
export interface Question extends BankQuestion {
  exam_id: string | null;
  track?: Track;
  level?: Level;
  specialization?: string | null;
  difficulty?: number;
  is_free?: boolean;
  is_active?: boolean;
  source?: string | null;
  created_at?: string;
  correct_choice?: "A" | "B" | "C" | "D";
  explanation?: string | null;
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

export interface Testimonial {
  id: string;
  name: string;
  track: Track;
  role: string | null;
  quote: string;
  rating: number;
  photo_url: string | null;
  is_published: boolean;
  sort_order: number;
  created_at?: string;
}

export type CoachTrack = "CSE" | "LET" | "BOTH";

export interface Coach {
  id: string;
  name: string;
  title: string | null;
  /** Comma separated list, e.g. "Math, English, Filipino" */
  subjects: string | null;
  bio: string | null;
  photo_url: string | null;
  facebook_url: string | null;
  track: CoachTrack;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  exam_id: string | null;
  kind: "exam" | "drill" | "flashcards";
  label: string | null;
  track: Track | null;
  level: Level | null;
  score: number;
  total: number;
  duration_used_seconds: number;
  answers: Record<string, string>;
  completed_at: string;
}

export interface ExamWithCount extends Exam {
  /** Only present on legacy queries that joined exam_questions(count). */
  pinned_count?: number;
  exam_questions?: { count: number }[];
}
