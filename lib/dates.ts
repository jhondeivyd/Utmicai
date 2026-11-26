// Datas no fuso da workspace
export function todayIn(tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDays(ymd: string, n: number) {
  const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function offsetMinutes(tz: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return (asUtc - at.getTime()) / 60000;
}
// início do dia (00:00 no fuso) em ISO UTC
export function startOfDayIso(ymd: string, tz: string) {
  const guess = new Date(ymd + "T00:00:00Z");
  return new Date(guess.getTime() - offsetMinutes(tz, guess) * 60000).toISOString();
}
export function resolveRange(sp: Record<string, string | undefined>, tz: string) {
  const today = todayIn(tz);
  const p = sp.p || "today";
  let from = today, to = today;
  if (p === "yesterday") from = to = addDays(today, -1);
  else if (p === "7d") from = addDays(today, -6);
  else if (p === "30d") from = addDays(today, -29);
  else if (p === "month") from = today.slice(0, 8) + "01";
  else if (p === "custom" && sp.from && sp.to) { from = sp.from; to = sp.to; }
  return { p, from, to, startIso: startOfDayIso(from, tz), endIso: startOfDayIso(addDays(to, 1), tz) };
}
