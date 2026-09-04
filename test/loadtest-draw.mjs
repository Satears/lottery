// 抽奖接口端到端压测（绕过验证码：用预生成的正确验证码 + 伪造 x-forwarded-for 模拟不同 IP）
// ⚠️ 警告：本脚本会【真实扣减奖品库存】并产生参与/中奖记录，切勿在生产环境运行！
//    如需压测，请使用独立测试数据库，压测后手工恢复 Prize.drawn 并清理 Entry/Winner。
// 用法: node test/loadtest-draw.mjs [--concurrency N] [--requests M]
import { performance } from "perf_hooks";

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const BASE = "http://localhost:3001";
const CONCURRENCY = parseInt(getArg("--concurrency", "20"), 10);
const REQUESTS = parseInt(getArg("--requests", "200"), 10);
// 本次运行的随机盐：让不同次运行的 IP/手机号互不重叠
const RUN_SALT = (Date.now() % 100000) + 1;

function parseSvgText(svg) {
  const m = svg.match(/<text[^>]*>([^<]+)<\/text>/g);
  if (!m) return "";
  return m.map((s) => s.match(/>([^<]+)</)[1]).join("");
}

// 获取一个合法验证码（一次性，用于所有请求，模拟"已识图"）
async function getCaptcha() {
  const r = await fetch(BASE + "/api/captcha");
  const svg = await r.text();
  return {
    answer: parseSvgText(svg),
    salt: r.headers.get("x-captcha-salt"),
    sign: r.headers.get("x-captcha-sign"),
  };
}

function fmt(n) {
  return n.toFixed(1);
}

async function main() {
  const cap = await getCaptcha();
  console.log(`\n=== 抽奖接口压测: POST ${BASE}/api/activity ===`);
  console.log(`并发数: ${CONCURRENCY}  总请求: ${REQUESTS}`);
  console.log(`验证码: ${cap.answer} (所有请求复用)\n`);

  const latencies = [];
  const statusCount = {};
  let errors = 0;
  let wonCount = 0;
  let idx = 0;

  const startAll = performance.now();

  async function worker() {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= REQUESTS) break;
      const start = performance.now();
      // 唯一 IP + 唯一手机号：绕过 IP 限流 5/60s 与手机号去重，纯测抽奖事务吞吐
      // salt 保证多次运行间 IP/手机号不重叠，避免上一轮限流/去重污染本轮
      const salt = RUN_SALT;
      const fakeIp = `10.${(salt + myIdx) % 250 + 1}.${((salt + myIdx) >> 8) % 250 + 1}.${((salt + myIdx) >> 16) % 250 + 1}`;
      const phone = `139` + String(100000000 + (salt * 1000 + myIdx)).slice(-8);
      try {
        const r = await fetch(BASE + "/api/activity", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": fakeIp,
          },
          body: JSON.stringify({
            name: "压测" + myIdx,
            phone,
            captcha: cap.answer,
            captchaSalt: cap.salt,
            captchaSign: cap.sign,
          }),
        });
        const dur = performance.now() - start;
        latencies.push(dur);
        statusCount[r.status] = (statusCount[r.status] || 0) + 1;
        if (r.status < 200 || r.status >= 400) errors++;
        const d = await r.json().catch(() => null);
        if (d && d.success && d.data && d.data.won) wonCount++;
      } catch (e) {
        const dur = performance.now() - start;
        latencies.push(dur);
        statusCount[0] = (statusCount[0] || 0) + 1;
        errors++;
      }
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
  const throughput = (REQUESTS / totalDur) * 1000;

  console.log(`完成请求: ${REQUESTS}  错误: ${errors}  中奖: ${wonCount}`);
  console.log(`总耗时: ${fmt(totalDur)} ms  吞吐量: ${fmt(throughput)} req/s`);
  console.log(`--- 延迟 (ms) ---`);
  console.log(`  avg: ${fmt(avg)}  p50: ${fmt(p50)}  p90: ${fmt(p90)}  p95: ${fmt(p95)}  p99: ${fmt(p99)}  max: ${fmt(max)}`);
  console.log(`--- 状态码 ---`);
  for (const [c, n] of Object.entries(statusCount)) console.log(`  ${c}: ${n}`);
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
