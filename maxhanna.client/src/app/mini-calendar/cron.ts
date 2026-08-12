/**
 * 5-field cron helpers for the mini-calendar, ported from Weaver's own
 * calendar (wwwroot/calendar.js `cronMatches`) so the two calendars agree on
 * what "fires on this day" means.
 *
 * Field order: minute, hour, day-of-month, month, day-of-week (0-6, Sunday=0).
 * Each field supports `*` (any), the step form `*`/N (every N), exact values,
 * `lo-hi` ranges and comma lists. Like Weaver's implementation, all five
 * fields must match (AND semantics — the calendar UI mirrors the scheduler
 * rather than the POSIX day-of-month/day-of-week OR rule).
 */

function matchField(field: string, val: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const interval = parseInt(field.slice(2), 10);
    return interval > 0 && val % interval === 0;
  }
  const vals = field.split(',');
  for (const v of vals) {
    const dash = v.indexOf('-');
    if (dash > 0) {
      const lo = parseInt(v.slice(0, dash), 10);
      const hi = parseInt(v.slice(dash + 1), 10);
      if (val >= lo && val <= hi) return true;
    } else if (parseInt(v, 10) === val) {
      return true;
    }
  }
  return false;
}

/** Full 5-field match (minute + hour + day-of-month + month + day-of-week). */
export function cronMatches(expr: string, date: Date): boolean {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    return matchField(parts[0], date.getMinutes()) &&
      matchField(parts[1], date.getHours()) &&
      matchField(parts[2], date.getDate()) &&
      matchField(parts[3], date.getMonth() + 1) &&
      matchField(parts[4], date.getDay());
  } catch {
    return false;
  }
}

/**
 * Day-level match used to place a cron card on calendar cells: does the cron
 * fire on THIS calendar day? Only the day-of-month, month and day-of-week
 * fields matter here — the time of day is rendered separately (card.time), so
 * a "0 9 * * 1" card still marks every Monday cell and a "0 9 * /2 * *"-style
 * schedule marks every second day of the month (the every-N-days case).
 */
export function cronDayMatches(expr: string, date: Date): boolean {
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    return matchField(parts[2], date.getDate()) &&
      matchField(parts[3], date.getMonth() + 1) &&
      matchField(parts[4], date.getDay());
  } catch {
    return false;
  }
}
