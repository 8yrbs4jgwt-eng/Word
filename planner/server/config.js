import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = root;
export const DATA_DIR = process.env.DATA_DIR || path.join(root, 'data');
export const PUBLIC_DIR = path.join(root, 'public');
export const DEFAULT_TZ = 'Europe/Moscow';
export const DEFAULT_SETTINGS = {
  name: '',
  timezone: DEFAULT_TZ,
  work_start: '09:00',
  work_end: '19:00',
  break_min: 10,
  preferences: '',
  mail_period_days: 14,
  ai_mail_consent_at: null,
  onboarded: false,
};
