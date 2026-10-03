import { h, icon, clear, toast, msgBox } from '../dom.js';
import { GET, PATCH } from '../api.js';
import { eventModal } from '../forms.js';
import { todayStr, nowMinutes, addDays, mondayOf, dow, fmtLong, fmtMonth, fmtShort, fmtWd, timeOf, addMin, minutesBetween, diffDays } from '../fmt.js';

const HOUR = 52;
let mode = 'week', anchor = null, scrollTop = null;

function rangeFor() {
  if (mode === 'day') return [anchor, anchor];
  if (mode === 'week') { const m = mondayOf(anchor); return [m, addDays(m, 6)]; }
  const first = anchor.slice(0, 8) + '01'; const m = mondayOf(first); return [m, addDays(m, 41)];
}
const title = () => {
  if (mode === 'day') return fmtLong(anchor);
  if (mode === 'week') { const [a, b] = rangeFor(); return `${fmtShort(a)} — ${fmtShort(b)}`; }
  return fmtMonth(anchor);
};
function shift(n) {
  if (mode === 'day') anchor = addDays(anchor, n);
  else if (mode === 'week') anchor = addDays(anchor, 7 * n);
  else { const y = +anchor.slice(0, 4), m = +anchor.slice(5, 7) - 1 + n; const d = new Date(Date.UTC(y, m, 1)); anchor = d.toISOString().slice(0, 10); }
}

function newEvent(date, time = '09:00', mins = 60) {
  const start = `${date}T${time}`; eventModal({ title: '', start, end: addMin(start, mins), kind: 'event' });
}

/** Раскладка пересекающихся событий по колонкам внутри дня. */
function layout(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = []; let cluster = []; let clusterEnd = -1;
  const flush = () => {
    const cols = [];
    cluster.forEach((it) => {
      let c = cols.findIndex((end) => end <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.e; it.col = c;
    });
    cluster.forEach((it) => { it.cols = cols.length; out.push(it); });
    cluster = [];
  };
  sorted.forEach((it) => { if (cluster.length && it.s >= clusterEnd) { flush(); clusterEnd = -1; } cluster.push(it); clusterEnd = Math.max(clusterEnd, it.e); });
  if (cluster.length) flush();
  return out;
}

export async function render(root) {
  anchor ||= todayStr();
  const [from, to] = rangeFor();
  clear(root);
  const bar = h('div', { class: 'cal-bar' },
    h('div', { class: 'row' },
      h('button', { class: 'btn icon', 'aria-label': 'Назад', onclick: () => { shift(-1); render(root); } }, icon('left')),
      h('button', { class: 'btn icon', 'aria-label': 'Вперёд', onclick: () => { shift(1); render(root); } }, icon('right')),
      h('button', { class: 'btn', onclick: () => { anchor = todayStr(); render(root); } }, 'Сегодня'),
      h('h2', { class: 'cap', style: 'margin-left:8px', 'aria-live': 'polite' }, title())),
    h('div', { class: 'row' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Режим календаря' }, [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']].map(([k, v]) =>
        h('button', { type: 'button', 'aria-pressed': String(mode === k), onclick: () => { mode = k; scrollTop = null; render(root); } }, v))),
      h('button', { class: 'btn primary', onclick: () => newEvent(anchor === todayStr() || mode !== 'month' ? anchor : anchor) }, icon('plus', 18), 'Событие')));
  const body = h('div', {}, h('p', { class: 'muted' }, 'Загрузка календаря…'));
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Календарь'), h('p', { class: 'sub' }, 'Занятия, встречи и время, выделенное на задачи'))),
    h('section', { class: 'card' }, bar, body,
      h('div', { class: 'legend' }, h('span', {}, h('i'), 'Событие'), h('span', {}, h('i', { class: 'wb' }), 'Время на задачу (не крайний срок)'), h('span', {}, h('i', { style: 'background:#fff;box-shadow:inset 0 0 0 2px var(--bad)' }), 'Пересечение'))));
  let events;
  try { events = await GET(`/events?from=${from}&to=${to}`); } catch (e) { clear(body).append(msgBox('err', e.message)); return; }
  let deadlines = [];
  try { deadlines = (await GET('/tasks')).filter((t) => t.status !== 'done' && t.due_date && t.due_date >= from && t.due_date <= to); } catch { /* необязательно */ }
  clear(body).append(mode === 'month' ? monthView(events, deadlines, from, root) : gridView(events, deadlines, from, mode === 'day' ? 1 : 7, root));
}

