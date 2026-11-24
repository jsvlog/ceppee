"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import UserBadgePill from "@/components/UserBadgePill";
import LogoMark from "@/components/LogoMark";
import type { StudyRoom, StudyRoomMessage } from "@/lib/types";

export interface StudyRoomClientProps {
  rooms: StudyRoom[];
  initialRoomSlug: string;
  initialMessages: StudyRoomMessage[];
  currentUser: {
    id: string;
    fullName: string;
    isAdmin: boolean;
    userLabel: string | null;
    userBadgeColor: string | null;
  };
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDateHeading(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    }).toUpperCase();
  } catch {
    return "";
  }
}

const AVATAR_COLORS = [
  "bg-[#16a34a] text-white",
  "bg-[#ca8a04] text-white",
  "bg-[#0369a1] text-white",
  "bg-[#5b21b6] text-white",
  "bg-[#b45309] text-white",
  "bg-[#15803d] text-white",
];

function avatarClassFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function StudyRoomClient({
  rooms,
  initialRoomSlug,
  initialMessages,
  currentUser,
}: StudyRoomClientProps) {
  const [activeSlug, setActiveSlug] = useState<string>(() => {
    const found = rooms.find((r) => r.slug === initialRoomSlug);
    return found ? found.slug : rooms[0]?.slug ?? "";
  });
  const [messages, setMessages] = useState<StudyRoomMessage[]>(initialMessages);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [mobileShowList, setMobileShowList] = useState(false);

  const feedEndRef = useRef<HTMLDivElement>(null);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.slug === activeSlug) ?? rooms[0] ?? null,
    [rooms, activeSlug]
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeSlug]);

  // Load messages when switching room + poll every 5s
  useEffect(() => {
    if (!activeRoom) return;
    let cancelled = false;

    const fetchMessages = async (showSpinner = false) => {
      if (showSpinner) setLoadingRoom(true);
      try {
        const res = await fetch(`/api/study-room?room_id=${encodeURIComponent(activeRoom.id)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages?: StudyRoomMessage[] };
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        /* ignore transient poll error */
      } finally {
        if (!cancelled && showSpinner) setLoadingRoom(false);
      }
    };

    // Fetch immediately on room change
    fetchMessages(true);

    const timer = setInterval(() => fetchMessages(false), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeRoom?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectRoom = (room: StudyRoom) => {
    setActiveSlug(room.slug);
    setMobileShowList(false);
    setErrorMsg(null);
    try {
      window.history.replaceState(null, "", `/study-room?room=${encodeURIComponent(room.slug)}`);
    } catch {
      /* ignore */
    }
  };

  const handleSend = async () => {
    if (!activeRoom) return;
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/study-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: activeRoom.id, body: text }),
      });
      const json = (await res.json()) as { ok?: boolean; messages?: StudyRoomMessage[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not send message");
      }
      setDraft("");
      if (Array.isArray(json.messages)) {
        setMessages(json.messages);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      const res = await fetch("/api/study-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", message_id: messageId }),
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch {
      /* ignore */
    }
  };

  const generalRooms = rooms.filter((r) => r.category === "general" || r.category === "exam");
  const subjectRooms = rooms.filter((r) => r.category === "subject");
  const majorRooms = rooms.filter((r) => r.category === "major");

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.body.toLowerCase().includes(q) ||
        m.display_name.toLowerCase().includes(q) ||
        (m.user_label && m.user_label.toLowerCase().includes(q))
    );
  }, [messages, searchQuery]);

  const renderRoomItem = (room: StudyRoom) => {
    const selected = activeRoom?.id === room.id;
    return (
      <button
        key={room.id}
        type="button"
        onClick={() => handleSelectRoom(room)}
        className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
          selected
            ? "border-[#16a34a] bg-[#f0fdf4] shadow-sm"
            : "border-[#d9e6d3] bg-white hover:border-[#16a34a] hover:bg-[#fbfdf9]"
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
            selected
              ? "bg-[#16a34a] text-white"
              : room.track === "CSE"
                ? "bg-[#dcfce7] text-[#15803d]"
                : "bg-[#fef9c3] text-[#b45309]"
          }`}
        >
          {room.icon || "💬"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-sm font-black text-[#16331f]">{room.title}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                room.track === "CSE"
                  ? "bg-[#dcfce7] text-[#15803d]"
                  : room.track === "LET"
                    ? "bg-[#fef9c3] text-[#b45309]"
                    : "bg-[#e0f2fe] text-[#0369a1]"
              }`}
            >
              {room.track === "BOTH" ? "ALL" : room.track}
            </span>
          </div>
          {room.subtitle && (
            <p className="mt-0.5 truncate text-xs text-[#5c7863]">{room.subtitle}</p>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* ================= LEFT COLUMN: CHANNELS / STUDY ROOMS ================= */}
        <div className={`${mobileShowList ? "block" : "hidden lg:block"} space-y-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-[#16331f]">Chats</h1>
              <p className="text-xs font-semibold text-[#5c7863]">Your study rooms by exam, subject &amp; major</p>
            </div>
            {currentUser.isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl border border-[#d9e6d3] bg-white px-3 py-1.5 text-xs font-bold text-[#15803d] hover:border-[#16a34a]"
              >
                + Manage rooms
              </Link>
            )}
          </div>

          <div className="max-h-[calc(100vh-250px)] space-y-5 overflow-y-auto pr-1">
            {generalRooms.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[#5c7863]">
                  General &amp; Exam Lounges
                </div>
                <div className="space-y-2">{generalRooms.map(renderRoomItem)}</div>
              </div>
            )}

            {subjectRooms.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[#5c7863]">
                  Core Subjects
                </div>
                <div className="space-y-2">{subjectRooms.map(renderRoomItem)}</div>
              </div>
            )}

            {majorRooms.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[#5c7863]">
                  Majorships
                </div>
                <div className="space-y-2">{majorRooms.map(renderRoomItem)}</div>
              </div>
            )}
          </div>

          {/* Kwentuhan muna? Card (like reference) */}
          <div className="card flex items-center gap-3.5 bg-gradient-to-br from-[#dcfce7] via-[#f0fdf4] to-[#fef9c3] p-4">
            <LogoMark size="md" className="shrink-0 shadow" />
            <div className="min-w-0">
              <div className="text-sm font-black text-[#16331f]">Kwentuhan muna?</div>
              <p className="mt-0.5 text-xs leading-snug text-[#3d5c44]">
                Ask a review question, share a study tip, or encourage fellow takers.
              </p>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: ACTIVE CHAT ROOM ================= */}
        <div className="card flex h-[calc(100vh-130px)] min-h-[540px] flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e6d3] bg-white px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileShowList((s) => !s)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d9e6d3] bg-[#f6faf4] text-sm font-bold text-[#15803d] lg:hidden"
                title="Switch study room"
              >
                ←
              </button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dcfce7] text-xl">
                {activeRoom?.icon || "💬"}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-black text-[#16331f]">
                    {activeRoom?.title || "Study Room"}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-extrabold text-[#15803d]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                    Open room
                  </span>
                </div>
                <p className="truncate text-xs text-[#5c7863]">
                  {activeRoom?.subtitle || "Every major. Everyone welcome."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSearch((s) => !s)}
                className="rounded-xl border border-[#d9e6d3] bg-[#f6faf4] px-3 py-1.5 text-xs font-bold text-[#3d5c44] hover:border-[#16a34a]"
              >
                🔍 Search
              </button>
              <Link
                href={activeRoom?.track === "CSE" ? "/review/cse" : "/review/let"}
                className="rounded-xl border border-[#d9e6d3] bg-[#f6faf4] px-3 py-1.5 text-xs font-bold text-[#15803d] hover:border-[#16a34a]"
              >
                🗺️ Practice Sets →
              </Link>
            </div>
          </div>

          {/* Search bar if toggled */}
          {showSearch && (
            <div className="border-b border-[#d9e6d3] bg-[#f6faf4] px-5 py-2.5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages, names, or badges (e.g., Coach, Topnotcher)..."
                className="input-warm py-2 text-xs"
              />
            </div>
          )}

          {/* Quick Study Shortcuts Sub-header */}
          <div className="grid grid-cols-1 gap-2 border-b border-[#d9e6d3] bg-[#f6faf4] px-5 py-2.5 sm:grid-cols-2">
            <Link
              href={
                activeRoom?.specialization
                  ? `/review/let?level=secondary&major=${encodeURIComponent(activeRoom.specialization)}`
                  : activeRoom?.track === "CSE"
                    ? "/review/cse"
                    : "/review/let"
              }
              className="flex items-center justify-between rounded-xl border border-[#d9e6d3] bg-white px-3.5 py-2 text-xs transition hover:border-[#16a34a]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base">⚔️</span>
                <div className="min-w-0">
                  <div className="truncate font-extrabold text-[#16331f]">Mock Board Sets</div>
                  <div className="truncate text-[11px] text-[#5c7863]">
                    {activeRoom?.specialization
                      ? `Take ${activeRoom.specialization} 150-item sets`
                      : "Timed & practice 150-item papers"}
                  </div>
                </div>
              </div>
              <span className="shrink-0 font-extrabold text-[#15803d]">Open →</span>
            </Link>

            <Link
              href="/read"
              className="flex items-center justify-between rounded-xl border border-[#d9e6d3] bg-white px-3.5 py-2 text-xs transition hover:border-[#ca8a04]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base">📚</span>
                <div className="min-w-0">
                  <div className="truncate font-extrabold text-[#16331f]">Reading Library</div>
                  <div className="truncate text-[11px] text-[#5c7863]">
                    Review full notes before your next drill
                  </div>
                </div>
              </div>
              <span className="shrink-0 font-extrabold text-[#b45309]">Read →</span>
            </Link>
          </div>

          {/* Chat Message Feed */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {loadingRoom && messages.length === 0 ? (
              <div className="space-y-3 py-6">
                <div className="skeleton h-14 w-2/3 rounded-2xl" />
                <div className="skeleton h-14 w-1/2 rounded-2xl" />
                <div className="skeleton ml-auto h-14 w-1/2 rounded-2xl" />
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 text-4xl">{activeRoom?.icon || "💬"}</div>
                <h3 className="text-base font-black text-[#16331f]">
                  {searchQuery ? "No matching messages" : `Welcome to ${activeRoom?.title}`}
                </h3>
                <p className="mt-1 max-w-sm text-xs text-[#5c7863]">
                  {searchQuery
                    ? "Try a different keyword."
                    : "Start the conversation! Ask a question about an item, share your review routine, or say hi to fellow reviewees."}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg, idx) => {
                const prev = idx > 0 ? filteredMessages[idx - 1] : null;
                const dateLabel = formatDateHeading(msg.created_at);
                const prevDateLabel = prev ? formatDateHeading(prev.created_at) : null;
                const showDate = dateLabel && dateLabel !== prevDateLabel;
                const initialLetter = (msg.display_name[0] || "K").toUpperCase();

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="my-4 flex items-center justify-center">
                        <span className="rounded-full border border-[#d9e6d3] bg-[#f6faf4] px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5c7863]">
                          {dateLabel}
                        </span>
                      </div>
                    )}

                    <div className="group flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-sm ${avatarClassFor(
                          msg.user_id
                        )}`}
                      >
                        {initialLetter}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold text-[#16331f]">
                            {msg.display_name}
                          </span>
                          {msg.is_me && (
                            <span className="rounded bg-[#dcfce7] px-1.5 py-0.5 text-[10px] font-black uppercase text-[#15803d]">
                              you
                            </span>
                          )}
                          <UserBadgePill
                            label={msg.user_label}
                            color={msg.user_badge_color}
                            isAdmin={msg.is_admin}
                            size="xs"
                          />
                          <span className="text-[11px] font-semibold text-[#94a896]">
                            {formatTime(msg.created_at)}
                          </span>
                          {(msg.is_me || currentUser.isAdmin) && (
                            <button
                              type="button"
                              onClick={() => handleDelete(msg.id)}
                              className="hidden text-[10px] font-bold text-[#991b1b] hover:underline group-hover:inline"
                              title="Delete message"
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        <div
                          className={`inline-block max-w-2xl whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.is_me
                              ? "border border-[#86efac] bg-[#f0fdf4] text-[#16331f]"
                              : msg.is_admin || msg.user_label
                                ? "border border-[#fde68a] bg-[#fffdf2] text-[#16331f]"
                                : "border border-[#d9e6d3] bg-[#f6faf4] text-[#16331f]"
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={feedEndRef} />
          </div>

          {/* Chat Composer Footer */}
          <div className="border-t border-[#d9e6d3] bg-white p-4">
            {errorMsg && (
              <div className="mb-2 rounded-xl bg-[#fee2e2] px-3 py-1.5 text-xs font-bold text-[#991b1b]">
                {errorMsg}
              </div>
            )}
            <div className="flex items-end gap-2.5">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`Message ${activeRoom?.title || "Study Room"}...`}
                className="input-warm min-h-[44px] flex-1 resize-none py-2.5 text-sm"
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={handleSend}
                className="btn-primary h-11 shrink-0 px-5 text-sm font-extrabold"
              >
                {sending ? "Sending…" : "Send →"}
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5c7863]">
              <span>Shift + Enter for a new line · Keep it kind and study-related.</span>
              {(currentUser.userLabel || currentUser.isAdmin) && (
                <span className="flex items-center gap-1.5">
                  <span>Posting with badge:</span>
                  <UserBadgePill
                    label={currentUser.userLabel}
                    color={currentUser.userBadgeColor}
                    isAdmin={currentUser.isAdmin}
                    size="xs"
                  />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
