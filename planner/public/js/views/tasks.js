import { h, icon, clear, toast, msgBox } from '../dom.js';
import { GET, POST, PATCH } from '../api.js';
import { taskModal } from '../forms.js';
import { CATS, STATUSES, dueLabel, isLate, fmtDur, todayStr, addDays } from '../fmt.js';

const f = { cat: 'all', status: 'open', due: 'all' };

const chips = (label, key, opts, rerender) => h('div', { class: 'row' }, h('span', { class: 'small muted' }, label),
  h('div', { class: 'chips', role: 'group', 'aria-label': label }, Object.entries(opts).map(([k, v]) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f[key] === k), onclick: () => { f[key] = k; rerender(); } }, v))));

export async function render(root) {
  let tasks;
  try { tasks = await GET('/tasks'); } catch (e) { clear(root).append(msgBox('err', e.message)); return; }
  const today = todayStr(), week = addDays(today, 7);
  const subs = {}; tasks.filter((t) => t.parent_id).forEach((t) => (subs[t.parent_id] ||= []).push(t));
  const rerender = () => render(root);
  const list = tasks.filter((t) => !t.parent_id).filter((t) => {
    if (f.cat !== 'all' && t.category !== f.cat) return false;
    if (f.status === 'open' ? t.status === 'done' : f.status !== 'all' && t.status !== f.status) return false;
    if (f.due === 'late') return isLate(t);
    if (f.due === 'today') return t.due_date === today;
    if (f.due === 'week') return t.due_date && t.due_date >= today && t.due_date <= week;
    if (f.due === 'none') return !t.due_date;
    return true;
  }).sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due_date || '9999').localeCompare(b.due_date || '9999') || b.priority - a.priority);

  const input = h('input', { type: 'text', placeholder: 'Новая задача…', 'aria-label': 'Название новой задачи', maxlength: 200 });
  const toggle = async (t) => {
    try { await PATCH(`/tasks/${t.id}`, { status: t.status === 'done' ? 'planned' : 'done' }); rerender(); } catch (e) { toast(e.message, { error: true }); }
  };
  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Задачи'), h('p', { class: 'sub' }, 'Учёба, работа и личные дела')),
      h('button', { class: 'btn primary', onclick: () => taskModal(null, { onChange: rerender }) }, icon('plus', 18), 'Новая задача')),
    h('section', { class: 'card stack' },
      h('form', { class: 'quick', onsubmit: async (e) => { e.preventDefault(); if (!input.value.trim()) return; try { await POST('/tasks', { title: input.value, category: f.cat !== 'all' ? f.cat : undefined }); toast('Задача добавлена'); rerender(); } catch (er) { toast(er.message, { error: true }); } } },
        input, h('button', { class: 'btn', type: 'submit' }, 'Добавить')),
      chips('Категория', 'cat', { all: 'Все', ...CATS }, rerender),
      chips('Статус', 'status', { open: 'Невыполненные', all: 'Все', ...STATUSES }, rerender),
      chips('Срок', 'due', { all: 'Любой', late: 'Просрочено', today: 'Сегодня', week: 'На неделе', none: 'Без срока' }, rerender),
      list.length ? h('ul', { class: 'list' }, list.map((t) => {
        const ss = subs[t.id] || []; const sd = ss.filter((x) => x.status === 'done').length;
        return h('li', { class: 'item clickable' + (t.status === 'done' ? ' done' : ''), onclick: (e) => { if (!e.target.closest('.cbox')) taskModal(t, { onChange: rerender }); } },
          h('button', { class: 'cbox', type: 'button', role: 'checkbox', 'aria-checked': String(t.status === 'done'), 'aria-label': `Выполнено: ${t.title}`, onclick: () => toggle(t) }, t.status === 'done' && icon('check', 16)),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, t.title),
            h('div', { class: 'meta' }, h('span', { class: 'tag ' + t.category }, CATS[t.category]), h('span', {}, STATUSES[t.status]),
              h('span', { class: isLate(t) ? 'tag late' : '' }, (isLate(t) ? 'просрочено · ' : 'срок: ') + dueLabel(t)),
              t.duration_min && h('span', {}, '⏱ ' + fmtDur(t.duration_min)),
              t.scheduled_min > 0 && h('span', { title: 'Время, выделенное в календаре' }, '📅 ' + fmtDur(t.scheduled_min)),
              ss.length > 0 && h('span', {}, `подзадачи ${sd}/${ss.length}`),
              t.email_id && h('span', { title: 'Связано с письмом' }, '✉ ' + (t.email_subject || 'письмо')))),
          h('span', { class: 'prio p' + t.priority, role: 'img', 'aria-label': `Приоритет ${t.priority}` }));
      })) : h('p', { class: 'empty' }, 'Под эти фильтры задач нет.')));
}
