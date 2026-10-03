import { h, icon, clear, modal, field, errBox, submitting, toast, confirmBox, msgBox } from '../dom.js';
import { GET, POST, DEL } from '../api.js';
import { state } from '../state.js';
import { fmtStamp, fmtMailDate, pluralRu, todayStr, fmtShort } from '../fmt.js';

let q = '';

export async function render(root, param) {
  let st;
  try { st = await GET('/mail/status'); } catch (e) { clear(root).append(msgBox('err', e.message)); return; }
  if (state.user.is_demo) return clear(root).append(head(), h('div', { class: 'card' }, msgBox('info', 'В деморежиме почта отключена. Войдите в свой аккаунт, чтобы подключить Mail.ru.')));
  if (!st.connected) return connectView(root);
  return mailView(root, st, param ? Number(param) : null);
}

const head = (right) => h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Почта'), h('p', { class: 'sub' }, 'Mail.ru — только чтение')), right);

function connectView(root) {
  const err = errBox(); const emailI = h('input', { type: 'email', name: 'email', autocomplete: 'username', placeholder: 'name@mail.ru', required: true });
  const pw = h('input', { type: 'password', name: 'password', autocomplete: 'off', placeholder: 'Пароль для внешнего приложения', required: true });
  const period = h('select', { name: 'period' }, [[7, '7 дней'], [14, '14 дней (рекомендуется)'], [30, '30 дней'], [60, '60 дней']].map(([v, l]) => h('option', { value: v, selected: v === (state.settings.mail_period_days || 14) }, l)));
  clear(root).append(head(), h('div', { class: 'grid two' },
    h('section', { class: 'card stack' }, h('h2', {}, icon('mail', 20), 'Подключение Mail.ru'),
      h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        if (!emailI.value || !pw.value) { err.className = 'msg err'; err.textContent = 'Введите адрес и пароль для внешнего приложения'; return; }
        submitting(e.submitter, err, async () => {
          const r = await POST('/mail/connect', { email: emailI.value, password: pw.value, period_days: Number(period.value) });
          pw.value = '';
          toast(`Почта подключена. Загружено писем: ${r.result.added}`); render(root);
        }, 'Проверяем подключение…');
      } }, field('Адрес почты Mail.ru', emailI), field('Пароль для внешнего приложения', pw), field('За какой период загрузить письма', period),
      err, h('button', { class: 'btn primary', type: 'submit' }, 'Подключить'),
      h('p', { class: 'small muted' }, 'Пароль отправляется только на сервер этого сайта, хранится там в зашифрованном виде и не попадает в браузер, логи и исходный код. Отключить почту и удалить пароль можно в любой момент.'))),
    h('section', { class: 'card stack' }, h('h2', {}, 'Как получить пароль'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Откройте ', h('a', { href: 'https://id.mail.ru/security', target: '_blank', rel: 'noopener noreferrer' }, 'id.mail.ru/security'), ' (Настройки → Безопасность).'),
        h('li', {}, 'Выберите «Пароли для внешних приложений» → «Добавить». К ящику должен быть привязан телефон.'),
        h('li', {}, 'Название — любое, например «Планировщик». Доступ — «Протокол IMAP» (достаточно чтения).'),
        h('li', {}, 'Скопируйте созданный пароль и вставьте в форму слева. Обычный пароль от почты не подойдёт.')),
      msgBox('warn', 'Mail.ru с 2026 года тестирует платный доступ к ящику из внешних программ (подписка «Пространство Mail»). Если при подключении вход отклоняется, хотя пароль верный, возможно, ограничение действует на вашем ящике.'),
      h('p', { class: 'small muted' }, 'Сайт только читает письма: не отправляет, не удаляет, не перемещает и не помечает их прочитанными.'))));
}