function evButton(e, cls, extra = {}) {
  return h('button', { type: 'button', class: `${cls} ${e.kind}`, title: e.title, onclick: () => eventModal(e), ...extra });
}

function gridView(events, deadlines, from, days, root) {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const colsTpl = `56px repeat(${days}, minmax(${days > 1 ? 110 : 200}px, 1fr))`;
  const today = todayStr();
  const head = h('div', { class: 'tg-head', style: `grid-template-columns:${colsTpl}` }, h('div'), dates.map((d) =>
    h('button', { class: 'dh' + (d === today ? ' today' : ''), type: 'button', 'aria-label': `Открыть день ${fmtLong(d)}`, onclick: () => { anchor = d; mode = 'day'; render(root); } }, fmtWd(d), h('span', { class: 'dn' }, String(+d.slice(8, 10))))));
  // события на весь день и сроки задач
  const ad = h('div', { class: 'allday', style: `grid-template-columns:${colsTpl}` }, h('div', { class: 'small muted', style: 'padding:4px;text-align:right' }, 'дедлайны'),
    dates.map((d) => h('div', { class: 'cell' },
      events.filter((e) => e.all_day && e.start.slice(0, 10) <= d && e.end.slice(0, 10) >= d).map((e) => evButton(e, 'pill')),
      deadlines.filter((t) => t.due_date === d).map((t) => h('button', { type: 'button', class: 'pill', style: 'background:#fde8ec;color:#8a1229', title: `Крайний срок: ${t.title}`, onclick: () => import('../forms.js').then((m) => m.taskModal(t, { onChange: () => render(root) })) }, `⚑ ${t.title}`)))));
  const hours = h('div', { class: 'hours' }, Array.from({ length: 24 }, (_, i) => h('div', {}, `${String(i).padStart(2, '0')}:00`)));
  const timed = events.filter((e) => !e.all_day);
  const cols = dates.map((d) => {
    const dayStart = `${d}T00:00`, dayEnd = `${addDays(d, 1)}T00:00`;
    const items = timed.filter((e) => e.start < dayEnd && e.end > dayStart).map((e) => {
      const st = minutesBetween(dayStart, e.start < dayStart ? dayStart : e.start);
      const en = Math.min(1440, minutesBetween(dayStart, e.end > dayEnd ? dayEnd : e.end));
      return { s: st, e: Math.max(en, st + 15), ev: e };
    });
    const placed = layout(items);
    const col = h('div', { class: 'col', 'data-date': d, style: `height:${24 * HOUR}px`, onclick: (ev) => {
      if (ev.target !== col) return;
      const y = ev.clientY - col.getBoundingClientRect().top; const mins = Math.floor((y / HOUR) * 2) * 30;
      newEvent(d, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
    } });
    placed.forEach((p) => {
      const conflict = placed.some((o) => o !== p && o.s < p.e && o.e > p.s);
      const w = 100 / p.cols;
      const b = evButton(p.ev, 'ev' + (conflict ? ' conflict' : ''), {
        style: `top:${(p.s / 60) * HOUR}px;height:${Math.max(((p.e - p.s) / 60) * HOUR - 2, 20)}px;left:calc(${p.col * w}% + 2px);width:calc(${w}% - 4px)`,
        'aria-label': `${p.ev.title}, ${timeOf(p.ev.start)}–${timeOf(p.ev.end)}${conflict ? ', пересекается с другим событием' : ''}${p.ev.recurring ? ', повторяется' : ''}`,
      });
      b.append(h('b', {}, (p.ev.recurring ? '↻ ' : '') + p.ev.title), h('span', {}, `${timeOf(p.ev.start)}–${timeOf(p.ev.end)}`));
      if (!p.ev.recurring) enableDrag(b, p.ev, col, dates, root);
      col.append(b);
    });
    if (d === today) col.append(h('div', { class: 'nowline', style: `top:${(nowMinutes() / 60) * HOUR}px` }));
    return col;
  });
  const bodyGrid = h('div', { class: 'tg-body', style: `grid-template-columns:${colsTpl}` }, hours, cols);
  const wrap = h('div', { class: 'tgrid-wrap' }, head, ad, bodyGrid);
  wrap.addEventListener('scroll', () => { scrollTop = wrap.scrollTop; });
  requestAnimationFrame(() => { wrap.scrollTop = scrollTop ?? 7 * HOUR; });
  return wrap;
}

/** Перетаскивание мышью: перенос по времени и между днями. На сенсорных экранах — через форму события. */
function enableDrag(btn, ev, col, dates, root) {
  btn.addEventListener('pointerdown', (down) => {
    if (down.pointerType === 'touch' || down.button !== 0) return;
    const startX = down.clientX, startY = down.clientY; let moved = false;
    const colEls = [...btn.closest('.tg-body').querySelectorAll('.col')];
    const onMove = (m) => {
      if (!moved && Math.hypot(m.clientX - startX, m.clientY - startY) < 6) return;
      moved = true; btn.classList.add('dragging');
      btn.style.transform = `translate(${m.clientX - startX}px, ${m.clientY - startY}px)`;
    };
    const onUp = async (u) => {
      document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
      if (!moved) return;
      btn.classList.remove('dragging'); btn.style.transform = '';
      btn.dataset.dragged = '1'; setTimeout(() => delete btn.dataset.dragged, 0);
      const target = colEls.find((c) => { const r = c.getBoundingClientRect(); return u.clientX >= r.left && u.clientX < r.right; }) || col;
      const dMin = Math.round((((u.clientY - startY) / HOUR) * 60) / 15) * 15;
      const dayShift = diffDays(col.dataset.date, target.dataset.date);
      if (!dMin && !dayShift) return;
      const ns = addMin(`${addDays(ev.start.slice(0, 10), dayShift)}${ev.start.slice(10)}`, dMin);
      const ne = addMin(ns, minutesBetween(ev.start, ev.end));
      try {
        const r = await PATCH(`/events/${ev.id}`, { start: ns, end: ne });
        toast(r.conflicts.length ? `Перенесено. Внимание: пересечение с «${r.conflicts[0].title}»` : 'Событие перенесено');
      } catch (e) { toast(e.message, { error: true }); }
      render(root);
    };
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
  });
  btn.addEventListener('click', (e) => { if (btn.dataset.dragged) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

function monthView(events, deadlines, from, root) {
  const today = todayStr(); const month = anchor.slice(0, 7);
  const grid = h('div', { class: 'month' }, ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => h('div', { class: 'wd' }, d)));
  for (let i = 0; i < 42; i++) {
    const d = addDays(from, i);
    const evs = events.filter((e) => e.start.slice(0, 10) <= d && e.end.slice(0, 10) >= d && !(e.end.slice(0, 10) === d && e.end.endsWith('T00:00') && e.start.slice(0, 10) < d));
    const dl = deadlines.filter((t) => t.due_date === d);
    const cell = h('div', { class: 'day' + (d.startsWith(month) ? '' : ' other') + (d === today ? ' today' : ''), onclick: (e) => { if (e.target === cell) newEvent(d); } },
      h('button', { class: 'dnum', type: 'button', 'aria-label': `Открыть день ${fmtLong(d)}`, onclick: () => { anchor = d; mode = 'day'; render(root); } }, String(+d.slice(8, 10))),
      evs.slice(0, 3).map((e) => { const b = evButton(e, 'pill'); b.textContent = `${e.all_day ? '' : timeOf(e.start) + ' '}${e.recurring ? '↻ ' : ''}${e.title}`; return b; }),
      dl.slice(0, Math.max(0, 3 - evs.length)).map((t) => h('span', { class: 'pill', style: 'background:#fde8ec;color:#8a1229;cursor:default', title: 'Крайний срок задачи' }, `⚑ ${t.title}`)),
      evs.length + dl.length > 3 && h('button', { class: 'pill', type: 'button', style: 'background:none', onclick: () => { anchor = d; mode = 'day'; render(root); } }, `ещё ${evs.length + dl.length - 3}`));
    grid.append(cell);
  }
  return grid;
}
