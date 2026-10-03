import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAuth, rateLimit } from '../auth.js';
import * as v from '../validate.js';
import { encrypt } from '../crypto.js';
import * as AI from '../ai.js';

const r = Router();
r.use('/ai', requireAuth);

r.get('/ai/status', (req, res) => {
  const k = AI.getApiKey(req.user);
  res.json({
    configured: !!k, key_source: k?.source || null, model: AI.MODEL(),
    demo: !!req.user.is_demo, mail_consent_at: req.settings.ai_mail_consent_at,
    mail_connected: !!get('SELECT 1 FROM mail_accounts WHERE user_id=?', req.user.id),
  });
});

r.put('/ai/key', (req, res) => {
  if (req.user.is_demo) throw new v.HttpError(403, 'В деморежиме ИИ недоступен');
  const key = req.body.key;
  if (typeof key !== 'string' || key.trim().length < 20 || key.length > 300 || /\s/.test(key.trim())) throw v.bad('Ключ выглядит неверно. Он начинается с «sk-ant-».');
  run(`INSERT INTO secrets(user_id,name,value_enc) VALUES(?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET value_enc=excluded.value_enc`, req.user.id, 'anthropic_key', encrypt(key.trim()));
  res.json({ ok: true });
});
r.delete('/ai/key', (req, res) => { run('DELETE FROM secrets WHERE user_id=? AND name=?', req.user.id, 'anthropic_key'); res.json({ ok: true }); });

r.post('/ai/mail-consent', (req, res) => {
  const s = { ...req.settings, ai_mail_consent_at: req.body.granted ? new Date().toISOString() : null };
  run('UPDATE users SET settings=? WHERE id=?', JSON.stringify(s), req.user.id);
  res.json({ mail_consent_at: s.ai_mail_consent_at });
});

r.get('/ai/history', (req, res) => {
  const msgs = all('SELECT * FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 40', req.user.id).reverse();
  const out = msgs.map((m) => {
    const p = m.proposal_id ? get('SELECT * FROM proposals WHERE id=? AND user_id=?', m.proposal_id, req.user.id) : null;
    return { id: m.id, role: m.role, content: m.content, proposal: p ? AI.proposalView(p) : null };
  });
  const last = get(`SELECT id,summary FROM proposals WHERE user_id=? AND status='applied' ORDER BY applied_at DESC, id DESC LIMIT 1`, req.user.id);
  res.json({ messages: out, undoable: last || null });
});
r.delete('/ai/history', (req, res) => { run('DELETE FROM chat_messages WHERE user_id=?', req.user.id); res.json({ ok: true }); });

r.post('/ai/chat', async (req, res) => {
  const k = AI.getApiKey(req.user);
  if (!k) throw new v.HttpError(503, 'ИИ не подключён', { code: 'ai_not_configured' });
  if (!rateLimit(`ai:${req.user.id}`, 30, 60 * 1000)) throw new v.HttpError(429, 'Слишком много запросов. Подождите минуту.');
  const message = v.str(req.body.message, 'Сообщение', { required: true, max: 4000 });
  let includeMail = !!req.body.include_mail;
  if (includeMail && !req.settings.ai_mail_consent_at) throw new v.HttpError(403, 'Сначала нужно согласие на передачу данных писем ИИ', { code: 'mail_consent_required' });
  if (includeMail && !get('SELECT 1 FROM mail_accounts WHERE user_id=?', req.user.id)) includeMail = false;

  const history = all('SELECT role,content FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 12', req.user.id).reverse();
  // Контекст формируется на сервере из реальных данных; история — только текст диалога.
  const { system } = AI.buildContext(req.user, req.settings, { includeMail });
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }];
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const out = await AI.callModel(k.key, system, messages);
  run('INSERT INTO chat_messages(user_id,role,content) VALUES(?,?,?)', req.user.id, 'user', message);
  let proposal = null;
  if (out.input && Array.isArray(out.input.items) && out.input.items.length) {
    const { items, dropped } = AI.sanitizeProposal(req.user.id, out.input);
    if (items.length) {
      const warnings = AI.previewConflicts(req.user.id, items);
      const pid = AI.saveProposal(req.user.id, String(out.input.summary || 'Предлагаемые изменения').slice(0, 300), items, { reasoning: String(out.input.reasoning || '').slice(0, 2000), warnings, dropped });
      proposal = AI.proposalView(get('SELECT * FROM proposals WHERE id=?', pid));
    } else if (dropped.length) out.text = `${out.text}\n\nНе удалось подготовить изменения: ${dropped.join('; ')}`.trim();
  }
  const reply = out.text || (proposal ? 'Вот что я предлагаю:' : 'Не получилось сформулировать ответ. Попробуйте переформулировать.');
  const info = run('INSERT INTO chat_messages(user_id,role,content,proposal_id) VALUES(?,?,?,?)', req.user.id, 'assistant', reply, proposal?.id ?? null);
  res.json({ id: Number(info.lastInsertRowid), reply, proposal });
});

r.post('/ai/proposals/:id/apply', (req, res) => {
  const n = AI.applyProposal(req.user.id, Number(req.params.id));
  res.json({ ok: true, applied: n });
});
r.post('/ai/proposals/:id/cancel', (req, res) => {
  const info = run(`UPDATE proposals SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'`, Number(req.params.id), req.user.id);
  if (!info.changes) throw new v.HttpError(404, 'Предложение не найдено');
  res.json({ ok: true });
});
r.post('/ai/undo', (req, res) => res.json({ ok: true, ...AI.undoLast(req.user.id) }));

export default r;
