import { h, icon, clear, toast, modal, confirmBox, msgBox } from './dom.js';
import { GET, POST, DEL, ApiError } from './api.js';
import { state, emit } from './state.js';
import { fmtShort, timeOf } from './fmt.js';

let panel = null, msgsEl, inputEl, sendBtn, undoBar, mailToggle, statusBox, aiStatus, busy = false;

const OPS = { create_task: 'Новая задача', update_task: 'Изменить задачу', create_event: 'Новое событие', update_event: 'Изменить событие', delete_event: 'Удалить событие' };
const when = (s, e) => `${fmtShort(s.slice(0, 10))}, ${timeOf(s)}–${timeOf(e)}`;
function describe(it) {
  const parts = [];
  if (it.op === 'create_task') {
    if (it.parent_ref || it.parent_id) parts.push('подзадача');
    if (it.due_date) parts.push(`срок ${fmtShort(it.due_date)}${it.due_time ? ' ' + it.due_time : ''}`);
    if (it.duration_min) parts.push(`${it.duration_min} мин`);
    return [`${OPS[it.op]}: «${it.title}»`, parts.join(', ')];
  }
  if (it.op === 'update_task') {
    if (it.title) parts.push(`название «${it.title}»`);
    if (it.due_date !== undefined) parts.push(`срок ${fmtShort(it.due_date)}`);
    if (it.status) parts.push(`статус: ${{ planned: 'запланировано', in_progress: 'в работе', done: 'выполнено' }[it.status]}`);
    if (it.priority) parts.push(`приоритет ${it.priority}`);
    if (it.duration_min) parts.push(`${it.duration_min} мин`);
    return [`${OPS[it.op]} «${it.before_title}»`, parts.join(', ')];
  }
  if (it.op === 'create_event') return [`${it.kind === 'work_block' || it.task_ref || it.task_id ? 'Время на задачу' : 'Новое событие'}: «${it.title}»`, it.start ? when(it.start, it.end) : ''];
  if (it.op === 'update_event') return [`Перенести/изменить «${it.before_title}»`, `${it.before_start ? 'было ' + when(it.before_start, it.before_end) : ''}${it.start ? ' → стало ' + when(it.start, it.end || it.before_end) : ''}`];
  return [`${OPS[it.op]} «${it.before_title}»`, it.before_start ? when(it.before_start, it.before_end) : ''];
}

function proposalCard(p) {
  const box = h('div', { class: 'proposal' });
  const draw = () => {
    clear(box).append(h('strong', {}, p.summary),
      p.reasoning && h('p', { class: 'small muted' }, p.reasoning),
      h('ul', {}, p.items.map((it) => { const [a, b] = describe(it); return h('li', {}, a, b && h('span', { class: 'muted' }, ' — ' + b)); })),
      p.dropped?.length > 0 && h('p', { class: 'small muted' }, 'Пропущено как некорректное: ' + p.dropped.join('; ')),
      p.warnings?.length > 0 && msgBox('warn', h('strong', {}, 'Пересечения: '), p.warnings.join('; ')));
    if (p.status === 'pending') {
      const ok = h('button', { class: 'btn primary sm', type: 'button', onclick: async () => {
        ok.disabled = true;
        try { await POST(`/ai/proposals/${p.id}/apply`); p.status = 'applied'; draw(); toast('Изменения применены', { action: 'Отменить', onAction: undo, ms: 12000 }); emit('data-changed'); refreshUndo(); }
        catch (e) { toast(e.message, { error: true }); ok.disabled = false; }
      } }, 'Применить');
      box.append(h('div', { class: 'row' }, ok, h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await POST(`/ai/proposals/${p.id}/cancel`); p.status = 'cancelled'; draw(); } catch (e) { toast(e.message, { error: true }); } } }, 'Отмена')),
        h('p', { class: 'small muted' }, 'Пока вы не нажмёте «Применить», ничего не изменится.'));
    } else box.append(h('span', { class: 'tag' + (p.status === 'applied' ? ' personal' : '') }, { applied: '✓ Применено', cancelled: 'Отменено', undone: '↩ Применение отменено' }[p.status] || p.status));
  };
  draw(); return box;
}

async function undo() {
  try { const r = await POST('/ai/undo'); toast(`Отменено: ${r.summary}`); emit('data-changed'); await refreshUndo(); await loadHistory(); }
  catch (e) { toast(e.message, { error: true }); }
}
async function refreshUndo() {
  if (!undoBar) return;
  try {
    const hst = await GET('/ai/history');
    clear(undoBar);
    if (hst.undoable) { undoBar.classList.remove('hide'); undoBar.append(h('span', { class: 'small' }, `Последнее применённое: ${hst.undoable.summary}`), h('button', { class: 'btn sm', type: 'button', onclick: undo }, 'Отменить последнюю операцию')); }
    else undoBar.classList.add('hide');
  } catch { /* ignore */ }
}