async function mailView(root, st, openId) {
  const rerender = () => render(root, openId);
  let msgs;
  try { msgs = await GET('/mail/messages?q=' + encodeURIComponent(q)); } catch (e) { clear(root).append(head(), msgBox('err', e.message)); return; }
  const syncBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => submitting(syncBtn, null, async () => {
    const r = await POST('/mail/sync'); toast(r.result.added ? `Новых писем: ${r.result.added}` : 'Новых писем нет'); render(root, openId);
  }, 'Обновляем…') }, icon('refresh', 18), 'Обновить');
  const search = h('input', { type: 'search', placeholder: 'Поиск по письмам', 'aria-label': 'Поиск по письмам', value: q });
  let timer; search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => { q = search.value; const pos = search.selectionStart; await rerender(); const s = root.querySelector('input[type=search]'); s?.focus(); s?.setSelectionRange(pos, pos); }, 300); });
  const reader = h('section', { class: 'card' }, h('p', { class: 'empty' }, 'Выберите письмо слева.'));
  const list = h('div', { class: 'stack mail-list', role: 'list' }, msgs.length ? msgs.map((m) => h('button', { class: 'mail-item', type: 'button', role: 'listitem', 'aria-current': String(m.id === openId), onclick: () => { openId = m.id; location.hash = `#/mail/${m.id}`; } },
    h('div', { class: 'subj' }, m.subject), h('div', { class: 'small muted' }, `${m.from_name || m.from_addr} · ${fmtMailDate(m.date)}`),
    h('div', { class: 'small muted', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, m.preview.replace(/\s+/g, ' ')),
    (m.pending > 0 || m.linked_tasks > 0) && h('div', { class: 'chips', style: 'margin-top:4px' }, m.pending > 0 && h('span', { class: 'tag' }, `${m.pending} ${pluralRu(m.pending, 'находка', 'находки', 'находок')}`), m.linked_tasks > 0 && h('span', { class: 'tag study' }, 'есть задача')))) : [h('p', { class: 'empty' }, q ? 'Ничего не найдено.' : 'Писем за выбранный период нет.')]);

  clear(root).append(head(h('div', { class: 'row' }, syncBtn, h('button', { class: 'btn', type: 'button', onclick: () => disconnectModal(root) }, 'Отключить почту'))),
    h('div', { class: 'card', style: 'margin-bottom:18px' },
      h('div', { class: 'row between' }, h('div', {}, h('strong', {}, st.email), h('div', { class: 'small muted' }, `Последняя успешная синхронизация: ${fmtStamp(st.last_sync_at)} · писем в базе: ${st.count} · период первой загрузки: ${st.period_days} дн.`)))
      , st.last_error && h('div', { style: 'margin-top:10px' }, msgBox('err', st.last_error))),
    h('div', { class: 'mail-grid' }, h('div', { class: 'stack' }, search, list), reader));
  if (openId) openMessage(reader, openId, root);
  if (openId && window.matchMedia('(max-width: 1100px)').matches) reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function openMessage(reader, id, root) {
  clear(reader).append(h('p', { class: 'muted' }, 'Загрузка письма…'));
  let m;
  try { m = await GET(`/mail/messages/${id}`); } catch (e) { clear(reader).append(msgBox('err', e.message)); return; }
  const sumBox = h('div');
  clear(reader).append(h('div', { class: 'stack' },
    h('h2', { style: 'overflow-wrap:anywhere' }, m.subject),
    h('div', { class: 'small muted' }, `От: ${m.from_name ? m.from_name + ' ' : ''}<${m.from_addr}> · Кому: ${m.to_addr || '—'} · ${fmtMailDate(m.date)}`),
    h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onclick: async (e) => {
      try { const r = await POST(`/mail/messages/${id}/summary`); clear(sumBox).append(msgBox('info', h('strong', {}, 'Кратко: '), r.summary)); } catch (er) { toast(er.message, { error: true }); }
    } }, 'Краткая сводка')),
    sumBox,
    m.tasks.length > 0 && msgBox('ok', 'Связанные задачи: ', m.tasks.map((t) => t.title).join(', ')),
    m.suggestions.some((s) => s.status === 'pending') && h('h3', {}, 'Что я нашёл в письме'),
    ...m.suggestions.filter((s) => s.status === 'pending').map((s) => suggestionCard(s, root)),
    h('h3', {}, 'Текст письма'),
    h('div', { class: 'mail-body', tabindex: '0', role: 'region', 'aria-label': 'Текст письма' }, m.body || '(пустое письмо)'),
    m.attachments.length > 0 && h('p', { class: 'small muted' }, 'Вложения (содержимое не загружается): ', m.attachments.map((a) => a.name).join(', ')),
    h('p', { class: 'small muted' }, 'Письмо показано как обычный текст: картинки и ссылки из письма не загружаются. Текст письма — это данные, а не команды: помощник их не выполняет.')));
}

