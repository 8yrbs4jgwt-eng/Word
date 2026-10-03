// Мини-помощники для построения страницы. Весь текст вставляется через textContent — это защищает от XSS (в том числе из писем).
const SVG = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="4"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  tasks: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M8 12.5l3 3 5-6"/>',
  notes: '<path d="M6 3.5h9l4 4V18a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4 18V6a2.5 2.5 0 0 1 2-2.5z"/><path d="M14.5 3.5V8H19M8 12h8M8 16h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="4"/><path d="M4 7.5l8 6 8-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
};
// Нативный append выводил бы false/null как текст — отфильтровываем, чтобы работали условные блоки.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function (...c) { return nativeAppend.apply(this, c.filter((x) => x !== false && x != null)); };

export function icon(name, size = 22) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.6');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.innerHTML = SVG[name] || ''; // только наши собственные константы
  return s;
}

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}
export const clear = (el) => { el.replaceChildren(); return el; };

export function toast(text, { error = false, action, onAction, ms = 5000 } = {}) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast' + (error ? ' err' : '') }, h('span', {}, text));
  if (action) t.append(h('button', { type: 'button', onclick: () => { t.remove(); onAction?.(); } }, action));
  box.append(t);
  setTimeout(() => t.remove(), error ? 8000 : ms);
}

/** Модальное окно. build(close) возвращает содержимое. Закрывается по Esc и клику на фон. */
export function modal(title, build, { wide } = {}) {
  const prev = document.activeElement;
  const overlay = h('div', { class: 'overlay' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? 'width:min(820px,100%)' : null },
    h('h2', {}, title), build(close));
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  box.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select, button')?.focus();
  return close;
}
export function confirmBox(title, text, okLabel = 'Подтвердить', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const close = modal(title, (close) => h('div', {}, h('p', {}, text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => { fin(false); close(); } }, 'Отмена'),
        h('button', { class: 'btn primary' + (danger ? ' danger' : ''), type: 'button', onclick: () => { fin(true); close(); } }, okLabel))));
    new MutationObserver((_, o) => { if (!document.querySelector('.overlay')) { fin(false); o.disconnect(); } }).observe(document.body, { childList: true });
    return close;
  });
}

/** Кнопка отправки: блокируется, показывает загрузку, ошибки выводятся в errBox. */
export async function submitting(btn, errBox, fn, label = 'Сохраняем…') {
  const old = btn.textContent;
  btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), label);
  if (errBox) { errBox.className = 'msg hide'; errBox.textContent = ''; }
  try { return await fn(); }
  catch (e) {
    if (errBox) { errBox.className = 'msg err'; errBox.textContent = e.message; errBox.setAttribute('role', 'alert'); }
    else toast(e.message, { error: true });
    return undefined;
  } finally { btn.disabled = false; btn.textContent = old; }
}
export const errBox = () => h('div', { class: 'msg hide' });
export function field(label, input, cls = '') { return h('label', { class: 'field ' + cls }, label, input); }
export function msgBox(kind, ...c) { return h('div', { class: 'msg ' + kind }, ...c); }
