import { addDays, addMinutes, diffMinutes, diffDays, dow, mondayOf, monthIndex, daysInMonth } from './dates.js';

/**
 * recur: { freq: 'daily'|'weekly'|'monthly', interval: 1.., byday?: [0..6] (пн=0), until?: 'YYYY-MM-DD' }
 * exdates: ['YYYY-MM-DD'] — пропущенные повторения.
 */
function matches(day, startDate, r, exdates) {
  if (day < startDate) return false;
  if (r.until && day > r.until) return false;
  if (exdates.includes(day)) return false;
  const interval = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case 'daily':
      return diffDays(startDate, day) % interval === 0;
    case 'weekly': {
      const days = r.byday?.length ? r.byday : [dow(startDate)];
      const weeks = diffDays(mondayOf(startDate), mondayOf(day)) / 7;
      return weeks % interval === 0 && days.includes(dow(day));
    }
    case 'monthly': {
      const dStart = Number(startDate.slice(8, 10));
      if (Number(day.slice(8, 10)) !== dStart) return false;
      return (monthIndex(day) - monthIndex(startDate)) % interval === 0;
    }
    default:
      return false;
  }
}

/** Разворачивает событие в список вхождений, пересекающих [fromDate, toDate] (включительно). */
export function expandEvent(ev, fromDate, toDate) {
  const start = ev.start, end = ev.end;
  const rangeStart = `${fromDate}T00:00`;
  const rangeEnd = `${addDays(toDate, 1)}T00:00`;
  const overlaps = (s, e) => s < rangeEnd && e > rangeStart;
  const recur = typeof ev.recur === 'string' ? JSON.parse(ev.recur || 'null') : ev.recur;
  if (!recur) return overlaps(start, end) || (start === end && start >= rangeStart && start < rangeEnd) ? [{ ...ev, recur: null, occurrence_date: start.slice(0, 10) }] : [];

  const exdates = typeof ev.exdates === 'string' ? JSON.parse(ev.exdates || '[]') : ev.exdates || [];
  const dur = diffMinutes(start, end);
  const startDate = start.slice(0, 10), time = start.slice(10);
  const from = addDays(fromDate, -Math.ceil(dur / 1440));
  const out = [];
  let guard = 0;
  for (let d = from < startDate ? startDate : from; d <= toDate && guard < 800; d = addDays(d, 1), guard++) {
    if (!matches(d, startDate, recur, exdates)) continue;
    const s = d + time;
    const e = addMinutes(s, dur);
    if (overlaps(s, e)) out.push({ ...ev, recur, start: s, end: e, occurrence_date: d, recurring: true, series_start: start });
  }
  return out;
}

export { daysInMonth };
