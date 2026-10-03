import express from 'express';
import path from 'node:path';
import { PUBLIC_DIR } from './config.js';
import { csrfGuard, cleanupSessions } from './auth.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import mailRoutes from './routes/mail.js';
import aiRoutes from './routes/ai.js';
import { HttpError } from './validate.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.COOKIE_SECURE === '1') app.set('trust proxy', 1); // за прокси хостинга (для верного IP в ограничении попыток)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use('/api', express.json({ limit: '200kb' }), csrfGuard);
  app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', authRoutes, dataRoutes, mailRoutes, aiRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
  app.use((req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
  // Ошибки: в лог попадает только метод, путь и сообщение — без тел запросов, писем и секретов.
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный запрос' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком большой запрос' });
    console.error(`[error] ${req.method} ${req.path}: ${err.code || err.name}`);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  cleanupSessions();
  createApp().listen(port, host, () => console.log(`Планировщик запущен: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
