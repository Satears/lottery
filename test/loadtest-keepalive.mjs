// 高保真 keep-alive 并发压测：用 http.Agent keepAlive 复用连接，测服务端真实吞吐上限
// 用法: node test/loadtest-keepalive.mjs [--url U] [--concurrency N] [--requests M] [--path P]
import http from "node:http";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const BASE = getArg("--url", "http://localhost:3001");
const CONCURRENCY = parseInt(getArg("--concurrency", "100"), 10);
const REQUESTS = parseInt(getArg("--requests", "2000"), 10);
const PATH = getArg("--path", "/api/activity");

const u = new URL(BASE);
const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY, maxFreeSockets: CONCURRENCY });

function oneReq(path) {
  return new Promise((resolve) => {
    const start = performance.now();
    const req = http.request(
      { host: u.hostname, port: u.port, path, method: "GET", agent, headers: { "Cache-Control": "no-cache" } },
      (res) => {
        let n = 0;
        res.on("data", (c) => (n += c.length));
        res.on("end", () => resolve({ status: res.statusCode, dur: performance.now() - start, bytes: n }));
      }
    );
    req.on("error", () => resolve({ status: 0, dur: performance.now() - start }));
    req.end();
  });
}

function fmt(n) { return n.toFixed(1); }

async function main() {
  console.log(`\n=== keep-alive 压测: ${BASE}${PATH} ===`);
  console.log(`并发连接: ${CONCURRENCY}  总请求: ${REQUESTS}\n`);
  const lat = [], statusCount = {};
  let errors = 0, idx = 0;
  const startAll = performance.now();
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= REQUESTS) break;
      const r = await oneReq(PATH);
      lat.push(r.dur);
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
      if (!(r.status >= 200 && r.status < 400)) errors++;
    }
  }
  const ws = [];
  for (let i = 0; i < CONCURRENCY; i++) ws.push(worker());
  await Promise.all(ws);
  const totalDur = performance.now() - startAll;
  lat.sort((a, b) => a - b);
  const avg = lat.reduce((s, x) => s + x, 0) / lat.length;
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
  const tput = (REQUESTS / totalDur) * 1000;
  console.log(`完成: ${REQUESTS}  错误: ${errors}`);
  console.log(`总耗时: ${fmt(totalDur)} ms  吞吐: ${fmt(tput)} req/s`);
  console.log(`延迟 avg:${fmt(avg)} p50:${fmt(pct(0.5))} p90:${fmt(pct(0.9))} p99:${fmt(pct(0.99))} max:${fmt(pct(1))}`);
  console.log(`状态码: ${JSON.stringify(statusCount)}`);
  agent.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
