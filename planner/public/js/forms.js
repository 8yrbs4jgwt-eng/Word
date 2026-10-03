import { h, modal, field, errBox, submitting, toast, confirmBox, icon, msgBox, clear } from './dom.js';
import { GET, POST, PATCH, PUT, DEL } from './api.js';
import { state, emit } from './state.js';
import { CATS, STATUSES, PRIOS, todayStr, addMin, minutesBetween, timeOf, addDays, diffDays, dow, fmtShort } from './fmt.js';

const sel = (name, opts, value) => {
  const s = h('select', { name }, Object.entries(opts).map(([k, v]) => h('option', { value: k, selected: String(k) === String(value) }, v)));
  return s;
};
const val = (form, n) => form.elements[n]?.value ?? '';

/* ---------------- Задача ---------------- */
export async function taskModal(task, { onChange, defaults = {} } = {}) {
  const isNew = !task;
  let t = task || { title: '', description: '', category: 'personal', priority: 2, status: 'planned', due_date: null, due_time: null, duration_min: null, ...defaults };
  const refresh = () => { emit('data-changed'); onChange?.(); };

  modal(isNew ? 'Новая задача' : 'Задача', (close) => {
    const err = errBox();
    const form = h('form', { class: 'form-grid', novalidate: true },
      field('Название', h('input', { type: 'text', name: 'title', value: t.title, maxlength: 200, required: true }), 'full'),
      field('Описание', h('textarea', { name: 'description', maxlength: 5000 }, t.description), 'full'),
      field('Категория', sel('category', CATS, t.category)),
      field('Статус', sel('status', STATUSES, t.status)),
      field('Приоритет', sel('priority', PRIOS, t.priority)),
      field('Предполагаемая длительность, мин', h('input', { type: 'number', name: 'duration_min', min: 5, max: 1440, step: 5, value: t.duration_min ?? '' })),
      field('Крайний срок', h('input', { type: 'date', name: 'due_date', value: t.due_date ?? '' })),
      field('Время срока (необязательно)', h('input', { type: 'time', name: 'due_time', value: t.due_time ?? '' })),
      h('div', { class: 'full' }, err),
      h('div', { class: 'full actions', style: 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap' },
        !isNew && h('button', { type: 'button', class: 'btn danger', onclick: async () => {
          if (!(await confirmBox('Удалить задачу?', 'Подзадачи и время в календаре, выделенное на неё, тоже будут удалены.', 'Удалить', true))) return;
          try { await DEL(`/tasks/${t.id}`); toast('Задача удалена'); close(); refresh(); } catch (e) { toast(e.message, { error: true }); }
        } }, icon('trash', 18), 'Удалить'),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Закрыть'),
        h('button', { type: 'submit', class: 'btn primary' }, 'Сохранить')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const body = {
        title: val(form, 'title'), description: val(form, 'description'), category: val(form, 'category'), status: val(form, 'status'),
        priority: Number(val(form, 'priority')), due_date: val(form, 'due_date') || null, due_time: val(form, 'due_time') || null,
        duration_min: val(form, 'duration_min') ? Number(val(form, 'duration_min')) : null,
      };
      if (!body.title.trim()) { err.className = 'msg err'; err.textContent = 'Введите название задачи'; form.elements.title.focus(); return; }
      submitting(e.submitter || form.querySelector('[type=submit]'), err, async () => {
        const saved = isNew ? await POST('/tasks', { ...body, parent_id: defaults.parent_id }) : await PATCH(`/tasks/${t.id}`, body);
        toast(isNew ? 'Задача создана' : 'Изменения сохранены'); close(); refresh();
        return saved;
      });
    });
    const wrap = h('div', {}, form);
    if (!isNew) wrap.append(h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:20px 0' }), subtasksBlock(t, refresh), blockBlock(t, refresh), mailLinkBlock(t, refresh));
    return wrap;
  }, { wide: true });
}

function subtasksBlock(t, refresh) {
  const box = h('div', { class: 'stack' });
  const render = async () => {
    const all = await GET('/tasks'); const subs = all.filter((x) => x.parent_id === t.id);
    clear(box).append(h('h3', {}, 'Подзадачи', subs.length ? ` (${subs.filter((s) => s.status === 'done').length}/${subs.length})` : ''));
    box.append(h('ul', { class: 'list' }, subs.map((s) => h('li', { class: 'item' + (s.status === 'done' ? ' done' : '') },
      h('button', { type: 'button', class: 'cbox', role: 'checkbox', 'aria-checked': String(s.status === 'done'), 'aria-label': `Выполнено: ${s.title}`,
        onclick: async () => { await PATCH(`/tasks/${s.id}`, { status: s.status === 'done' ? 'planned' : 'done' }); await render(); refresh(); } }, s.status === 'done' && icon('check', 16)),
      h('span', { class: 'grow title' }, s.title),
      h('button', { type: 'button', class: 'btn icon sm ghost', 'aria-label': `Удалить подзадачу ${s.title}`, onclick: async () => { await DEL(`/tasks/${s.id}`); await render(); refresh(); } }, icon('x', 16))))));
    const input = h('input', { type: 'text', placeholder: 'Новая подзадача', 'aria-label': 'Название подзадачи', maxlength: 200 });
    const add = async (e) => { e.preventDefault(); if (!input.value.trim()) return; try { await POST('/tasks', { title: input.value, parent_id: t.id }); await render(); refresh(); } catch (er) { toast(er.message, { error: true }); } };
    box.append(h('form', { class: 'quick', onsubmit: add }, input, h('button', { class: 'btn', type: 'submit' }, icon('plus', 18), 'Добавить')));
  };
  render().catch((e) => box.append(msgBox('err', e.message)));
  return box;
}

/** Время в календаре для задачи — отдельно от крайнего срока. */
function blockBlock(t, refresh) {
  const box = h('div', { class: 'stack', style: 'margin-top:20px' });
  const blocksList = h('ul', { class: 'list' });
  const err = errBox(); const warn = h('div', { class: 'msg warn hide' });
  const start = h('input', { type: 'time', name: 'start', value: '10:00', 'aria-label': 'Время начала' });
  const date = h('input', { type: 'date', name: 'date', value: t.due_date && t.due_date >= todayStr() ? t.due_date : todayStr(), 'aria-label': 'День' });
  const dur = h('input', { type: 'number', name: 'dur', min: 5, max: 1440, step: 5, value: t.duration_min || 60, 'aria-label': 'Длительность, минут' });
  const loadBlocks = async () => {
    const from = addDays(todayStr(), -30), to = addDays(todayStr(), 120);
    const evs = (await GET(`/events?from=${from}&to=${to}`)).filter((e) => e.task_id === t.id);
    clear(blocksList).append(...(evs.length ? evs.map((e) => h('li', { class: 'item' },
      icon('clock', 18), h('span', { class: 'grow' }, `${fmtShort(e.start.slice(0, 10))}, ${timeOf(e.start)}–${timeOf(e.end)}`),
      h('button', { type: 'button', class: 'btn icon sm ghost', 'aria-label': 'Убрать этот блок времени', onclick: async () => { await DEL(`/events/${e.id}`); await loadBlocks(); refresh(); } }, icon('x', 16)))) : [h('li', { class: 'muted small' }, 'Время на эту задачу пока не выделено.')]));
  };
  box.append(h('h3', {}, 'Время в календаре'),
    h('p', { class: 'muted small' }, `Крайний срок: ${t.due_date ? fmtShort(t.due_date) : 'не задан'}. Это отдельно от времени, которое вы выделяете на работу.`),
    blocksList,
    h('form', { class: 'row', onsubmit: (e) => {
      e.preventDefault();
      submitting(e.submitter, err, async () => {
        const s = `${date.value}T${start.value}`; const en = addMin(s, Number(dur.value) || 60);
        const r = await POST('/events', { title: `Работа: ${t.title}`.slice(0, 200), kind: 'work_block', task_id: t.id, start: s, end: en });
        warn.className = r.conflicts.length ? 'msg warn' : 'msg warn hide';
        warn.textContent = r.conflicts.length ? `Внимание: пересекается с «${r.conflicts.map((c) => c.title).join('», «')}». Блок добавлен — при желании перенесите его в календаре.` : '';
        toast('Время добавлено в календарь'); await loadBlocks(); refresh();
      }, 'Добавляем…');
    } }, date, start, dur, h('button', { class: 'btn', type: 'submit' }, icon('calendar', 18), 'Добавить в календарь')), warn, err);
  loadBlocks().catch(() => {});
  return box;
}

function mailLinkBlock(t, refresh) {
  const box = h('div', { class: 'stack', style: 'margin-top:20px' });
  const render = async () => {
    const all = await GET('/tasks'); const cur = all.find((x) => x.id === t.id);
    clear(box).append(h('h3', {}, 'Связанное письмо'));
    if (cur.email_id) {
      box.append(h('div', { class: 'item' }, icon('mail', 18), h('span', { class: 'grow' }, cur.email_subject || 'Письмо'),
        h('a', { class: 'btn sm', href: `#/mail/${cur.email_id}`, onclick: () => document.querySelector('.overlay')?.remove() }, 'Открыть'),
        h('button', { type: 'button', class: 'btn sm', onclick: async () => { await PUT(`/tasks/${t.id}/email`, { email_id: null }); await render(); refresh(); } }, 'Отвязать')));
      return;
    }
    const st = await GET('/mail/status');
    if (!st.connected) { box.append(h('p', { class: 'muted small' }, 'Подключите почту в разделе «Почта», чтобы связывать задачи с письмами.')); return; }
    const mails = await GET('/mail/messages');
    const s = h('select', { 'aria-label': 'Письмо' }, h('option', { value: '' }, 'Выберите письмо…'), mails.slice(0, 50).map((m) => h('option', { value: m.id }, `${m.subject} — ${m.from_name || m.from_addr}`)));
    box.append(h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:200px' }, s), h('button', { type: 'button', class: 'btn', onclick: async () => {
      if (!s.value) return; await PUT(`/tasks/${t.id}/email`, { email_id: Number(s.value) }); toast('Письмо связано с задачей'); await render(); refresh();
    } }, icon('link', 18), 'Связать')));
  };
  render().catch((e) => box.append(msgBox('err', e.message)));
  return box;
}

