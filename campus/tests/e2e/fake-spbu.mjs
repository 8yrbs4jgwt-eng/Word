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

function events(from) {
  const delta = Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${FIXTURE_MONDAY}T00:00:00Z`)) / day);
  const raw = fx("events-week");
  for (const d of raw.Days) {
    d.Day = shiftIso(d.Day, delta);
    for (const e of d.DayStudyEvents) {
      e.Start = shiftIso(e.Start, delta);
      e.End = shiftIso(e.End, delta);
    }
  }
  return raw;
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
  if ((m = /^\/groups\/(\d+)\/events\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(p))) return send(200, events(m[2]));
  send(404, { error: "not found" });
});
server.listen(Number(process.argv[2] ?? 4010), () => console.log("fake spbu on", server.address().port));
