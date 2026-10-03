// Поиск возможных дедлайнов, встреч и действий в тексте письма.
// Это обычный разбор текста по правилам, без ИИ: текст письма никогда не выполняется как инструкция.
import crypto from 'node:crypto';
import { addDays, dow, isValidDate, RE_TIME } from './dates.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = [/понедельник\w*/i, /вторник\w*/i, /сред[аыуе](?![а-яё])/i, /четверг\w*/i, /пятниц\w*/i, /суббот\w*/i, /воскресень\w*/i];
const MEETING = /(встреч|созвон|собрани|совещани|лекци|занятие|занятия|консультаци|вебинар|семинар|экзамен|зач[её]т|защит|собеседовани|приглашаем|приглашаю|конференци|стрим)/i;
const ACTION = /(необходимо|нужно|надо|просим|прошу|требуется|не позднее|дедлайн|крайний срок|срок(?![а-яё])|сдать|сдайте|отправ|пришл|предостав|подготов|заполн|оплат|ответ|подтверд|напоминаем|не забудьте|регистраци|(?<![а-яё])до\s)/i;
const STRONG_ACTION = /(необходимо|просим|прошу|требуется|не забудьте|пожалуйста,?\s+(пришл|отправ|подтверд|заполн|ответ|оплат))/i;

const pad = (n) => String(n).padStart(2, '0');
const mkDate = (y, m, d) => { const s = `${y}-${pad(m)}-${pad(d)}`; return isValidDate(s) ? s : null; };

function dateWithoutYear(m, d, ref) {
  let y = Number(ref.slice(0, 4));
  let s = mkDate(y, m, d);
  if (s && s < addDays(ref, -30)) s = mkDate(y + 1, m, d);
  return s;
}

/** Находит даты в предложении. ref — дата письма (ГГГГ-ММ-ДД). Возвращает { dates, rest } */
export function findDates(text, ref) {
  const found = [];
  let rest = text;
  const take = (re, fn) => {
    rest = rest.replace(re, (...m) => {
      const r = fn(m);
      if (r) { found.push(r); return ' '.repeat(m[0].length); }
      return m[0];
    });
  };
  take(/(?<![\d:.])(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?![\d])/g, (m) => {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = mkDate(y, Number(m[2]), Number(m[1]));
    return date && { date, inferred: false };
  });
  take(/(?<![\d:.])(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/gi, (m) => {
    const mon = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    const date = m[3] ? mkDate(Number(m[3]), mon, Number(m[1])) : dateWithoutYear(mon, Number(m[1]), ref);
    return date && { date, inferred: !m[3] };
  });
  take(/(?<![\d:.])(\d{1,2})[./](\d{1,2})(?![\d:.])/g, (m) => {
    const date = Number(m[2]) <= 12 ? dateWithoutYear(Number(m[2]), Number(m[1]), ref) : null;
    return date && { date, inferred: true };
  });
  take(/послезавтра/gi, () => ({ date: addDays(ref, 2), inferred: true }));
  take(/завтра/gi, () => ({ date: addDays(ref, 1), inferred: true }));
  take(/сегодня/gi, () => ({ date: ref, inferred: true }));
  WEEKDAYS.forEach((re, idx) => {
    take(new RegExp(re.source, 'gi'), () => {
      const diff = ((idx - dow(ref) + 7) % 7) || 7;
      return { date: addDays(ref, diff), inferred: true };
    });
  });
  const uniq = [...new Map(found.map((f) => [f.date, f])).values()];
  return { dates: uniq, rest };
}

export function findTime(text) {
  let m = text.match(/(?<![\d.])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d])/);
  if (m) { const t = `${pad(m[1])}:${m[2]}`; if (RE_TIME.test(t)) return t; }
  m = text.match(/(?<![а-яё])(?:в|к|до|с)\s+([01]?\d|2[0-3])\s*час(?:а|ов)?(?![а-яё])/i);
  if (m) return `${pad(m[1])}:00`;
  return null;
}

export function cleanBody(body) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) continue; // цитаты
    if (/^(-{2,}\s*(Original|Пересылаемое|Исходное)|On .+ wrote:|.*написал\(а\):)/i.test(l.trim())) break;
    out.push(l);
  }
  return out.join('\n');
}

const keyOf = (parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);
const shorten = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * @param {{ subject:string, body:string, refDate:string, today:string, messageKey:string }} m
 * @returns список предложений { kind, title, date, time, snippet, inferred, ambiguous, source_key }
 */
export function extractSuggestions({ subject, body, refDate, today, messageKey }) {
  const sentences = cleanBody(body)
    .split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"(\d])|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 8 && s.length <= 500);
  const out = [];
  const seen = new Set();
  let undated = 0;
  for (const s of sentences) {
    const { dates, rest } = findDates(s, refDate);
    const meeting = MEETING.test(s);
    const action = ACTION.test(s);
    const future = dates.filter((d) => d.date >= today);
    if (dates.length && !future.length) continue; // все даты уже в прошлом
    let date = null, inferred = false, ambiguous = false, time = null;
    if (future.length === 1 && (meeting || action)) { date = future[0].date; inferred = future[0].inferred; }
    else if (future.length > 1 && (meeting || action)) ambiguous = true;
    else if (!future.length && STRONG_ACTION.test(s) && undated < 2) undated++;
    else continue;
    if (meeting || /(?:в|к)\s+\d/.test(rest)) time = findTime(rest);
    const kind = meeting && !/(?:сдать|сдайте|отправ|пришл|предостав|заполн|оплат)/i.test(s) ? 'event' : 'task';
    if (kind === 'event' && !date && !ambiguous) continue; // встреча без даты — не предлагаем
    const title = shorten(s.replace(/^[-–•*\d.)\s]+/, ''), 100);
    const source_key = keyOf([messageKey, kind, date || '', s.toLowerCase()]);
    if (seen.has(source_key)) continue;
    seen.add(source_key);
    out.push({ kind, title, date, time, snippet: shorten(s, 300), inferred, ambiguous, source_key });
    if (out.length >= 6) break;
  }
  return out;
}

/** Краткая сводка без ИИ: первые предложения письма. */
export function localSummary(subject, body) {
  const text = cleanBody(body).replace(/\s+/g, ' ').trim();
  const parts = text.split(/(?<=[.!?])\s+/).filter((p) => p.length > 15);
  return shorten(parts.slice(0, 2).join(' ') || text, 320);
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