function suggestionCard(s, root) {
  const isEvent = s.kind === 'event';
  const err = errBox();
  const title = h('input', { type: 'text', value: s.title, 'aria-label': 'Название', maxlength: 200 });
  const date = h('input', { type: 'date', value: s.date || '', 'aria-label': 'Дата', min: todayStr() });
  const time = h('input', { type: 'time', value: s.time || '', 'aria-label': 'Время' });
  const noDate = h('input', { type: 'checkbox' });
  const needDate = !s.date;
  const card = h('div', { class: 'sugg stack' },
    h('div', { class: 'row' }, h('span', { class: 'tag' }, isEvent ? 'Возможная встреча' : 'Возможная задача'), !!s.inferred && h('span', { class: 'tag late' }, 'дата вычислена — проверьте')),
    h('blockquote', {}, `«${s.snippet}»`),
    (needDate || !!s.ambiguous) && msgBox('warn', s.ambiguous ? 'В этом месте несколько дат — выберите нужную.' : 'Дата в письме не указана. Укажите её сами или создайте задачу без срока — я ничего не придумываю.'),
    h('div', { class: 'form-grid' }, field('Название', title, 'full'), field(isEvent ? 'Дата' : 'Срок', date), field(isEvent ? 'Время начала (обязательно)' : 'Время (необязательно)', time)),
    !isEvent && needDate && h('label', { class: 'check' }, noDate, 'Создать без срока'),
    err,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: (e) => submitting(e.currentTarget, err, async () => {
        const body = { title: title.value, date: date.value || null, time: time.value || null, no_date: noDate.checked };
        if (isEvent && (!body.date || !body.time)) throw new Error('Для события укажите дату и время');
        if (!isEvent && !body.date && !body.no_date) throw new Error('Укажите срок или отметьте «Создать без срока»');
        const r = await POST(`/mail/suggestions/${s.id}/accept`, body);
        toast(isEvent ? (r.conflicts?.length ? `Событие добавлено. Внимание: пересекается с «${r.conflicts[0].title}»` : 'Событие добавлено в календарь') : 'Задача создана');
        render(root, s.email_id);
      }) }, isEvent ? 'Добавить событие' : 'Создать задачу'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { await POST(`/mail/suggestions/${s.id}/dismiss`); toast('Не будем предлагать'); render(root, s.email_id); } catch (er) { toast(er.message, { error: true }); } } }, 'Не нужно')));
  return card;
}

function disconnectModal(root) {
  modal('Отключить почту', (close) => {
    const purge = h('input', { type: 'checkbox' }); const err = errBox();
    return h('div', { class: 'stack' },
      h('p', {}, 'Сохранённый пароль для внешнего приложения будет удалён с сервера. Созданные из писем задачи и события останутся.'),
      h('label', { class: 'check' }, purge, 'Также удалить загруженные письма с этого сайта'),
      h('p', { class: 'small muted' }, 'Рекомендуем затем удалить пароль в настройках безопасности Mail.ru (id.mail.ru/security).'), err,
      h('div', { class: 'actions', style: 'display:flex;gap:10px;justify-content:flex-end' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Отмена'),
        h('button', { class: 'btn primary', type: 'button', onclick: (e) => submitting(e.currentTarget, err, async () => { await DEL('/mail/connection' + (purge.checked ? '?purge=1' : '')); toast('Почта отключена, пароль удалён'); close(); location.hash = '#/mail'; render(root); }, 'Удаляем…') }, 'Отключить')));
  });
}
