const IST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** NSE cash/derivatives session: Mon–Fri, 09:15–15:30 IST. */
export function isNseOpen(now = new Date()): boolean {
  const parts = Object.fromEntries(IST_PARTS.formatToParts(now).map((p) => [p.type, p.value]));
  const day = WEEKDAY_INDEX[parts.weekday];
  const minutesSinceMidnight = Number(parts.hour) * 60 + Number(parts.minute);
  return day >= 1 && day <= 5 && minutesSinceMidnight >= 9 * 60 + 15 && minutesSinceMidnight <= 15 * 60 + 30;
}

/** Retail FX session: opens Sun 21:00 UTC, closes Fri 21:00 UTC. */
export function isForexLive(now = new Date()): boolean {
  const day = now.getUTCDay();
  const minutesSinceMidnightUtc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const afterSundayOpen = day === 0 && minutesSinceMidnightUtc >= 21 * 60;
  const beforeFridayClose = day === 5 && minutesSinceMidnightUtc < 21 * 60;
  const midWeek = day >= 1 && day <= 4;
  return afterSundayOpen || beforeFridayClose || midWeek;
}
