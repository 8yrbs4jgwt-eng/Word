import { addDays, mondayOf } from "@/lib/time";

/** Сколько недель назад и вперёд от сегодня считаем «семестром» для списка дисциплин. */
export const TERM_WEEKS_BACK = 8;
export const TERM_WEEKS_AHEAD = 12;

/**
 * Окно семестра: с понедельника недели за 8 недель до сегодня по воскресенье недели через 12 недель.
 * Границы выровнены по неделям, поэтому ключ кэша меняется раз в неделю, а не каждый день.
 */
export function termWindow(today: string): { from: string; to: string } {
  return {
    from: mondayOf(addDays(today, -7 * TERM_WEEKS_BACK)),
    to: addDays(mondayOf(addDays(today, 7 * TERM_WEEKS_AHEAD)), 6),
  };
}
