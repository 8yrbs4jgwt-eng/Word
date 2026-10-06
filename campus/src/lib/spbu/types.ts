export type Division = { alias: string; name: string };
export type ProgramYear = { id: number; year: number };
export type Program = { name: string; years: ProgramYear[] };
export type ProgramLevel = { level: string; programs: Program[] };
export type Group = { id: number; name: string; form: string; profiles: string };

/** Пара из расписания. Время указано по Москве (так отдаёт timetable.spbu.ru). */
export type ClassEvent = {
  id: string;
  /** YYYY-MM-DD, Europe/Moscow */
  date: string;
  /** HH:mm, Europe/Moscow; null для событий на весь день */
  start: string | null;
  end: string | null;
  title: string;
  location: string;
  teacher: string;
  cancelled: boolean;
};

export type Cached<T> = {
  data: T;
  /** ISO-время последней удачной загрузки с timetable.spbu.ru */
  updatedAt: string;
  /** true, если сайт университета недоступен и отдан последний удачный ответ */
  stale: boolean;
};
