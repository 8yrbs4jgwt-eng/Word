import { h, icon, clear, field, errBox, submitting, toast, modal } from './dom.js';
import { GET, POST, PUT, api } from './api.js';
import { state, bus } from './state.js';
import { openChat, closeChat } from './chat.js';

const ROUTES = [
  ['today', 'Мой день', 'sun'], ['calendar', 'Календарь', 'calendar'], ['tasks', 'Задачи', 'tasks'],
  ['notes', 'Заметки', 'notes'], ['mail', 'Почта', 'mail'], ['settings', 'Настройки', 'settings'],
];
const SHORT = { today: 'День', calendar: 'Календарь', tasks: 'Задачи', notes: 'Заметки', mail: 'Почта', settings: 'Ещё' };
const loaders = {
  today: () => import('./views/today.js'), calendar: () => import('./views/calendar.js'), tasks: () => import('./views/tasks.js'),
  notes: () => import('./views/notes.js'), mail: () => import('./views/mail.js'), settings: () => import('./views/settings.js'),
};
const app = document.getElementById('app');
let mainEl = null, renderToken = 0;

function currentRoute() {
  const [, name = 'today', param] = location.hash.split('/');
  return [ROUTES.some((r) => r[0] === name) ? name : 'today', param];
}

async function renderView() {
  if (!mainEl) return;
  const [name, param] = currentRoute();
  const token = ++renderToken;
  document.querySelectorAll('[data-route]').forEach((a) => (a.dataset.route === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${ROUTES.find((r) => r[0] === name)[1]} — Планировщик`;
  const mod = await loaders[name]();
  if (token !== renderToken) return;
  try { await mod.render(mainEl, param); } catch (e) { mainEl.replaceChildren(h('div', { class: 'msg err' }, `Не удалось показать раздел: ${e.message}`)); }
}
async function renderInPlace() {
  const [name, param] = currentRoute();
  const mod = await loaders[name]();
  const y = window.scrollY;
  await mod.render(mainEl, param); window.scrollTo(0, y);
}

function shell() {
  mainEl = h('main', { id: 'main', tabindex: '-1' });
  const navLinks = (cls) => ROUTES.map(([k, label, ic]) => h('a', { href: `#/${k}`, 'data-route': k, 'aria-label': label, title: label }, icon(ic, cls === 'b' ? 22 : 22), h('span', { class: 'lbl' }, cls === 'b' ? SHORT[k] : label)));
  const side = h('aside', { class: 'sidebar panel' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('check', 20)), h('span', {}, 'Мой планировщик')),
    h('nav', { class: 'nav', 'aria-label': 'Разделы' }, navLinks('s')), h('div', { class: 'spacer' }),
    h('div', { class: 'user-box' }, h('div', {}, state.settings.name || state.user.email), h('button', { class: 'btn sm ghost', type: 'button', style: 'padding:0;min-height:28px', onclick: logout }, 'Выйти')));
  const bottom = h('nav', { class: 'bottom-nav panel', 'aria-label': 'Разделы' }, navLinks('b'));
  const fab = h('button', { class: 'fab', id: 'fab', type: 'button', 'aria-label': 'Открыть помощника', onclick: () => (state.chatOpen ? closeChat() : openChat()) }, icon('sparkle', 22), 'Помощник');
  clear(app).append(state.user.is_demo && h('div', { class: 'demo-banner', role: 'note' }, 'Демо-режим: здесь тестовые данные, они не связаны с вашим аккаунтом. ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); logout(); } }, 'Выйти из демо')),
    h('div', { class: 'shell' }, side, mainEl), bottom, fab);
}

async function logout() { mainEl = null; try { await POST('/auth/logout'); } catch { /* ignore */ } closeChat(); state.user = null; boot(); }

let refreshTimer;
bus.addEventListener('data-changed', () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => mainEl && renderInPlace().catch(() => {}), 50); });
window.addEventListener('hashchange', () => { if (mainEl) { renderView(); mainEl.focus({ preventScroll: true }); window.scrollTo(0, 0); } });
window.addEventListener('planner:unauth', () => { if (state.user) { state.user = null; mainEl = null; closeChat(); boot(); toast('Сессия истекла. Войдите снова.', { error: true }); } });
document.addEventListener('planner:logout', logout);
document.addEventListener('planner:settings', () => { shell(); renderView(); });

