// All scheduling reasons in ET. These helpers convert a UTC `Date` (what
// Workers gives us) into the ET calendar/clock fields we actually care about.

export interface EtNow {
  date: string;      // YYYY-MM-DD in ET
  minuteOfDay: number; // 0..1439
  dow: number;       // 0=Sun..6=Sat in ET
  weekStart: string; // YYYY-MM-DD of Monday of this ET week
}

const FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const DOW: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function etNow(now: Date = new Date()): EtNow {
  const parts = FMT.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = Number(get("hour"));
  // "24" can appear at midnight in en-US hour12:false; normalize to 0.
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const dow = DOW[get("weekday")] ?? 0;
  const date = `${year}-${month}-${day}`;
  return {
    date,
    minuteOfDay: hour * 60 + minute,
    dow,
    weekStart: mondayOf(date, dow),
  };
}

export function mondayOfDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay(); // 0=Sun..6=Sat
  return mondayOf(date, dow);
}

function mondayOf(date: string, dow: number): string {
  // dow: 0=Sun..6=Sat. Distance back to Monday: (dow+6)%7.
  const back = (dow + 6) % 7;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  // Use UTC math so we don't trip over local TZ — we only care about the date.
  const t = Date.UTC(y, m - 1, d) - back * 86400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function hmToMinute(h: number, m: number): number {
  return h * 60 + m;
}

export function daysUntil(target: string, from: string): number {
  const [ty, tm, td] = target.split("-").map(Number) as [number, number, number];
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(ty, tm - 1, td);
  const f = Date.UTC(fy, fm - 1, fd);
  return Math.round((t - f) / 86400_000);
}
