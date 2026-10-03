import { h, icon, clear, toast, msgBox } from '../dom.js';
import { GET, POST, PATCH } from '../api.js';
import { taskModal, eventModal } from '../forms.js';
import { openChat } from '../chat.js';
import { state } from '../state.js';
import { CATS, fmtLong, dueLabel, isLate, timeOf, fmtDur, fmtMailDate, todayStr, pluralRu } from '../fmt.js';

function greeting() {
  const hr = Number(new Intl.DateTimeFormat('ru', { timeZone: state.settings.timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
}

export async function render(root) {
  let d;
  try { d = await GET('/today'); } catch (e) { clear(root).append(msgBox('err', e.message)); return; }
  const name = state.settings.name;
  const done = async (t) => { try { await PATCH(`/tasks/${t.id}`, { status: 'done' }); toast('Готово! Задача выполнена', { action: 'Вернуть', onAction: async () => { await PATCH(`/tasks/${t.id}`, { status: 'planned' }); render(root); } }); render(root); } catch (e) { toast(e.message, { error: true }); } };
  const taskRow = (t, i) => h('li', { class: 'item clickable' + (i != null ? ' top3' : ''), onclick: (e) => { if (!e.target.closest('.cbox')) taskModal(t, { onChange: () => render(root) }); } },
    i != null && h('span', { class: 'num' }, String(i + 1)),
    h('button', { class: 'cbox', type: 'button', role: 'checkbox', 'aria-checked': 'false', 'aria-label': `Отметить выполненной: ${t.title}`, onclick: () => done(t) }),
    h('div', { class: 'grow' }, h('div', { class: 'title' }, t.title),
      h('div', { class: 'meta' }, h('span', { class: 'tag ' + t.category }, CATS[t.category]), h('span', { class: isLate(t) ? 'tag late' : '' }, isLate(t) ? 'просрочено · ' + dueLabel(t) : dueLabel(t)), t.duration_min && h('span', {}, fmtDur(t.duration_min)))),
    h('span', { class: 'prio p' + t.priority, title: 'Приоритет', role: 'img', 'aria-label': `Приоритет ${t.priority}` }));

  const quickInput = h('input', { type: 'text', placeholder: 'Что нужно сделать? Например: купить билеты', 'aria-label': 'Быстрый ввод задачи', maxlength: 200 });
  const quick = h('form', { class: 'quick', onsubmit: async (e) => {
    e.preventDefault(); const title = quickInput.value.trim(); if (!title) return;
    const b = e.submitter; b.disabled = true;
    try { await POST('/tasks', { title }); quickInput.value = ''; toast('Задача добавлена'); render(root); } catch (er) { toast(er.message, { error: true }); } finally { b.disabled = false; }
  } }, quickInput, h('button', { class: 'btn primary', type: 'submit' }, icon('plus', 18), 'Добавить'));

  const mailCard = h('section', { class: 'card' }, h('h2', {}, icon('mail', 20), 'Важные письма'));
  if (!d.mail.length) mailCard.append(h('p', { class: 'muted' }, 'Писем пока нет. ', h('a', { href: '#/mail' }, 'Подключить почту Mail.ru')));
  else mailCard.append(h('ul', { class: 'list' }, d.mail.map((m) => h('li', {}, h('a', { class: 'item clickable', href: `#/mail/${m.id}`, style: 'text-decoration:none;color:inherit' },
    h('div', { class: 'grow' }, h('div', { class: 'title' }, m.subject), h('div', { class: 'meta' }, m.from_name || m.from_addr, ' · ', fmtMailDate(m.date))),
    m.pending > 0 && h('span', { class: 'tag' }, `${m.pending} ${pluralRu(m.pending, 'находка', 'находки', 'находок')}`))))));

  clear(root).append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, `${greeting()}${name ? ', ' + name : ''}`), h('p', { class: 'sub cap' }, fmtLong(d.today))),
      h('button', { class: 'btn primary', onclick: () => openChat({ send: 'Помоги спланировать мой день на сегодня. Учти занятые часы, дедлайны и перерывы.' }) }, icon('sparkle', 18), 'Помоги спланировать день')),
    h('div', { class: 'grid today' },
      h('div', { class: 'grid' },
        h('section', { class: 'card' }, h('h2', {}, 'Три главные задачи'),
          d.top3.length ? h('ul', { class: 'list' }, d.top3.map((t, i) => taskRow(t, i))) : h('p', { class: 'empty' }, 'Открытых задач нет — свободный день 🌿')),
        h('section', { class: 'card' }, h('h2', {}, icon('calendar', 20), 'Расписание на сегодня'),
          d.events.length ? h('ul', { class: 'list timeline' }, d.events.map((e) => h('li', { class: 'item clickable', onclick: () => eventModal(e, { onChange: () => render(root) }) },
            h('span', { class: 'time' }, e.all_day ? 'весь день' : `${timeOf(e.start)}–${timeOf(e.end)}`),
            h('div', { class: 'grow' }, h('div', { class: 'title' }, (e.recurring ? '↻ ' : '') + e.title), e.kind === 'work_block' && h('div', { class: 'meta' }, 'Время на задачу')))))
            : h('p', { class: 'empty' }, 'На сегодня событий нет.')),
        h('section', { class: 'card' }, h('h2', {}, 'Быстрый ввод'), quick)),
      h('div', { class: 'grid' },
        h('section', { class: 'card' }, h('h2', {}, icon('clock', 20), 'Ближайшие дедлайны'),
          d.deadlines.length ? h('ul', { class: 'list' }, d.deadlines.map((t) => taskRow(t))) : h('p', { class: 'empty' }, 'На ближайшую неделю сроков нет.')),
        mailCard)));
}
