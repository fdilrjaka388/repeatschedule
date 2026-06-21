import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Repeat — Your Daily Rhythm" },
      { name: "description", content: "Repeat is a voice-first daily planner. Speak your tasks, track your streak, and stay in rhythm." },
      { property: "og:title", content: "Repeat — Your Daily Rhythm" },
      { property: "og:description", content: "Voice-first daily planner with streaks, moods, and AI recommendations." },
    ],
  }),
  component: Index,
});

type Task = {
  id: string;
  title: string;
  time: string;
  tag: string;
  createdAt: number;
  done?: boolean;
  source?: "voice" | "ai" | "manual";
  xp?: number;
};

// crude parser: pull a time-like string out of the transcript
function extractTime(text: string): string {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|AM|PM)?\b/);
  if (!m) {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  let h = parseInt(m[1], 10);
  const min = m[2] ? m[2] : "00";
  const p = (m[3] || "").toLowerCase();
  if (p === "pm" && h < 12) h += 12;
  if (p === "am" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

function extractTag(text: string): string {
  const t = text.toLowerCase();
  if (/(meet|call|sync|standup|zoom)/.test(t)) return "Meeting";
  if (/(gym|run|workout|yoga)/.test(t)) return "Health";
  if (/(deep work|focus|write|code|design)/.test(t)) return "Focus";
  if (/(eat|lunch|dinner|breakfast|coffee)/.test(t)) return "Break";
  if (/(remind|reminder|todo)/.test(t)) return "Reminder";
  return "Task";
}

function cleanTitle(text: string): string {
  return text
    .replace(/^(remind me to|schedule|book|add|create|please|hey chronos,?)\s+/i, "")
    .replace(/\bat \d{1,2}(:\d{2})?\s?(am|pm)?\b/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function Index() {
  const [introDone, setIntroDone] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([
    { id: "seed-1", title: "Morning brief & inbox sweep", time: "08:30", tag: "Focus", createdAt: Date.now() - 5000, done: true, xp: 20 },
    { id: "seed-2", title: "Design sync with the team", time: "11:00", tag: "Meeting", createdAt: Date.now() - 4000, xp: 30 },
    { id: "seed-3", title: "Workout — push day", time: "18:00", tag: "Health", createdAt: Date.now() - 3000, xp: 25 },
  ]);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [tab, setTab] = useState<"today" | "history" | "consistency" | "insights">("today");
  const [toast, setToast] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), 2900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (m: string) => setToast(m);

  const start = () => {
    setError(null);
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    finalRef.current = "";
    setTranscript("");
    setInterim("");
    rec.onresult = (e: any) => {
      let interimStr = "";
      let finalStr = finalRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalStr += r[0].transcript + " ";
        else interimStr += r[0].transcript;
      }
      finalRef.current = finalStr;
      setTranscript(finalStr);
      setInterim(interimStr);
    };
    rec.onerror = (e: any) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied." : `Voice error: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
    const final = (finalRef.current || transcript || interim).trim();
    if (final.length > 2) {
      const newTask: Task = {
        id: `t-${Date.now()}`,
        title: cleanTitle(final) || final,
        time: extractTime(final),
        tag: extractTag(final),
        createdAt: Date.now(),
        source: "voice",
        xp: 20,
      };
      setTasks((prev) => [newTask, ...prev]);
      showToast(`✦ "${newTask.title.slice(0, 28)}…" added from voice`);
    }
    setTranscript("");
    setInterim("");
    finalRef.current = "";
  };

  const liveText = (transcript + " " + interim).trim();

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => b.createdAt - a.createdAt),
    [tasks]
  );

  const doneCount = tasks.filter((t) => t.done).length;
  const totalXp = tasks.filter((t) => t.done).reduce((a, t) => a + (t.xp || 0), 0);
  const xpGoal = 100;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const toggleDone = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const addRecommendation = (text: string) => {
    const t: Task = {
      id: `t-${Date.now()}`,
      title: text,
      time: extractTime(text),
      tag: extractTag(text),
      createdAt: Date.now(),
      source: "ai",
      xp: 25,
    };
    setTasks((prev) => [t, ...prev]);
    showToast(`✨ Added from AI`);
  };

  const moodLabels = ["Sleepy", "Meh", "Okay", "On fire"];
  const moodEmojis = ["😴", "😐", "😊", "🔥"];

  const streakDays = [true, true, true, true, true, false, false];
  const weekData = [
    { d: "Mon", pct: 90 },
    { d: "Tue", pct: 75 },
    { d: "Wed", pct: 100 },
    { d: "Thu", pct: 60 },
    { d: "Fri", pct: 85 },
    { d: "Sat", pct: 30 },
    { d: "Sun", pct: 50 },
  ];
  const recommendations = [
    "Take a 5-min walk to reset your focus",
    "Drink a glass of water before your next task",
    "Block 25 minutes for deep work right now",
  ];
  const badges = [
    { sym: "🔥", label: "5-day streak", color: "#f5b942" },
    { sym: "✓", label: "10 tasks done", color: "#22d3ee" },
    { sym: "⭐", label: "Level 7", color: "#8b5cf6" },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-carbon text-white font-sans selection:bg-violet-glow/30">
      {/* INTRO OVERLAY */}
      {!introDone && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-carbon animate-intro-overlay">
          <div className="absolute inset-0 grid-bg opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18),transparent_60%)]" />
          <div className="absolute size-[500px] rounded-full border border-violet-glow/15 animate-voice-pulse" />
          <div className="absolute size-[700px] rounded-full border border-cyan-pulse/10 animate-voice-pulse" style={{ animationDelay: "0.6s" }} />
          <div className="relative flex flex-col items-center">
            <span className="font-display text-[14vw] md:text-[10vw] font-extrabold tracking-tighter text-gradient-aurora animate-intro-logo leading-none">
              REPEAT
            </span>
            <div className="mt-6 h-px bg-gradient-to-r from-transparent via-cyan-pulse to-transparent animate-intro-line" />
            <span className="mt-6 text-xs uppercase tracking-[0.5em] text-white/40 animate-intro-logo">
              Your day, spoken into existence
            </span>
          </div>
        </div>
      )}

      {/* AMBIENT BG */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="glow-blob bg-violet-glow/20 w-[600px] h-[600px] -top-40 -left-40 animate-float-slow" />
        <div className="glow-blob bg-cyan-pulse/15 w-[500px] h-[500px] top-1/3 -right-40 animate-float-slow" style={{ animationDelay: "3s" }} />
        <div className="glow-blob bg-pink-500/10 w-[400px] h-[400px] bottom-0 left-1/3 animate-float-slow" style={{ animationDelay: "6s" }} />
      </div>

      {/* NAV */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6 animate-slide-up" style={{ animationDelay: "2.6s" }}>
        <div className="flex items-center gap-3">
          <div className="size-2 rounded-full bg-cyan-pulse shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-blink" />
          <span className="font-display text-xl font-extrabold tracking-tighter">REPEAT</span>
        </div>
        <div className="hidden md:flex gap-8 text-sm font-medium text-white/50">
          <a href="#schedule" className="hover:text-white transition-colors">Today</a>
          <a href="#streak" className="hover:text-white transition-colors">Streak</a>
          <a href="#insights" className="hover:text-white transition-colors">Insights</a>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-300 text-xs font-semibold">
            ⚡ Level 7
          </span>
          <div className="size-9 rounded-full bg-gradient-to-br from-violet-glow to-cyan-pulse text-white text-xs font-bold flex items-center justify-center">
            AR
          </div>
        </div>
      </nav>

      {/* HERO */}
      <main className="relative z-10 px-6 md:px-10 pt-12 pb-24 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* LEFT */}
          <div className="animate-slide-up" style={{ animationDelay: "2.7s" }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-8">
              <span className="size-1.5 rounded-full bg-cyan-pulse animate-blink" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">Voice intelligence · live</span>
            </div>
            <p className="text-sm text-white/40 mb-2">{greeting}, Arka 👋</p>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[0.9] mb-8">
              Speak your{" "}
              <span className="text-gradient-aurora">rhythm</span>
              <span className="inline-block w-3 h-12 md:h-20 ml-2 bg-cyan-pulse align-middle animate-blink" />
            </h1>
            <p className="text-lg text-white/55 max-w-md mb-10 leading-relaxed">
              No typing. No forms. Just talk. Repeat listens, understands, and turns
              your words into a real schedule — instantly.
            </p>

            {/* VOICE COMMAND */}
            <div className="relative group max-w-xl">
              <div className={`absolute -inset-1 bg-gradient-to-r from-violet-glow via-cyan-pulse to-pink-500 rounded-3xl blur-xl transition-opacity duration-700 ${listening ? "opacity-60" : "opacity-25 group-hover:opacity-45"}`} />
              <div className="relative bg-white/[0.04] border border-white/10 rounded-3xl p-6 backdrop-blur-2xl">
                <div className="flex items-center gap-5 mb-5">
                  <button
                    onClick={listening ? stop : start}
                    aria-label={listening ? "Stop listening" : "Start listening"}
                    className={`relative size-16 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                      listening
                        ? "bg-red-500 animate-voice-listen"
                        : "bg-gradient-to-br from-violet-glow to-cyan-pulse animate-voice-pulse"
                    }`}
                  >
                    <MicIcon className="size-6 text-white" />
                  </button>

                  <div className="flex-1 flex items-end gap-1 h-12">
                    {Array.from({ length: 18 }).map((_, i) => (
                      <div
                        key={i}
                        className="wave-bar flex-1"
                        style={{
                          height: listening ? `${20 + Math.sin(i) * 20 + 20}px` : "6px",
                          animationDelay: `${i * 0.07}s`,
                          animationPlayState: listening ? "running" : "paused",
                          opacity: listening ? 1 : 0.25,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="min-h-[88px] p-4 rounded-2xl bg-black/40 border border-white/5 font-display text-lg leading-snug">
                  {liveText ? (
                    <span className="text-white">
                      {transcript}
                      <span className="text-white/40">{interim}</span>
                      {listening && <span className="inline-block w-2 h-5 ml-1 bg-cyan-pulse align-middle animate-blink" />}
                    </span>
                  ) : (
                    <span className="text-white/35 italic">
                      {listening
                        ? "Listening… try “remind me to call Sara at 3 pm”"
                        : supported === false
                          ? "Voice not supported here. Try Chrome or Edge."
                          : "Tap the mic and tell me what's on your mind."}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${listening ? "bg-red-500 animate-blink" : "bg-white/20"}`} />
                    <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                      {listening ? "Listening" : "Idle"}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/30">
                    Web Speech · on-device
                  </span>
                </div>
                {error && (
                  <div className="mt-3 text-xs text-red-400/90">{error}</div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — SCHEDULE */}
          <div id="schedule" className="relative animate-slide-up" style={{ animationDelay: "2.9s" }}>
            <div className="absolute -top-20 -right-20 size-96 bg-violet-glow/10 rounded-full blur-[120px] animate-float" />

            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold tracking-tight">Today's rhythm</h2>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 mb-5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-xs">
              {(["today", "history", "consistency", "insights"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2 rounded-full uppercase tracking-widest font-semibold transition-all ${
                    tab === t
                      ? "bg-gradient-to-r from-violet-glow to-cyan-pulse text-white shadow-lg"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "today" && (
            <div className="space-y-3">
              {sorted.map((t, i) => (
                <div
                  key={t.id}
                  className={`group relative p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md hover:scale-[1.015] hover:bg-white/[0.06] transition-all duration-300 animate-slide-up ${t.done ? "opacity-60" : ""}`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 rounded-r-full bg-gradient-to-b from-violet-glow to-cyan-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-cyan-pulse uppercase tracking-[0.2em]">
                        {t.tag}
                      </span>
                      {t.source === "voice" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-glow/20 text-violet-glow uppercase tracking-widest">Voice</span>
                      )}
                      {t.source === "ai" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-400 uppercase tracking-widest">AI</span>
                      )}
                    </div>
                    <span className="text-xs text-white/40 font-mono">{t.time}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleDone(t.id)}
                      aria-label="Toggle done"
                      className={`mt-1.5 size-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        t.done
                          ? "bg-gradient-to-br from-violet-glow to-cyan-pulse border-transparent"
                          : "border-white/20 hover:border-white/50"
                      }`}
                    >
                      {t.done && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                    <div className="flex-1">
                      <h3 className={`text-xl font-display font-semibold text-pretty ${t.done ? "line-through" : ""}`}>
                        {t.title}
                      </h3>
                      <p className="text-xs text-white/35 mt-1">+{t.xp ?? 20} XP</p>
                    </div>
                  </div>
                </div>
              ))}

              {tasks.length === 0 && (
                <div className="p-8 rounded-2xl border border-dashed border-white/10 text-center text-white/40">
                  No tasks yet — press the mic and start talking.
                </div>
              )}
            </div>
            )}

            {tab === "history" && (
              <div className="space-y-3">
                {["Yesterday", "Mon, Oct 21", "Sun, Oct 20"].map((d, i) => (
                  <div key={d} className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="flex justify-between mb-2">
                      <span className="font-display font-semibold">{d}</span>
                      <span className="text-xs text-cyan-pulse">{[6, 4, 5][i]} / {[7, 5, 6][i]} done</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-violet-glow to-cyan-pulse" style={{ width: `${[86, 80, 83][i]}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "consistency" && (
              <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md animate-slide-up">
                <div className="flex items-baseline justify-between mb-6">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/40">Weekly</span>
                  <span className="text-2xl font-display font-bold text-gradient-aurora">76%</span>
                </div>
                <div className="space-y-3">
                  {weekData.map((w) => (
                    <div key={w.d} className="flex items-center gap-4">
                      <span className="w-10 text-xs text-white/40 font-mono">{w.d}</span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-glow to-cyan-pulse"
                          style={{ width: `${w.pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-white/60 font-mono">{w.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "insights" && (
              <div id="insights" className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md animate-slide-up">
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-pink-400">AI Recommendations</span>
                </div>
                <div className="space-y-2">
                  {recommendations.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => addRecommendation(r)}
                      className="w-full text-left p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-pink-400/40 hover:bg-pink-400/5 transition-all flex items-center justify-between gap-3 group"
                    >
                      <span className="text-sm text-white/80">{r}</span>
                      <span className="text-[10px] uppercase tracking-widest text-pink-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        + Add
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STREAK / MOOD / BADGES STRIP */}
        <div id="streak" className="grid md:grid-cols-3 gap-5 mt-16 animate-slide-up" style={{ animationDelay: "3.1s" }}>
          {/* Streak */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/10 backdrop-blur-md relative overflow-hidden">
            <div className="absolute -top-10 -right-10 size-32 bg-amber-400/20 rounded-full blur-3xl" />
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">Active streak</div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-display text-6xl font-extrabold text-gradient-aurora leading-none">5</span>
              <span className="text-sm text-white/50">days in a row</span>
            </div>
            <div className="flex gap-1.5 mt-4 mb-5">
              {streakDays.map((d, i) => (
                <div
                  key={i}
                  className={`flex-1 h-2 rounded-full ${d ? "bg-gradient-to-r from-violet-glow to-cyan-pulse" : "bg-white/10"}`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
              <span>Today's XP</span>
              <span className="text-white/80">{totalXp} / {xpGoal}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-glow via-cyan-pulse to-pink-500 transition-all duration-700"
                style={{ width: `${Math.min(100, (totalXp / xpGoal) * 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-xl font-display font-bold">{doneCount}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">Done</div>
              </div>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-xl font-display font-bold">{tasks.length}</div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">Total</div>
              </div>
            </div>
          </div>

          {/* Mood */}
          <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-4">Mood today</div>
            <div className="grid grid-cols-4 gap-2">
              {moodEmojis.map((e, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setMood(i);
                    showToast(`Mood logged: ${moodLabels[i]}`);
                  }}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                    mood === i
                      ? "bg-gradient-to-br from-violet-glow/20 to-cyan-pulse/20 border-cyan-pulse/40 scale-105"
                      : "bg-white/[0.03] border-white/10 hover:border-white/20"
                  }`}
                >
                  <span className="text-3xl">{e}</span>
                  <span className="text-[10px] text-white/60">{moodLabels[i]}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 pt-5 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mb-3">Badges</div>
              <div className="flex gap-3">
                {badges.map((b) => (
                  <div key={b.label} className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/10 text-center">
                    <div className="text-2xl mb-1" style={{ color: b.color }}>{b.sym}</div>
                    <div className="text-[9px] uppercase tracking-widest text-white/40 leading-tight">{b.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI recs */}
          <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] uppercase tracking-[0.3em] text-pink-400">AI for you</span>
              <span className="size-1.5 rounded-full bg-pink-400 animate-blink" />
            </div>
            <div className="space-y-2">
              {recommendations.map((r, i) => (
                <button
                  key={i}
                  onClick={() => addRecommendation(r)}
                  className="w-full text-left p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-pink-400/40 hover:bg-pink-400/5 transition-all flex items-center justify-between gap-2 group"
                >
                  <span className="text-sm text-white/80 leading-snug">{r}</span>
                  <span className="text-[10px] uppercase tracking-widest text-pink-400 opacity-50 group-hover:opacity-100 transition-opacity shrink-0">
                    + Add
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* FEATURES */}
      <section id="features" className="relative z-10 px-6 md:px-10 py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="mb-16 max-w-2xl">
            <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-pulse">Why Chronos</span>
            <h3 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight mt-4">
              A schedule that <span className="text-gradient-aurora">listens back</span>.
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { c: "bg-cyan-pulse", g: "rgba(34,211,238,0.8)", t: "Neural Transcription", d: "Talk naturally. Chronos parses intent, time, and tags — even mid-sentence." },
              { c: "bg-violet-glow", g: "rgba(139,92,246,0.8)", t: "Fluid Choreography", d: "Every entry animates into place. Your day feels alive, not stacked." },
              { c: "bg-pink-500", g: "rgba(236,72,153,0.8)", t: "Adaptive Rhythm", d: "Chronos learns when you focus best and shapes your day around your energy." },
            ].map((f, i) => (
              <div
                key={f.t}
                className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.06] transition-all animate-slide-up backdrop-blur-md"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div
                  className={`size-1 ${f.c} mb-6`}
                  style={{ boxShadow: `0 0 15px ${f.g}` }}
                />
                <h4 className="font-display text-xl font-bold mb-3">{f.t}</h4>
                <p className="text-white/50 leading-relaxed text-sm">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 px-6 md:px-10 py-10 border-t border-white/5 text-center text-xs uppercase tracking-[0.3em] text-white/30">
        Repeat · Your daily rhythm
      </footer>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-sm text-white animate-slide-up shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}
