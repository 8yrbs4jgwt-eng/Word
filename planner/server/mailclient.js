// Чтение почты Mail.ru по IMAP (imap.mail.ru:993, TLS). Подключение в режиме «только чтение» (EXAMINE),
// письма запрашиваются через BODY.PEEK — флаги «прочитано» в ящике не меняются.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { htmlToText } from './extract.js';

export const IMAP_HOST = 'imap.mail.ru';
export const MAIL_DOMAINS = ['mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'internet.ru'];
export const MAX_MESSAGES = 200;

export class MailError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function explainImapError(e) {
  if (e instanceof MailError) return e;
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|Invalid credentials/i.test(`${e?.responseText || ''} ${e?.message || ''}`)) {
    return new MailError('auth', 'Mail.ru не принял вход. Проверьте: (1) используется пароль для внешнего приложения, а не обычный пароль от почты; (2) при создании пароля выбран доступ «Протокол IMAP»; (3) на вашем ящике доступ для внешних программ не ограничен — с 2026 года Mail.ru тестирует платный доступ по IMAP (подписка «Пространство Mail»).');
  }
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(e?.code)) {
    return new MailError('network', 'Не удалось связаться с imap.mail.ru. Проверьте интернет-соединение и попробуйте ещё раз.');
  }
  return new MailError('unknown', `Не удалось прочитать почту (${e?.code || e?.name || 'ошибка'}). Попробуйте позже.`);
}

function makeClient(user, pass) {
  const c = new ImapFlow({ host: IMAP_HOST, port: 993, secure: true, auth: { user, pass }, logger: false, socketTimeout: 60000 });
  c.on('error', () => {}); // ошибки приходят через промисы; без обработчика процесс бы упал
  return c;
}

export async function verifyLogin(user, pass) {
  const c = makeClient(user, pass);
  try {
    await c.connect();
    const lock = await c.getMailboxLock('INBOX', { readOnly: true });
    lock.release();
  } catch (e) { throw explainImapError(e); }
  finally { try { await c.logout(); } catch { /* ignore */ } }
}

/** Возвращает массив разобранных писем за период (без изменения состояния ящика). */
export async function fetchMessages(user, pass, sinceDate /* Date */) {
  const c = makeClient(user, pass);
  const result = [];
  try {
    await c.connect();
    const lock = await c.getMailboxLock('INBOX', { readOnly: true });
    try {
      const uidvalidity = String(c.mailbox.uidValidity);
      let uids = await c.search({ since: sinceDate }, { uid: true });
      uids = (uids || []).sort((a, b) => a - b).slice(-MAX_MESSAGES);
      const raw = [];
      if (uids.length) {
        for await (const m of c.fetch(uids, { uid: true, internalDate: true, source: { maxLength: 1500000 } }, { uid: true })) {
          raw.push({ uid: m.uid, internalDate: m.internalDate, source: m.source });
        }
      }
      for (const m of raw) {
        const p = await simpleParser(m.source);
        const date = (p.date || m.internalDate || new Date());
        if (date < sinceDate) continue;
        const from = p.from?.value?.[0] || {};
        const text = (p.text && p.text.trim()) || htmlToText(p.html || '');
        result.push({
          uidvalidity, uid: m.uid,
          messageId: p.messageId || null,
          fromName: from.name || '', fromAddr: from.address || '',
          toAddr: (p.to?.value || []).map((x) => x.address).filter(Boolean).join(', '),
          subject: p.subject || '(без темы)',
          date: new Date(date).toISOString(),
          text: text.slice(0, 200000),
          attachments: (p.attachments || []).map((a) => ({ name: a.filename || 'вложение', size: a.size })),
        });
      }
    } finally { lock.release(); }
  } catch (e) { throw explainImapError(e); }
  finally { try { await c.logout(); } catch { /* ignore */ } }
  return result;
}
