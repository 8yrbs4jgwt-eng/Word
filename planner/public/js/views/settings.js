import { h, icon, clear, field, errBox, submitting, toast, msgBox, modal, confirmBox } from '../dom.js';
import { GET, PUT, DEL, POST } from '../api.js';
import { state } from '../state.js';
import { fmtStamp } from '../fmt.js';

const TZ = ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka', 'Europe/Minsk', 'Europe/Kyiv', 'Asia/Almaty', 'Europe/Berlin', 'UTC'];

export async function render(root) {
  const s = state.settings;
  let ai; try { ai = await GET('/ai/status'); } catch (e) { clear(root).append(msgBox('err', e.message)); return; }
  const err = errBox();
  const f = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    submitting(e.submitter, err, async () => {
      const el = f.elements;
      state.settings = await PUT('/settings', { name: el.name.value, timezone: el.tz.value, work_start: el.ws.value, work_end: el.we.value, break_min: Number(el.br.value), preferences: el.pref.value, mail_period_days: Number(el.mp.value) });
      toast('Настройки сохранены'); document.dispatchEvent(new Event('planner:settings'));
    });
  } },
    field('Ваше имя', h('input', { type: 'text', name: 'name', value: s.name, maxlength: 60, autocomplete: 'given-name' })),
    field('Часовой пояс', h('select', { name: 'tz' }, [...new Set([s.timezone, ...TZ])].map((z) => h('option', { value: z, selected: z === s.timezone }, z)))),
    field('Рабочий день: начало', h('input', { type: 'time', name: 'ws', value: s.work_start })), field('Рабочий день: конец', h('input', { type: 'time', name: 'we', value: s.work_end })),
    field('Перерыв между делами, мин', h('input', { type: 'number', name: 'br', min: 0, max: 120, value: s.break_min })),
    field('Период первой загрузки почты', h('select', { name: 'mp' }, [7, 14, 30, 60].map((n) => h('option', { value: n, selected: n === s.mail_period_days }, `${n} дней`)))),
    field('Мои предпочтения (их учитывает помощник)', h('textarea', { name: 'pref', maxlength: 2000, placeholder: 'Например: не планировать дела после 21:00; утром лучше учиться; в воскресенье — отдых.' }, s.preferences), 'full'),
    h('div', { class: 'full' }, err), h('div', { class: 'full' }, h('button', { class: 'btn primary', type: 'submit' }, 'Сохранить настройки')));

  const keyInput = h('input', { type: 'password', autocomplete: 'off', placeholder: 'sk-ant-…', 'aria-label': 'API-ключ Anthropic' }); const kerr = errBox();
  const aiCard = h('section', { class: 'card stack' }, h('h2', {}, icon('sparkle', 20), 'ИИ-помощник'),
    ai.demo ? msgBox('info', 'В деморежиме ИИ отключён.') :
    ai.configured ? msgBox('ok', `ИИ подключён (${ai.key_source === 'env' ? 'ключ задан на сервере' : 'ключ сохранён на сервере'}). Модель: ${ai.model}.`) : msgBox('warn', 'ИИ не подключён. Остальные функции планировщика работают без него.'),
    h('p', { class: 'small' }, 'Помощник работает через отдельный API-ключ Anthropic (console.anthropic.com), который оплачивается по использованию отдельно. Подписка Claude или Claude Code внутри сайта не действует. Ключ хранится на сервере в зашифрованном виде и в браузер не возвращается.'),
    !ai.demo && h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); submitting(e.submitter, kerr, async () => { await PUT('/ai/key', { key: keyInput.value }); keyInput.value = ''; toast('Ключ сохранён'); render(root); }); } },
      h('div', { style: 'flex:1;min-width:220px' }, keyInput), h('button', { class: 'btn', type: 'submit' }, ai.key_source === 'user' ? 'Заменить ключ' : 'Сохранить ключ'),
      ai.key_source === 'user' && h('button', { class: 'btn danger', type: 'button', onclick: async () => { await DEL('/ai/key'); toast('Ключ удалён'); render(root); } }, 'Удалить ключ')), kerr,
    !ai.demo && h('div', { class: 'stack' }, h('h3', {}, 'Письма и ИИ'),
      h('p', { class: 'small' }, ai.mail_consent_at ? `Согласие на передачу фрагментов писем ИИ дано ${fmtStamp(ai.mail_consent_at)}. Письма отправляются только если в чате включён переключатель «Учитывать письма».` : 'По умолчанию письма ИИ не передаются. Согласие запрашивается при первом включении переключателя «Учитывать письма» в чате.'),
      ai.mail_consent_at && h('button', { class: 'btn sm', type: 'button', onclick: async () => { await POST('/ai/mail-consent', { granted: false }); state.settings.ai_mail_consent_at = null; toast('Согласие отозвано'); render(root); } }, 'Отозвать согласие')));

  const dl = (label, href) => h('a', { class: 'btn sm', href, download: '' }, icon('download', 16), label);
  clear(root).append(h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Настройки'), h('p', { class: 'sub' }, state.user.email))),
    h('div', { class: 'grid two' }, h('section', { class: 'card stack' }, h('h2', {}, 'Профиль и предпочтения'), f), h('div', { class: 'grid' }, aiCard,
      h('section', { class: 'card stack' }, h('h2', {}, 'Экспорт данных'), h('p', { class: 'small muted' }, 'Скачайте свои данные на компьютер.'),
        h('div', { class: 'chips' }, dl('Всё (JSON)', '/api/export?format=json'), dl('Задачи (CSV)', '/api/export?type=tasks&format=csv'), dl('События (CSV)', '/api/export?type=events&format=csv'), dl('Заметки (CSV)', '/api/export?type=notes&format=csv'))),
      h('section', { class: 'card stack' }, h('h2', {}, 'Аккаунт'), h('button', { class: 'btn', type: 'button', onclick: () => document.dispatchEvent(new Event('planner:logout')) }, 'Выйти')))));
}