function bubble(role, text) { return h('div', { class: `bubble ${role}` }, text); }
async function loadHistory() {
  const hst = await GET('/ai/history');
  clear(msgsEl);
  if (!hst.messages.length) msgsEl.append(h('div', { class: 'bubble assistant' }, 'Здравствуйте! Напишите, что нужно сделать, обычными словами — например: «До пятницы подготовить презентацию, а завтра занятия до 16:00». Я предложу план, а вы решите, применять ли его.'));
  hst.messages.forEach((m) => { msgsEl.append(bubble(m.role, m.content)); if (m.proposal) msgsEl.append(proposalCard(m.proposal)); });
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function consentModal() {
  return new Promise((resolve) => {
    let answered = false; const fin = (v) => { if (!answered) { answered = true; resolve(v); } };
    const close = modal('Передать письма ИИ?', (close) => h('div', { class: 'stack' },
      h('p', {}, 'Чтобы помощник мог отвечать на вопросы о почте, вместе с вашим запросом на сервис ИИ (Anthropic) будут отправлены:'),
      h('ul', {}, h('li', {}, 'отправитель, тема и дата последних 15 писем;'), h('li', {}, 'первые ~400 символов текста каждого из них.')),
      h('p', {}, 'Не отправляются: пароли, вложения, полный текст писем, остальные письма. Письма передаются только в запросах, где включён переключатель «Учитывать письма». Согласие можно отозвать в настройках.'),
      h('div', { class: 'actions', style: 'display:flex;gap:10px;justify-content:flex-end' }, h('button', { class: 'btn', type: 'button', onclick: () => { fin(false); close(); } }, 'Не разрешать'),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { const r = await POST('/ai/mail-consent', { granted: true }); state.settings.ai_mail_consent_at = r.mail_consent_at; fin(true); close(); } catch (e) { toast(e.message, { error: true }); } } }, 'Разрешить'))));
    const t = setInterval(() => { if (!document.querySelector('.overlay')) { clearInterval(t); fin(false); } }, 300);
  });
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true; sendBtn.disabled = true;
  msgsEl.append(bubble('user', text));
  const wait = h('div', { class: 'bubble assistant', role: 'status' }, 'Помощник думает…'); msgsEl.append(wait); msgsEl.scrollTop = msgsEl.scrollHeight;
  try {
    const r = await POST('/ai/chat', { message: text, include_mail: !!mailToggle?.checked });
    wait.replaceWith(bubble('assistant', r.reply)); if (r.proposal) msgsEl.append(proposalCard(r.proposal));
    inputEl.value = '';
  } catch (e) {
    wait.remove();
    if (e instanceof ApiError && e.data?.code === 'ai_not_configured') { await loadStatus(); }
    else msgsEl.append(msgBox('err', e.message));
  } finally { busy = false; sendBtn.disabled = false; msgsEl.scrollTop = msgsEl.scrollHeight; }
}

async function loadStatus() {
  aiStatus = await GET('/ai/status');
  clear(statusBox);
  if (aiStatus.demo) statusBox.append(msgBox('info', 'ИИ-помощник недоступен в деморежиме.'));
  else if (!aiStatus.configured) statusBox.append(msgBox('warn', h('strong', {}, 'ИИ не подключён. '), 'Чтобы включить помощника, добавьте API-ключ в ', h('a', { href: '#/settings', onclick: closeChat }, 'настройках'), '. Остальные разделы работают без него.'));
  statusBox.classList.toggle('hide', aiStatus.configured);
  const can = aiStatus.configured;
  inputEl.disabled = !can; sendBtn.disabled = !can;
  inputEl.placeholder = can ? 'Напишите, что нужно сделать…' : 'ИИ не подключён';
  if (mailToggle) mailToggle.closest('label').classList.toggle('hide', !aiStatus.mail_connected);
}

export function closeChat() { panel?.remove(); panel = null; state.chatOpen = false; document.getElementById('fab')?.focus(); }

export async function openChat(opts = {}) {
  if (!panel) {
    msgsEl = h('div', { class: 'msgs', 'aria-live': 'polite' });
    statusBox = h('div', { style: 'padding:12px 16px 0' });
    undoBar = h('div', { class: 'row between hide', style: 'padding:8px 16px;background:var(--violet-soft)' });
    inputEl = h('textarea', { 'aria-label': 'Сообщение помощнику', maxlength: 4000, onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(inputEl.value); } } });
    sendBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('sparkle', 18), 'Отправить');
    mailToggle = h('input', { type: 'checkbox', onchange: async () => {
      if (mailToggle.checked && !state.settings.ai_mail_consent_at && !(await consentModal())) mailToggle.checked = false;
    } });
    const chips = ['Что осталось сделать до пятницы?', 'Сегодня мало сил — помоги сократить план', 'Найди время на два часа подготовки', 'Сделай обзор выполненного за неделю', 'Какие письма требуют моего внимания?']
      .map((t) => h('button', { type: 'button', class: 'chip', onclick: () => { inputEl.value = t; inputEl.focus(); } }, t));
    panel = h('aside', { class: 'chat card', role: 'complementary', 'aria-label': 'Помощник' },
      h('header', {}, icon('sparkle', 22), h('h2', {}, 'Помощник'),
        h('button', { class: 'btn sm ghost', type: 'button', onclick: async () => { if (await confirmBox('Очистить переписку?', 'Предложения и применённые изменения в календаре и задачах останутся.', 'Очистить')) { await DEL('/ai/history'); loadHistory(); } } }, 'Очистить'),
        h('button', { class: 'btn icon sm', type: 'button', 'aria-label': 'Закрыть помощника', onclick: closeChat }, icon('x', 18))),
      statusBox, undoBar, msgsEl,
      h('form', { onsubmit: (e) => { e.preventDefault(); send(inputEl.value); } },
        h('div', { class: 'chips' }, chips), inputEl,
        h('label', { class: 'check small hide' }, mailToggle, 'Учитывать письма (передать ИИ темы и фрагменты)'),
        h('div', { class: 'row between' }, h('span', { class: 'small muted' }, 'Ctrl+Enter — отправить'), sendBtn)));
    document.body.append(panel); state.chatOpen = true;
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('.overlay')) closeChat(); });
    try { await Promise.all([loadStatus(), loadHistory(), refreshUndo()]); } catch (e) { msgsEl.append(msgBox('err', e.message)); }
  }
  inputEl.focus();
  if (opts.send) {
    if (aiStatus?.configured) send(opts.send);
    else { inputEl.value = opts.send; }
  }
}
