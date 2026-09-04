#!/usr/bin/env node
/**
 * 滋补店抽奖网站 · 全功能端到端测试脚本
 *
 * 用法：
 *   node test/run-tests.mjs                       # 完整跑：只读巡检 + 端到端真实抽 1~5 等奖(结束自动清理)
 *   node test/run-tests.mjs --readonly            # 只做只读巡检(页面/公开GET/验证码/admin鉴权)，不写库
 *   node test/run-tests.mjs --no-cleanup          # 端到端后【保留】测试活动/中奖，便于人工去后台核对
 *   node test/run-tests.mjs --base=http://localhost:3001 --admin-password=admin123456
 *
 * 前提：服务已在 BASE 运行(默认 http://localhost:3001)。
 * 数据安全：端到端使用标题形如【自动化测试-xxxxxx】的隔离活动，结束默认按活动 id 级联删除，
 *           不影响正式活动(id=1)的库存与记录。
 */
import { execSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* ==================== 配置 ==================== */
const args = process.argv.slice(2);
const arg = (name, dft) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : (process.env[name.toUpperCase().replace(/-/g, "_")] || dft);
};
const BASE = (arg("base", "http://localhost:3001")).replace(/\/$/, "");
const ADMIN_PASSWORD = arg("admin-password", "admin123456");
const READONLY = args.includes("--readonly");
const NO_CLEANUP = args.includes("--no-cleanup");

