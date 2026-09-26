import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Single admin mutation endpoint. Verifies the caller is an admin via the
 * cookie-based server client on EVERY call, then performs the action with
 * the service-role admin client.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getAdminClient();
  const body = await request.json();
  const { action, payload } = body as { action: string; payload: Record<string, unknown> };

  try {
    switch (action) {
      /* ---------- PAYMENTS ---------- */
      case "approve_payment": {
        // RPC via SERVER client (real admin JWT) — the RPC's internal is_admin()
        // guard needs auth.uid(); the service-role client has no user context and
        // would make is_admin() return false -> "Not authorized".
        const { error } = await supabase.rpc("approve_payment_request", {
          p_payment_id: payload.payment_id,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "reject_payment": {
        const { error } = await supabase.rpc("reject_payment_request", {
          p_payment_id: payload.payment_id,
          p_note: payload.note ?? null,
        });
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      /* ---------- SUBSCRIPTIONS (manual management) ---------- */
      case "grant_sub": {
        const days = Number(payload.days) || 180;
        const expires = new Date(Date.now() + days * 86400000).toISOString();
        const { error } = await admin.from("subscriptions").upsert(
          {
            user_id: payload.user_id,
            track: payload.track,
            status: "active",
            started_at: new Date().toISOString(),
            expires_at: expires,
          },
          { onConflict: "user_id,track" }
        );
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "extend_sub": {
        // Extend from the CURRENT expiry (or now if already past)
        const { data: sub } = await admin
          .from("subscriptions")
          .select("expires_at")
          .eq("user_id", payload.user_id)
          .eq("track", payload.track)
          .maybeSingle();
        const base = sub && new Date(sub.expires_at) > new Date() ? new Date(sub.expires_at) : new Date();
        const newExp = new Date(base.getTime() + Number(payload.days) * 86400000).toISOString();
        const { error } = await admin
          .from("subscriptions")
          .update({ expires_at: newExp, status: "active" })
          .eq("user_id", payload.user_id)
          .eq("track", payload.track);
        if (error) throw error;
        return NextResponse.json({ ok: true, expires_at: newExp });
      }
      case "revoke_sub": {
        const { error } = await admin
          .from("subscriptions")
          .update({ status: "revoked" })
          .eq("user_id", payload.user_id)
          .eq("track", payload.track);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      /* ---------- TOPICS ---------- */
      case "save_topic": {
        const row = {
          id: payload.id as string | undefined,
          track: payload.track,
          title: payload.title as string,
          description: (payload.description as string) || null,
          order_index: Number(payload.order_index) || 0,
          is_published: payload.is_published !== false,
        };
        const { error } = row.id
          ? await admin.from("topics").update(row).eq("id", row.id)
          : await admin.from("topics").insert(row);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "delete_topic": {
        const { error } = await admin.from("topics").delete().eq("id", payload.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      /* ---------- LESSONS ---------- */
      case "save_lesson": {
        const row = {
          id: payload.id as string | undefined,
          topic_id: payload.topic_id,
          title: payload.title as string,
          content: (payload.content as string) || "",
          video_url: (payload.video_url as string) || null,
          order_index: Number(payload.order_index) || 0,
          is_published: payload.is_published !== false,
          is_free: !!payload.is_free,
          updated_at: new Date().toISOString(),
        };
        const { error } = row.id
          ? await admin.from("lessons").update(row).eq("id", row.id)
          : await admin.from("lessons").insert(row);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "delete_lesson": {
        const { error } = await admin.from("lessons").delete().eq("id", payload.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      /* ---------- EXAMS ---------- */
      case "save_exam": {
        const row = {
          id: payload.id as string | undefined,
          track: payload.track,
          title: payload.title as string,
          description: (payload.description as string) || null,
          mode: payload.mode || "mock",
          topic: (payload.topic as string) || null,
          duration_minutes: Number(payload.duration_minutes) || 60,
          is_free_preview: !!payload.is_free_preview,
          is_active: payload.is_active !== false,
        };
        const { error } = row.id
          ? await admin.from("exams").update(row).eq("id", row.id)
          : await admin.from("exams").insert(row);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "delete_exam": {
        const { error } = await admin.from("exams").delete().eq("id", payload.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      /* ---------- QUESTIONS ---------- */
      case "save_question": {
        const row = {
          id: payload.id as string | undefined,
          exam_id: payload.exam_id,
          order_index: Number(payload.order_index) || 0,
          question_text: payload.question_text as string,
          choice_a: payload.choice_a,
          choice_b: payload.choice_b,
          choice_c: payload.choice_c,
          choice_d: payload.choice_d,
          correct_choice: payload.correct_choice,
          explanation: (payload.explanation as string) || null,
        };
        const { error } = row.id
          ? await admin.from("exam_questions").update(row).eq("id", row.id)
          : await admin.from("exam_questions").insert(row);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "delete_question": {
        const { error } = await admin.from("exam_questions").delete().eq("id", payload.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "bulk_import_questions": {
        // payload.questions: array of question objects for one exam
        const qs = payload.questions as Array<Record<string, unknown>>;
        if (!Array.isArray(qs) || qs.length === 0) throw new Error("No questions were imported");
        const rows = qs.map((q, i) => ({
          exam_id: payload.exam_id,
          order_index: Number(q.order_index) || i + 1,
          question_text: String(q.question_text || "").trim(),
          choice_a: String(q.choice_a || ""),
          choice_b: String(q.choice_b || ""),
          choice_c: String(q.choice_c || ""),
          choice_d: String(q.choice_d || ""),
          correct_choice: String(q.correct_choice || "A").toUpperCase(),
          explanation: (q.explanation as string) || null,
        }));
        for (const r of rows) {
          if (!r.question_text || !r.choice_a || !r.choice_b || !r.choice_c || !r.choice_d) {
            throw new Error(`Missing field in question #${r.order_index}`);
          }
          if (!["A", "B", "C", "D"].includes(r.correct_choice)) {
            throw new Error(`Invalid correct_choice sa question #${r.order_index}`);
          }
        }
        const { error } = await admin.from("exam_questions").insert(rows);
        if (error) throw error;
        return NextResponse.json({ ok: true, count: rows.length });
      }

      /* ---------- TESTIMONIALS ---------- */
      case "save_testimonial": {
        const row = {
          id: payload.id as string | undefined,
          name: String(payload.name || "").trim(),
          track: (payload.track as string) === "LET" ? "LET" : "CSE",
          role: ((payload.role as string) || "").trim() || null,
          quote: String(payload.quote || "").trim(),
          rating: Math.min(5, Math.max(1, Number(payload.rating) || 5)),
          photo_url: ((payload.photo_url as string) || "").trim() || null,
          is_published: payload.is_published !== false,
          sort_order: Number(payload.sort_order) || 0,
        };
        if (!row.name) throw new Error("Name is required");
        if (!row.quote) throw new Error("The testimonial message is required");
        const { error } = row.id
          ? await admin.from("testimonials").update(row).eq("id", row.id)
          : await admin.from("testimonials").insert(row);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "delete_testimonial": {
        const { data: existing } = await admin
          .from("testimonials")
          .select("photo_url")
          .eq("id", payload.id)
          .maybeSingle();
        const { error } = await admin.from("testimonials").delete().eq("id", payload.id);
        if (error) throw error;
        // Clean up the photo in storage too (best effort — never block the delete)
        const url = existing?.photo_url as string | undefined;
        const marker = "/object/public/testimonials/";
        if (url && url.includes(marker)) {
          const path = decodeURIComponent(url.split(marker)[1] ?? "");
          if (path) await admin.storage.from("testimonials").remove([path]);
        }
        return NextResponse.json({ ok: true });
      }

      /* ---------- SETTINGS ---------- */
      case "save_setting": {
        const { error } = await admin
          .from("site_settings")
          .update({ value: String(payload.value), updated_at: new Date().toISOString() })
          .eq("key", payload.key);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "make_admin": {
        const { error } = await admin
          .from("profiles")
          .update({ is_admin: !!payload.is_admin })
          .eq("id", payload.user_id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
