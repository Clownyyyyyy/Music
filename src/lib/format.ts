/** Small shared UI formatters */

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** "6+ hours" / "42 min" style long duration (client-safe, shared with server serializers) */
export function formatLongDuration(totalSeconds: number): string {
  if (totalSeconds >= 3600) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.round((totalSeconds % 3600) / 60);
    return `${h} hour${h > 1 ? "s" : ""}${m ? ` ${m} min` : ""}`;
  }
  const m = Math.round(totalSeconds / 60);
  return `${m} min`;
}

export function formatCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function timeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 22) return "Good evening";
  return "Good night";
}

export function relativeDay(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function formatClockTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