/* ---------- вход ---------- */
function authScreen(info) {
  let tab = info.registration_open && !info.has_users ? 'register' : 'login';
  const box = h('div', { class: 'card' });
  const draw = () => {
    const err = errBox();
    const email = h('input', { type: 'email', name: 'email', autocomplete: 'username', required: true });
    const pw = h('input', { type: 'password', name: 'password', autocomplete: tab === 'login' ? 'current-password' : 'new-password', required: true });
    clear(box).append(
      h('div', { class: 'brand', style: 'padding:0 0 12px' }, h('div', { class: 'logo' }, icon('check', 20)), h('span', {}, 'Мой планировщик')),
      info.registration_open && h('div', { class: 'tabs', role: 'tablist' }, [['login', 'Вход'], ['register', 'Создать аккаунт']].map(([k, l]) => h('button', { class: 'chip', type: 'button', role: 'tab', 'aria-pressed': String(tab === k), onclick: () => { tab = k; draw(); } }, l))),
      h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        if (!email.value || !pw.value) { err.className = 'msg err'; err.textContent = 'Введите email и пароль'; return; }
        submitting(e.submitter, err, async () => { await POST(tab === 'login' ? '/auth/login' : '/auth/register', { email: email.value, password: pw.value }); boot(); }, tab === 'login' ? 'Входим…' : 'Создаём…');
      } }, h('h1', { style: 'font-size:1.4rem' }, tab === 'login' ? 'Вход' : 'Создать аккаунт'),
      field('Email', email), field(tab === 'login' ? 'Пароль' : 'Пароль (не короче 10 символов)', pw), err,
      h('button', { class: 'btn primary', type: 'submit' }, tab === 'login' ? 'Войти' : 'Создать аккаунт')),
      !info.registration_open && h('p', { class: 'small muted', style: 'margin-top:12px' }, 'Новые аккаунты закрыты: это личный сайт.'),
      info.demo_enabled && h('div', { style: 'margin-top:16px;border-top:1px solid var(--line);padding-top:14px' },
        h('p', { class: 'small muted' }, 'Хотите просто посмотреть? Деморежим использует тестовые данные и не затрагивает ваши.'),
        h('button', { class: 'btn', type: 'button', style: 'margin-top:8px', onclick: (e) => submitting(e.currentTarget, null, async () => { await POST('/auth/demo'); boot(); }, 'Открываем…') }, 'Открыть демо')));
    email.focus();
  };
  draw();
  clear(app).append(h('div', { class: 'auth' }, box));
}

function onboarding() {
  modal('Добро пожаловать!', (close) => {
    const err = errBox();
    const f = h('form', { class: 'form-grid', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      submitting(e.submitter, err, async () => {
        state.settings = await PUT('/settings', { name: f.elements.name.value, timezone: f.elements.tz.value, work_start: f.elements.ws.value, work_end: f.elements.we.value, preferences: f.elements.pref.value, onboarded: true });
        close(); shell(); renderView(); toast('Готово! Можно начинать.');
      });
    } },
      h('p', { class: 'full muted' }, 'Несколько вопросов, чтобы помощник планировал под вас. Всё можно изменить позже в настройках.'),
      field('Как к вам обращаться?', h('input', { type: 'text', name: 'name', maxlength: 60, autocomplete: 'given-name', value: state.settings.name }), 'full'),
      field('Часовой пояс', h('select', { name: 'tz' }, [['Europe/Moscow', 'Москва (Europe/Moscow)'], ['Europe/Kaliningrad', 'Калининград'], ['Europe/Samara', 'Самара'], ['Asia/Yekaterinburg', 'Екатеринбург'], ['Asia/Novosibirsk', 'Новосибирск'], ['Asia/Vladivostok', 'Владивосток']].map(([v, l]) => h('option', { value: v, selected: v === state.settings.timezone }, l))), 'full'),
      field('Рабочий день: начало', h('input', { type: 'time', name: 'ws', value: state.settings.work_start })), field('Рабочий день: конец', h('input', { type: 'time', name: 'we', value: state.settings.work_end })),
      field('Предпочтения (необязательно)', h('textarea', { name: 'pref', maxlength: 2000, placeholder: 'Например: утром лучше учиться, вечером — отдых, не планировать дела после 21:00.' }), 'full'),
      h('div', { class: 'full' }, err), h('div', { class: 'full' }, h('button', { class: 'btn primary', type: 'submit' }, 'Начать')));
    return f;
  });
}

async function boot() {
  try {
    const me = await GET('/me');
    state.user = me; state.settings = me.settings;
    shell();
    if (!location.hash) location.hash = '#/today';
    await renderView();
    if (!me.is_demo && !me.settings.onboarded) onboarding();
  } catch (e) {
    if (e.status === 401) {
      const info = await GET('/auth/state').catch(() => ({ registration_open: false, demo_enabled: false }));
      authScreen(info);
    } else clear(app).append(h('div', { class: 'auth' }, h('div', { class: 'card' }, h('h1', {}, 'Нет связи с сервером'), h('p', {}, e.message), h('button', { class: 'btn', onclick: boot }, 'Повторить'))));
  }
}
boot();
