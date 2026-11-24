import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = request.nextUrl.searchParams.get("room_id");
  const limit = Math.min(200, Math.max(10, Number(request.nextUrl.searchParams.get("limit")) || 80));

  if (!roomId) {
    const { data: recent, error } = await supabase.rpc("get_recent_study_chat", { p_limit: 5 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ recent: recent ?? [] });
  }

  const { data: messages, error } = await supabase.rpc("get_study_room_messages", {
    p_room_id: roomId,
    p_limit: limit,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: messages ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    room_id?: string;
    body?: string;
    message_id?: string;
  };

  if (body.action === "delete" && body.message_id) {
    // Allow sender or admin to delete a message
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    const admin = getAdminClient();
    if (profile?.is_admin) {
      const { error } = await admin.from("study_room_messages").delete().eq("id", body.message_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from("study_room_messages")
        .delete()
        .eq("id", body.message_id)
        .eq("user_id", user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const roomId = String(body.room_id || "").trim();
  const text = String(body.body || "").trim();
  if (!roomId) return NextResponse.json({ error: "Missing study room" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  if (text.length > 1500) {
    return NextResponse.json({ error: "Message is too long (max 1,500 chars)" }, { status: 400 });
  }

  const { error: insertErr } = await supabase.from("study_room_messages").insert({
    room_id: roomId,
    user_id: user.id,
    body: text,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const { data: messages } = await supabase.rpc("get_study_room_messages", {
    p_room_id: roomId,
    p_limit: 80,
  });

  return NextResponse.json({ ok: true, messages: messages ?? [] });
}
