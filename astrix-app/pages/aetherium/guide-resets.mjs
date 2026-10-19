/**
 * Reset times for the Guide (The Aetherium), pure so Node tests can load it. The rule is UTC (general.json reset-times);
 * the page shows the result in the player's own zone.
 */
/** The next reset after now: daily { hourUtc, minuteUtc }, weekly adds weekdayUtc (0 Sunday ... 3 Wednesday). */
export function nextReset(now, rule) {
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), rule.hourUtc, rule.minuteUtc ?? 0));
  const weekly = Number.isInteger(rule.weekdayUtc);
  if (weekly) at.setUTCDate(at.getUTCDate() + ((rule.weekdayUtc - at.getUTCDay() + 7) % 7));
  if (at <= now) at.setUTCDate(at.getUTCDate() + (weekly ? 7 : 1));
  return at;
}
/** "in 3 days 4 h", "in 5 h 12 min", "in 7 min". */
export function countdownWords(now, until) {
  const minutes = Math.max(0, Math.ceil((until - now) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  if (days) return `in ${days} day${days === 1 ? '' : 's'}${hours ? ` ${hours} h` : ''}`;
  if (hours) return `in ${hours} h${mins ? ` ${mins} min` : ''}`;
  return `in ${mins} min`;
}