/* ---------------- Событие ---------------- */
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** ev — вхождение события из /events (может быть повторяющимся) или заготовка нового { start, end }. */
export function eventModal(ev, { onChange } = {}) {
  const isNew = !ev.id;
  const recurring = !!ev.recur;
  const refresh = () => { emit('data-changed'); onChange?.(); };
  modal(isNew ? 'Новое событие' : (ev.kind === 'work_block' ? 'Время на задачу' : 'Событие'), (close) => {
    const err = errBox(); const warn = h('div', { class: 'msg warn hide', role: 'status' });
    const allDay = !!ev.all_day;
    const date = h('input', { type: 'date', name: 'date', value: ev.start.slice(0, 10) });
    const st = h('input', { type: 'time', name: 'st', value: allDay ? '09:00' : timeOf(ev.start) });
    const en = h('input', { type: 'time', name: 'en', value: allDay ? '10:00' : timeOf(ev.end) });
    const endDate = h('input', { type: 'date', name: 'endDate', value: ev.end.slice(0, 10) });
    const allCb = h('input', { type: 'checkbox', name: 'all_day', checked: allDay });
    const kind = h('select', { name: 'kind' }, h('option', { value: 'event', selected: ev.kind !== 'work_block' }, 'Событие'), h('option', { value: 'work_block', selected: ev.kind === 'work_block' }, 'Время на выполнение задачи'));
    const taskSel = h('select', { name: 'task_id' }, h('option', { value: '' }, 'Выберите задачу…'));
    GET('/tasks').then((ts) => ts.filter((t) => t.status !== 'done' || t.id === ev.task_id).forEach((t) => taskSel.append(h('option', { value: t.id, selected: t.id === ev.task_id }, t.title)))).catch(() => {});
    const taskField = field('Задача', taskSel);
    const rec = ev.recur;
    const freq = h('select', { name: 'freq' }, [['', 'Не повторять'], ['daily', 'Каждый день'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц']].map(([k, v]) => h('option', { value: k, selected: (rec?.freq || '') === k }, v)));
    const interval = h('input', { type: 'number', name: 'interval', min: 1, max: 52, value: rec?.interval || 1, 'aria-label': 'Интервал повторения' });
    const until = h('input', { type: 'date', name: 'until', value: rec?.until || '' });
    const wdBoxes = WD.map((n, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'wd' + i, checked: rec?.byday ? rec.byday.includes(i) : i === dow(ev.start.slice(0, 10)) }), n));
    const recBox = h('div', { class: 'full stack' },
      h('div', { class: 'form-grid' }, field('Повторение', freq), field('Каждые (интервалов)', interval)),
      h('div', { class: 'row wd-row' }, wdBoxes), field('Повторять до (необязательно)', until));
    const scope = recurring && !isNew ? h('fieldset', { class: 'full', style: 'border:1px solid var(--line);border-radius:16px;padding:8px 14px' },
      h('legend', {}, 'Что изменить?'),
      h('label', { class: 'check' }, h('input', { type: 'radio', name: 'scope', value: 'one', checked: true }), 'Только это занятие'), ' ',
      h('label', { class: 'check', style: 'margin-left:14px' }, h('input', { type: 'radio', name: 'scope', value: 'all' }), 'Всю серию')) : null;
    const form = h('form', { class: 'form-grid', novalidate: true },
      field('Название', h('input', { type: 'text', name: 'title', value: ev.title || '', maxlength: 200 }), 'full'),
      h('label', { class: 'check full' }, allCb, 'Весь день'),
      field('Тип', kind, 'full'), taskField,
      field('Дата', date), h('div', {}), field('Начало', st), field('Окончание', en),
      field('Дата окончания (для многодневных)', endDate, 'multi'),
      recBox,
      field('Описание', h('textarea', { name: 'description', maxlength: 5000 }, ev.description || ''), 'full'),
      scope, h('div', { class: 'full' }, warn, err));
    const syncUi = () => {
      const w = form.elements.kind.value === 'work_block'; taskField.classList.toggle('hide', !w);
      const ad = allCb.checked; st.closest('label').classList.toggle('hide', ad); en.closest('label').classList.toggle('hide', ad);
      form.querySelector('.multi').classList.toggle('hide', !ad);
      const f = freq.value; interval.closest('label').classList.toggle('hide', !f); until.closest('label').classList.toggle('hide', !f);
      form.querySelector('.wd-row').classList.toggle('hide', f !== 'weekly');
    };
    let timer;
    const checkConflicts = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const r = range(); if (!r || allCb.checked) { warn.className = 'msg warn hide'; return; }
        try {
          const c = await GET(`/events/conflicts?start=${r.start}&end=${r.end}${ev.id ? `&exclude=${ev.id}` : ''}`);
          warn.className = c.length ? 'msg warn' : 'msg warn hide';
          warn.textContent = c.length ? `Пересечение: ${c.map((x) => `«${x.title}» ${timeOf(x.start)}–${timeOf(x.end)}`).join('; ')}. Сохранить можно, но время занято.` : '';
        } catch { /* необязательная подсказка */ }
      }, 300);
    };
    const range = () => {
      if (allCb.checked) return { start: `${date.value}T00:00`, end: `${endDate.value || date.value}T23:59` };
      if (!date.value || !st.value || !en.value) return null;
      let end = `${date.value}T${en.value}`; const start = `${date.value}T${st.value}`;
      if (end <= start) end = `${addDays(date.value, 1)}T${en.value}`; // через полночь
      return { start, end };
    };
    form.addEventListener('input', () => { syncUi(); checkConflicts(); });
    form.addEventListener('change', () => { syncUi(); checkConflicts(); });
    syncUi(); checkConflicts();

    const buildBody = () => {
      const r = range();
      if (!form.elements.title.value.trim()) throw new Error('Введите название события');
      if (!r) throw new Error('Укажите дату и время');
      if (form.elements.kind.value === 'work_block' && !form.elements.task_id.value) throw new Error('Выберите задачу, на которую выделяется время');
      if (allCb.checked && r.end < r.start) throw new Error('Дата окончания раньше начала');
      const body = { title: form.elements.title.value, description: form.elements.description.value, all_day: allCb.checked, start: r.start, end: r.end,
        kind: form.elements.kind.value, task_id: form.elements.kind.value === 'work_block' ? Number(form.elements.task_id.value) : null };
      if (freq.value) {
        body.recur = { freq: freq.value, interval: Number(interval.value) || 1 };
        if (freq.value === 'weekly') body.recur.byday = WD.map((_, i) => i).filter((i) => form.elements['wd' + i].checked);
        if (until.value) body.recur.until = until.value;
      } else body.recur = null;
      return body;
    };
    const afterSave = (r) => {
      toast(r.conflicts?.length ? `Сохранено. Внимание: пересечение с «${r.conflicts.map((c) => c.title).join('», «')}»` : 'Событие сохранено', { error: false });
      close(); refresh();
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(e.submitter || form.querySelector('[type=submit]'), err, async () => {
        const body = buildBody();
        if (isNew) return afterSave(await POST('/events', body));
        const one = recurring && form.elements.scope?.value === 'one';
        if (one) return afterSave(await POST(`/events/${ev.id}/detach`, { ...body, date: ev.occurrence_date, recur: null }));
        if (recurring) { // вся серия: сдвигаем начало серии на столько дней, на сколько перенесли это занятие
          const d0 = addDays(ev.series_start.slice(0, 10), diffDays(ev.occurrence_date, date.value));
          const dur = minutesBetween(body.start, body.end);
          body.start = `${d0}T${body.start.slice(11)}`; body.end = addMin(body.start, dur);
        }
        return afterSave(await PATCH(`/events/${ev.id}`, body));
      });
    });
    form.append(h('div', { class: 'full actions', style: 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap' },
      !isNew && h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (recurring) {
          const only = await confirmBox('Удалить повторяющееся событие', 'Удалить только это занятие? Если выбрать «Отмена», вы сможете удалить всю серию кнопкой ниже.', 'Только это занятие', true);
          if (only) { try { await POST(`/events/${ev.id}/skip`, { date: ev.occurrence_date }); toast('Занятие удалено'); close(); refresh(); } catch (e) { toast(e.message, { error: true }); } }
          return;
        }
        if (!(await confirmBox('Удалить событие?', `«${ev.title}»`, 'Удалить', true))) return;
        try { await DEL(`/events/${ev.id}`); toast('Событие удалено'); close(); refresh(); } catch (e) { toast(e.message, { error: true }); }
      } }, icon('trash', 18), recurring ? 'Удалить это занятие' : 'Удалить'),
      !isNew && recurring && h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!(await confirmBox('Удалить всю серию?', `Все повторения «${ev.title}» будут удалены.`, 'Удалить серию', true))) return;
        try { await DEL(`/events/${ev.id}`); toast('Серия удалена'); close(); refresh(); } catch (e) { toast(e.message, { error: true }); }
      } }, 'Удалить серию'),
      h('button', { type: 'button', class: 'btn', onclick: close }, 'Закрыть'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Сохранить')));
    return form;
  }, { wide: true });
}
