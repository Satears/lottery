// 各公开 API 端点延迟基线测量（p50/p90/p95/p99）
// 用法: node test/latency-probe.mjs [--url http://localhost:3001] [--n 200]
import http from "node:http";

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const BASE = getArg("--url", "http://localhost:3001");
const N = parseInt(getArg("--n", "200"), 10);

const u = new URL(BASE);
const agent = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 50 });

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx].toFixed(1);
}

function hit(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const r = http.request(
      { hostname: u.hostname, port: u.port, path, method: opts.method || "GET", agent, headers: opts.headers || {}, timeout: 10000 },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const ms = Number(process.hrtime.bigint() - start) / 1e6;
          resolve({ code: res.statusCode, ms, body });
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

async function measure(label, path, opts) {
  const times = [];
  let codes = {};
  for (let i = 0; i < N; i++) {
    try {
      const r = await hit(path, opts);
      times.push(r.ms);
      codes[r.code] = (codes[r.code] || 0) + 1;
    } catch (e) {
      times.push(-1);
      codes["ERR"] = (codes["ERR"] || 0) + 1;
    }
  }
  const valid = times.filter((t) => t >= 0);
  const codeStr = Object.entries(codes).map(([k, v]) => `${k}x${v}`).join(" ");
  if (valid.length === 0) {
    console.log(`\n[${label}] ALL ERRORS (${codeStr})`);
    return;
  }
  console.log(
    `\n[${label}]  p50=${pct(valid, 50)}ms  p90=${pct(valid, 90)}ms  p95=${pct(valid, 95)}ms  p99=${pct(valid, 99)}ms  max=${Math.max(...valid).toFixed(1)}ms  (${codeStr})`
  );
}

async function main() {
  console.log(`Target: ${BASE}   N=${N} per endpoint\n`);
  // GET 活动（公开页轮询最频繁）
  await measure("GET /api/activity", "/api/activity");
  // 中奖公示（大屏轮询）
  await measure("GET /api/winners", "/api/winners");
  // 手机号查中奖
  await measure("GET /api/check-winner?phone=13800000000", "/api/check-winner?phone=13800000000");
  // 验证码生成
  await measure("GET /api/captcha", "/api/captcha");
  // 后台列表（代表性：参与名单第1页）
  await measure("GET /api/admin/entries?activityId=1&page=1", "/api/admin/entries?activityId=1&page=1", {
    headers: { cookie: "admin_token=dummy" },
  });
  agent.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
