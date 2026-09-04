// 时间分桶延迟：检测周期性停顿(GC/清扫) vs 均匀尾部
import { performance } from "perf_hooks";
const args = process.argv.slice(2);
function getArg(n, d){const i=args.indexOf(n);return i>=0&&args[i+1]?args[i+1]:d;}
const BASE="http://localhost:3001";
const C=parseInt(getArg("--c","20"));
const REQ=parseInt(getArg("--n","400"));
const salt=(Date.now()%50000)+1;
// 预热一个验证码
const cap=await (async()=>{const r=await fetch(BASE+"/api/captcha");const svg=await r.text();return {answer:(svg.match(/<text[^>]*>([^<]+)<\/text>/g)||[]).map(s=>s.match(/>([^<]+)</)[1]).join(""),salt:r.headers.get("x-captcha-salt"),sign:r.headers.get("x-captcha-sign")};})();
let idx=0;
const started=Date.now();
const rows=[]; // {t,ms}
async function worker(){
  while(true){
    const i=idx++; if(i>=REQ)break;
    const t0=performance.now();
    const ip=`10.${(salt+i)%250+1}.${((salt+i)>>8)%250+1}.${((salt+i)>>16)%250+1}`;
    const phone=`139`+String(100000000+salt*1000+i).slice(-8);
    try{
      const r=await fetch(BASE+"/api/activity",{method:"POST",headers:{"Content-Type":"application/json","x-forwarded-for":ip},body:JSON.stringify({name:"t"+i,phone,captcha:cap.answer,captchaSalt:cap.salt,captchaSign:cap.sign})});
      rows.push({t:Date.now()-started,ms:performance.now()-t0,code:r.status});
    }catch(e){rows.push({t:Date.now()-started,ms:performance.now()-t0,code:0});}
  }
}
const ws=[];for(let i=0;i<C;i++)ws.push(worker());await Promise.all(ws);
rows.sort((a,b)=>a.ms-b.ms);
const pct=p=>rows[Math.min(rows.length-1,Math.floor(rows.length*p))].ms.toFixed(0);
console.log(`\n[POST /api/activity] concurrency=${C} total=${rows.length}`);
console.log(`p50=${pct(.5)} p90=${pct(.9)} p95=${pct(.95)} p99=${pct(.99)} max=${rows[rows.length-1].ms.toFixed(0)}`);
// 找出 >300ms 的慢请求及其发生时刻
const slow=rows.filter(r=>r.ms>300).map(r=>`t+${r.t}ms -> ${r.ms.toFixed(0)}ms (${r.code})`);
console.log(`\n>300ms count: ${slow.length}`);
if(slow.length) console.log("slow events:", slow.slice(0,40).join(" | "));
// 时间分桶（每500ms）
const buckets=new Map();
rows.forEach(r=>{const b=Math.floor(r.t/500)*500;if(!buckets.has(b))buckets.set(b,[]);buckets.get(b).push(r.ms);});
let out=[];[...buckets.keys()].sort((a,b)=>a-b).forEach(b=>{const a=buckets.get(b);a.sort((x,y)=>x-y);const mx=a[a.length-1];out.push(`${b}ms:p95=${a[Math.floor(a.length*.95)].toFixed(0)} max=${mx.toFixed(0)}`);});
console.log("\nper-500ms window (p95/max):");console.log(out.join("\n"));