/* ==================== 输出与断言 ==================== */
let passCount = 0, failCount = 0;
const fails = [];
const c = {
  ok: "\x1b[32m✓\x1b[0m", bad: "\x1b[31m✗\x1b[0m",
  grn: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`,
  yel: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
function check(name, cond, extra = "") {
  if (cond) { passCount++; console.log(`  ${c.ok} ${name}${extra ? c.dim(" — " + extra) : ""}`); }
  else { failCount++; fails.push(name); console.log(`  ${c.bad} ${c.red(name)}${extra ? c.dim(" — " + extra) : ""}`); }
}
function section(t) { console.log(`\n${c.bold("■ " + t)}`); }
const AUTH = { authorization: `Bearer ${ADMIN_PASSWORD}` };
async function api(method, path, { json, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

/* ==================== 工具 ==================== */
async function getCaptcha() {
  const res = await fetch(BASE + "/api/captcha", { method: "GET" });
  if (!res.ok) throw new Error("captcha GET 失败 " + res.status);
  const svg = await res.text();
  const salt = res.headers.get("x-captcha-salt");
  const sign = res.headers.get("x-captcha-sign");
  const chars = [...svg.matchAll(/<text[^>]*>(\d)<\/text>/g)].map((m) => m[1]);
  if (chars.length !== 4) throw new Error("未能从验证码SVG解析出4位数字");
  return { answer: chars.join(""), salt, sign };
}
function dbConn() {
  const url = process.env.DATABASE_URL || "";
  const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+):?(\d*)\/(\w+)/);
  if (m) return { user: m[1], pass: m[2], host: m[3], port: m[4] || "5432", db: m[5] };
  return { user: "postgres", pass: "Znj00000000", host: "localhost", port: "5432", db: "luckydraw" };
}
/** 用 UTF-8 临时 .sql 文件执行(规避 Windows 命令行中文编码问题)。SQL 里的字符串建议尽量 ASCII。 */
function sqlExec(sql) {
  const { user, pass, host, port, db } = dbConn();
  const psql = process.env.PSQL || "D:/PostgreSQL/bin/psql.exe";
  const __dir = dirname(fileURLToPath(import.meta.url));
  const file = join(__dir, "_tmp_sql.sql");
  try {
    writeFileSync(file, sql, "utf8");
    execSync(
      `"${psql}" -h ${host} -p ${port} -U ${user} -d ${db} -v ON_ERROR_STOP=1 -f "${file}"`,
      { env: { ...process.env, PGPASSWORD: pass, PGCLIENTENCODING: "UTF8" }, stdio: ["ignore", "pipe", "pipe"] }
    );
    return true;
  } catch (e) {
    return String((e.stderr || e.message || "").toString()).slice(0, 240);
  } finally {
    try { rmSync(file, { force: true }); } catch {}
  }
}
async function adminCreateActivity(payload) {
  const r = await api("POST", "/api/admin/activity", { json: payload, headers: AUTH });
  if (!r.ok || !r.data?.success) throw new Error("admin 建活动失败: " + JSON.stringify(r.data).slice(0, 240));
  return r.data.data;
}

/* ==================================================
   1) 只读巡检
   ================================================== */
section("1. 页面可访问性");
for (const p of ["/", "/winners", "/admin", "/admin/login"]) {
  const r = await api("GET", p);
  check(`页面 ${p} → 200`, r.status === 200, `HTTP ${r.status}`);
}

section("2. 公开 GET 接口");
{
  const a = await api("GET", "/api/activity");
  check("GET /api/activity → success+结构", a.ok && a.data?.success && a.data?.data?.id,
    a.data?.success ? `id=${a.data.data.id}, 奖品=${a.data.data.prizes?.length}, 参与=${a.data.data.entryCount}` : JSON.stringify(a.data).slice(0, 90));
  const actId = a.data?.data?.id ?? 1;
  const wq = await api("GET", `/api/winners?activityId=${actId}`);
  check("GET /api/winners → 200 或 404(空公示)", wq.status === 200 || wq.status === 404, `HTTP ${wq.status}`);
}

section("3. 验证码");
try {
  const cp = await getCaptcha();
  check("GET /api/captcha → 解析4位数字+salt+sign", /^\d{4}$/.test(cp.answer) && !!cp.salt && !!cp.sign, `answer=${cp.answer}`);
} catch (e) { check("GET /api/captcha → 解析4位数字+salt+sign", false, String(e.message)); }

section("4. admin 鉴权边界");
{
  const noAuth = await api("GET", "/api/admin/stats");
  check("admin/stats 无密码 → 401", noAuth.status === 401, `HTTP ${noAuth.status}`);
  const bad = await api("GET", "/api/admin/stats", { headers: { authorization: "Bearer wrong-password" } });
  check("admin/stats 错误密码 → 401", bad.status === 401, `HTTP ${bad.status}`);
  const good = await api("GET", "/api/admin/stats", { headers: AUTH });
  check("admin/stats 正确密码 → 200", good.ok && good.data?.success, `HTTP ${good.status}`);
  const lgBad = await api("POST", "/api/admin/login", { json: { password: "wrong" } });
  check("admin/login 错误密码 → 401", lgBad.status === 401, `HTTP ${lgBad.status}`);
  const lgOk = await api("POST", "/api/admin/login", { json: { password: ADMIN_PASSWORD } });
  check("admin/login 正确密码 → 200+token", lgOk.ok && !!lgOk.data?.data?.token, `HTTP ${lgOk.status}`);
  const actList = await api("GET", "/api/admin/activity", { headers: AUTH });
  check("admin/activity 列表 → 200", actList.ok && Array.isArray(actList.data?.data), `HTTP ${actList.status}`);
  const en = await api("GET", "/api/admin/entries", { headers: AUTH });
  check("admin/entries 缺 activityId → 400", en.status === 400, `HTTP ${en.status}`);
  const wn = await api("GET", "/api/admin/winners", { headers: AUTH });
  check("admin/winners 缺 activityId → 400", wn.status === 400, `HTTP ${wn.status}`);
}

/* ==================== 汇总 ==================== */
function finish() {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`${c.grn(`通过 ${passCount}`)}   ${c.red(`失败 ${failCount}`)}   ${c.dim(`BASE=${BASE}`)}${READONLY ? c.dim(" [只读]") : ""}`);
  if (fails.length) { console.log(c.red("\n失败项:")); fails.forEach((f) => console.log(c.red("  · " + f))); process.exit(1); }
  console.log(c.grn("\n全部通过 ✓"));
}

if (READONLY) { finish(); }
else { await e2eDraw(); finish(); }

/* ==================================================
   2) 端到端：逐档真实抽中 1~5 等奖
   ================================================== */
async function e2eDraw() {
  const runId = Date.now().toString().slice(-6);
  const createdActivityIds = [];
  let seq = 1;

  // 单奖品活动 ⇒ available 仅一项 ⇒ 抽奖必中该档(确定性)。注意其 order 恒为 1(见下方说明)。
  const tiers = [
    { order: 1, name: "一等奖测试礼盒", type: "PHYSICAL", stock: 5 },
    { order: 2, name: "二等奖测试参片", type: "PHYSICAL", stock: 5 },
    { order: 3, name: "三等奖测试燕窝粥", type: "PHYSICAL", stock: 5 },
    { order: 4, name: "四等奖测试汤包", type: "PHYSICAL", stock: 5 },
    { order: 5, name: "五等奖测试代金券", type: "COUPON", stock: 30 },
  ];
  section("5. 端到端真实抽奖(隔离活动逐档抽中 1~5 等奖)");
  try {
    for (const tier of tiers) {
      const act = await adminCreateActivity({
        title: `【自动化测试-${runId}】${tier.name}`,
        description: "全功能自动化测试自动创建，结束自动清理",
        status: "ACTIVE",
        prizes: [{ name: tier.name, icon: null, stock: tier.stock, probability: 10, type: tier.type }],
      });
      createdActivityIds.push(act.id);
      console.log(`  ${c.dim(`→ 建活动 #${act.id} 单奖品「${tier.name}」stock=${tier.stock}`)}`);
      const phone = `199${String(seq++).padStart(8, "0")}`;
      const { answer, salt, sign } = await getCaptcha();
      const r = await api("POST", "/api/activity", { json: { name: "自动化测试用户", phone, captcha: answer, captchaSalt: salt, captchaSign: sign } });
      const d = r.data;
      const won = r.ok && d?.success && d?.data?.won === true;
      check(`${tier.name} 真实抽中`, won && d?.data?.prizeName === tier.name, won ? `prizeName=${d.data.prizeName}` : `${r.status} ${JSON.stringify(d).slice(0, 150)}`);
      if (!won) continue;
      if (tier.type === "PHYSICAL") {
        const sa = await api("POST", "/api/submit-address", { json: { entryId: d.data.id, address: "测试省测试市测试区 自动化地址" + tier.order + "号", name: "自动化测试用户", phone } });
        check(`${tier.name} 提交收货地址 → 成功`, sa.ok && sa.data?.success, `HTTP ${sa.status}`);
      }
      const cw = await api("POST", "/api/check-winner", { json: { phone, activityId: act.id } });
      const cwOk = cw.ok && cw.data?.success;
      check(`${tier.name} 手机号反查(check-winner)`, cwOk, cwOk ? (cw.data.data.won ? "已中奖" : "未中") : `HTTP ${cw.status}`);
    }

    section("6. 后台联动(admin 读测试活动)");
    {
      const firstId = createdActivityIds[0];
      if (firstId) {
        const wn = await api("GET", `/api/admin/winners?activityId=${firstId}`, { headers: AUTH });
        check("admin/winners 返回测试活动中奖名单", wn.ok && Array.isArray(wn.data?.data?.list), `HTTP ${wn.status}`);
        const en = await api("GET", `/api/admin/entries?activityId=${firstId}`, { headers: AUTH });
        check("admin/entries 返回参与名单+分页", en.ok && typeof en.data?.data?.total === "number", `HTTP ${en.status}`);
      }
      const stats = await api("GET", "/api/admin/stats", { headers: AUTH });
      check("admin/stats 概览计数", stats.ok && typeof stats.data?.data?.activityCount === "number", `HTTP ${stats.status}`);
    }

  } catch (err) {
    check("端到端整体无异常", false, String(err?.message || err));
  } finally {
    if (NO_CLEANUP) {
      console.log(c.yel(`\n(--no-cleanup) 已保留测试数据。活动ID=${createdActivityIds.join(",")} 及其参与/中奖记录保留，可去后台核对。`));
    } else {
      // 按数字活动 id 删除(不含中文，规避编码问题)，级联清掉奖品/参与/中奖
      const idList = createdActivityIds.join(",");
      const res = sqlExec(idList ? `DELETE FROM "Activity" WHERE id IN (${idList});` : "SELECT 1;");
      check("清理：级联删除全部自动化测试活动(含奖品/参与/中奖)", res === true, res === true ? `活动 #${idList}` : String(res));
    }
  }
}
