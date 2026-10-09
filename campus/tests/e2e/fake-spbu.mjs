// Фейковый timetable.spbu.ru для e2e и локальной разработки без сети.
// Запуск: node tests/e2e/fake-spbu.mjs [порт]   →   SPBU_BASE_URL=http://localhost:4010/api/v1
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "fixtures");
const fx = (n) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), "utf8"));
const FIXTURE_MONDAY = "2026-10-05";
const day = 86400000;

const shiftIso = (iso, delta) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return new Date(d.getTime() + delta * day).toISOString().slice(0, 10) + iso.slice(10);
};

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const mondayMs = (d) => { const t = Date.parse(`${d}T00:00:00Z`); return t - ((new Date(t).getUTCDay() + 6) % 7) * day; };

/** Занятия за любой диапазон: фикстурная неделя повторяется по неделям. API СПбГУ тоже принимает любой диапазон. */
function events(from, to) {
  const days = [];
  const fixtureMon = Date.parse(`${FIXTURE_MONDAY}T00:00:00Z`);
  const thisMon = mondayMs(ymd(Date.now()));
  for (let mon = mondayMs(from); mon <= Date.parse(`${to}T00:00:00Z`); mon += 7 * day) {
    const delta = Math.round((mon - fixtureMon) / day);
    const raw = fx("events-week");
    for (const d of raw.Days) {
      d.Day = shiftIso(d.Day, delta);
      for (const e of d.DayStudyEvents) {
        e.Start = shiftIso(e.Start, delta);
        e.End = shiftIso(e.End, delta);
        // как в реальных данных (например, ГМУ): электив отмечен префиксом в названии, IsElective = false
        if (e.Subject.startsWith("Информатика")) e.Subject = `Электив. ${e.Subject}`;
      }
      days.push(d);
    }
    // редкое занятие: раз в несколько недель (через 6 недель от текущей) — как «Исследовательский семинар» у ГМУ
    if (mon === thisMon + 6 * 7 * day) {
      const proto = JSON.parse(JSON.stringify(raw.Days[0].DayStudyEvents[0]));
      proto.Subject = "Исследовательский семинар III, семинар";
      proto.Start = `${ymd(mon + 1 * day)}T10:00:00`;
      proto.End = `${ymd(mon + 1 * day)}T11:35:00`;
      days.push({ Day: `${ymd(mon + 1 * day)}T00:00:00`, DayString: "", DayStudyEvents: [proto] });
    }
  }
  const inRange = days.filter((d) => d.Day.slice(0, 10) >= from && d.Day.slice(0, 10) <= to);
  return { StudentGroupId: 0, Days: inRange };
}

const state = { fail: false };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const p = url.pathname.replace(/^\/api\/v1/, "");
  if (p === "/__fail") {
    state.fail = url.searchParams.get("on") === "1";
    return send(200, state);
  }
  if (state.fail) return send(503, { error: "down" });
  let m;
  if (p === "/study/divisions") return send(200, fx("divisions"));
  if ((m = /^\/study\/divisions\/([^/]+)\/programs\/levels$/.exec(p))) return send(200, fx("levels"));
  if ((m = /^\/programs\/(\d+)\/groups$/.exec(p))) return send(200, fx("groups"));
  if ((m = /^\/groups\/(\d+)\/events\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(p))) return send(200, events(m[2], m[3]));
  send(404, { error: "not found" });
});
server.listen(Number(process.argv[2] ?? 4010), () => console.log("fake spbu on", server.address().port));
