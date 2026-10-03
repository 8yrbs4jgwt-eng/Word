import { h, icon, clear, modal, field, errBox, submitting, toast, confirmBox, msgBox } from '../dom.js';
import { GET, POST, PATCH, DEL } from '../api.js';
import { openChat } from '../chat.js';

let q = '';

function noteModal(note, rerender) {
  const isNew = !note;
  modal(isNew ? 'Новая заметка' : 'Заметка', (close) => {
    const err = errBox();
    const title = h('input', { type: 'text', name: 'title', value: note?.title || '', maxlength: 200 });
    const body = h('textarea', { name: 'body', style: 'min-height:220px', maxlength: 50000 }, note?.body || '');
    const pin = h('input', { type: 'checkbox', checked: !!note?.pinned });
    return h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      submitting(e.submitter, err, async () => {
        const data = { title: title.value, body: body.value, pinned: pin.checked };
        if (isNew) await POST('/notes', data); else await PATCH(`/notes/${note.id}`, data);
        toast('Заметка сохранена'); close(); rerender();
      });
    } }, field('Заголовок', title), field('Текст', body), h('label', { class: 'check' }, pin, icon('pin', 18), 'Закрепить'), err,
    h('div', { class: 'actions', style: 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end' },
      !isNew && h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!(await confirmBox('Удалить заметку?', 'Это действие нельзя отменить.', 'Удалить', true))) return;
        try { await DEL(`/notes/${note.id}`); toast('Заметка удалена'); close(); rerender(); } catch (e) { toast(e.message, { error: true }); }
      } }, icon('trash', 18), 'Удалить'),
      !isNew && h('button', { type: 'button', class: 'btn', onclick: () => { close(); openChat({ send: `Преврати эту заметку в задачу (или несколько задач), если там есть что делать. Не придумывай сроки, которых нет в тексте.\n\nЗаметка «${note.title}»:\n${note.body}` }); } }, icon('sparkle', 18), 'Превратить в задачу'),
      h('button', { type: 'button', class: 'btn', onclick: close }, 'Закрыть'), h('button', { type: 'submit', class: 'btn primary' }, 'Сохранить')));
  }, { wide: true });
}

export async function render(root) {
  let notes;
  try { notes = await GET('/notes?q=' + encodeURIComponent(q)); } catch (e) { clear(root).append(msgBox('err', e.message)); return; }
  const rerender = () => render(root);
  const search = h('input', { type: 'search', placeholder: 'Поиск по заметкам', 'aria-label': 'Поиск по заметкам', value: q });
  let timer; search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => { q = search.value; const pos = search.selectionStart; await rerender(); const s = root.querySelector('input[type=search]'); s.focus(); s.setSelectionRange(pos, pos); }, 300); });
  const card = (n) => h('button', { class: 'note', type: 'button', onclick: () => noteModal(n, rerender) },
    h('div', { class: 'row between' }, h('h3', {}, n.title || 'Без названия'), n.pinned ? h('span', { 'aria-label': 'Закреплено', title: 'Закреплено', style: 'color:var(--violet)' }, icon('pin', 18)) : null),
    h('p', {}, n.body));
  clear(root).append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Заметки'), h('p', { class: 'sub' }, 'Мысли, идеи и черновики')), h('button', { class: 'btn primary', onclick: () => noteModal(null, rerender) }, icon('plus', 18), 'Новая заметка')),
    h('div', { style: 'margin-bottom:14px;max-width:420px' }, search),
    notes.length ? h('div', { class: 'notes-grid' }, notes.map(card)) : h('div', { class: 'card empty' }, q ? 'Ничего не найдено.' : 'Заметок пока нет. Создайте первую.'));
}
