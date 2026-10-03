import { all, get, run, tx } from './db.js';
import { decrypt } from './crypto.js';
import { extractSuggestions } from './extract.js';
import { fetchMessages } from './mailclient.js';
import { nowLocal, addDays } from './dates.js';

const busy = new Set();

export function localDateOf(iso, tz) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Сохраняет письмо (если его ещё нет) и найденные в нём предложения. Возвращает true, если письмо новое. */
export function storeMessage(uid, m, tz) {
  const info = run(`INSERT OR IGNORE INTO emails(user_id,uidvalidity,uid,message_id,from_name,from_addr,to_addr,subject,date,body,attachments)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, uid, m.uidvalidity, m.uid, m.messageId, m.fromName, m.fromAddr, m.toAddr, m.subject, m.date, m.text, JSON.stringify(m.attachments || []));
  if (!info.changes) return false;
  const emailId = Number(info.lastInsertRowid);
  const sugg = extractSuggestions({
    subject: m.subject, body: m.text, refDate: localDateOf(m.date, tz), today: nowLocal(tz).slice(0, 10),
    messageKey: m.messageId || `${m.uidvalidity}:${m.uid}`,
  });
  for (const s of sugg) {
    // Если задача/событие по этой фразе уже создавались (например, после переподключения), повторно не предлагаем.
    const done = get('SELECT 1 FROM tasks WHERE user_id=? AND source_key=? UNION SELECT 1 FROM events WHERE user_id=? AND source_key=?', uid, s.source_key, uid, s.source_key);
    run(`INSERT OR IGNORE INTO mail_suggestions(user_id,email_id,kind,title,date,time,snippet,inferred,ambiguous,source_key,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`, uid, emailId, s.kind, s.title, s.date, s.time, s.snippet, s.inferred ? 1 : 0, s.ambiguous ? 1 : 0, s.source_key, done ? 'accepted' : 'pending');
  }
  return true;
}

/** Синхронизация: первый раз — за выбранный период, дальше — с последней успешной синхронизации (с запасом в 1 день). */
export async function syncMail(user, settings, { fetcher = fetchMessages } = {}) {
  const uid = user.id;
  const acc = get('SELECT * FROM mail_accounts WHERE user_id=?', uid);
  const secret = get('SELECT value_enc FROM secrets WHERE user_id=? AND name=?', uid, 'mail_password');
  if (!acc || !secret) { const e = new Error('Почта не подключена'); e.status = 400; throw e; }
  if (busy.has(uid)) { const e = new Error('Синхронизация уже идёт'); e.status = 409; throw e; }
  busy.add(uid);
  try {
    const days = acc.last_sync_at ? 1 : acc.period_days;
    const base = acc.last_sync_at ? new Date(acc.last_sync_at) : new Date();
    const since = new Date(base.getTime() - days * 864e5);
    since.setUTCHours(0, 0, 0, 0);
    let msgs;
    try {
      msgs = await fetcher(acc.email, decrypt(secret.value_enc), since);
    } catch (err) {
      run('UPDATE mail_accounts SET last_error=? WHERE user_id=?', err.message, uid);
      throw err;
    }
    let added = 0;
    tx(() => { for (const m of msgs) if (storeMessage(uid, m, settings.timezone)) added++; });
    run('UPDATE mail_accounts SET last_sync_at=?, last_error=NULL WHERE user_id=?', new Date().toISOString(), uid);
    return { fetched: msgs.length, added };
  } finally { busy.delete(uid); }
}

export const mailStatus = (uid) => {
  const a = get('SELECT email,period_days,last_sync_at,last_error FROM mail_accounts WHERE user_id=?', uid);
  const count = a ? get('SELECT COUNT(*) AS n FROM emails WHERE user_id=?', uid).n : 0;
  return a ? { connected: true, ...a, count, mailbox: 'imap.mail.ru' } : { connected: false };
};
export { all, addDays };
