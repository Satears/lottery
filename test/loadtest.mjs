// 零依赖并发压测脚本
// 用法: node test/loadtest.mjs [--url http://localhost:3001] [--concurrency N] [--requests M] [--target T]
// target: captcha | activity-get | winners | homepage
import { performance } from "perf_hooks";

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const BASE = getArg("--url", "http://localhost:3001");
const CONCURRENCY = parseInt(getArg("--concurrency", "50"), 10);
const REQUESTS = parseInt(getArg("--requests", "500"), 10);
const TARGET = getArg("--target", "captcha");

const PATHS = {
  captcha: "/api/captcha",
  "activity-get": "/api/activity",
  winners: "/api/winners",
  homepage: "/",
};

const PATH = PATHS[TARGET] || PATHS.captcha;

function fmt(n) {
  return n.toFixed(1);
}

async function singleRequest(i) {
  const start = performance.now();
  try {
    const r = await fetch(BASE + PATH, {
      headers: { "Cache-Control": "no-cache" },
    });
    const dur = performance.now() - start;
    return { ok: r.status >= 200 && r.status < 400, status: r.status, dur };
  } catch (e) {
    const dur = performance.now() - start;
    return { ok: false, status: 0, dur, err: e.message };
  }
}

async function main() {
  console.log(`\n=== 压测目标: ${BASE}${PATH} ===`);
  console.log(`并发数: ${CONCURRENCY}  总请求: ${REQUESTS}\n`);

  const latencies = [];
  const statusCount = {};
  let errors = 0;
  let done = 0;
  let idx = 0;

  const startAll = performance.now();

  async function worker() {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= REQUESTS) break;
      const r = await singleRequest(myIdx);
      latencies.push(r.dur);
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
      if (!r.ok) errors++;
      done++;
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  const totalDur = performance.now() - startAll;
  latencies.sort((a, b) => a - b);

  const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p90 = latencies[Math.floor(latencies.length * 0.9)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];
  const min = latencies[0];
  const throughput = (REQUESTS / totalDur) * 1000;

  console.log(`完成请求: ${REQUESTS}  错误: ${errors}`);
  console.log(`总耗时: ${fmt(totalDur)} ms`);
  console.log(`吞吐量: ${fmt(throughput)} req/s`);
  console.log(`\n--- 延迟分布 (ms) ---`);
  console.log(`  min: ${fmt(min)}   avg: ${fmt(avg)}`);
  console.log(`  p50: ${fmt(p50)}   p90: ${fmt(p90)}`);
  console.log(`  p95: ${fmt(p95)}   p99: ${fmt(p99)}   max: ${fmt(max)}`);
  console.log(`\n--- 状态码分布 ---`);
  for (const [code, count] of Object.entries(statusCount)) {
    console.log(`  ${code}: ${count}`);
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
