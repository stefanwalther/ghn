export interface SnoozePreset {
  value: "1h" | "3h" | "evening" | "tomorrow" | "nextWeek";
  label: string;
  at: number;
}

function atTime(base: Date, hours: number, minutes = 0): number {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

export function snoozePresets(now: number): SnoozePreset[] {
  const base = new Date(now);
  const in1h = now + 3600 * 1000;
  const in3h = now + 3 * 3600 * 1000;

  let evening = atTime(base, 18);
  if (evening <= now) {
    const tomorrow = new Date(base);
    tomorrow.setDate(tomorrow.getDate() + 1);
    evening = atTime(tomorrow, 18);
  }
  const tomorrowMorning = new Date(base);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  const tomorrowAt = atTime(tomorrowMorning, 9);

  const day = base.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  const monday = new Date(base);
  monday.setDate(monday.getDate() + daysUntilMonday);
  const mondayAt = atTime(monday, 9);

  const time = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const weekday = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { weekday: "short" });

  return [
    { value: "1h", label: `In 1 hour (${time(in1h)})`, at: in1h },
    { value: "3h", label: `In 3 hours (${time(in3h)})`, at: in3h },
    { value: "evening", label: `This evening (${time(evening)})`, at: evening },
    { value: "tomorrow", label: `Tomorrow (${time(tomorrowAt)})`, at: tomorrowAt },
    {
      value: "nextWeek",
      label: `Next week (${weekday(mondayAt)} ${time(mondayAt)})`,
      at: mondayAt,
    },
  ];
}

export function isSnoozed(snoozedUntil: number | null, now: number): boolean {
  return snoozedUntil != null && now < snoozedUntil;
}

export function formatSnoozeUntil(snoozedUntil: number | null, now: number): string {
  if (!isSnoozed(snoozedUntil, now)) return "Not snoozed";
  const ts = snoozedUntil as number;
  const time = new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfTs = new Date(ts).setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfTs - startOfToday) / (24 * 3600 * 1000));
  if (dayDiff <= 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  const weekday = new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${time}`;
}
