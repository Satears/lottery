"use client";

import { useEffect, useState } from "react";

// 奖品 logo 通用渲染：icon 以 "/" 开头视为图片路径，否则视为 emoji
function PrizeIcon({ src, size = 48, className = "" }: { src: string; size?: number; className?: string }) {
  if (src && src.startsWith("/")) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`rounded-lg object-cover shadow-md shadow-black/30 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>{src}</span>;
}

interface Prize {
  id: number;
  name: string;
  icon: string;
  type: string;
  remaining: number;
}

interface Activity {
  id: number;
  title: string;
  description: string;
  prizes: Prize[];
  entryCount: number;
}

interface SpinResult {
  id: number;
  won: boolean;
  prizeId?: number;
  prizeOrder?: number; // 中奖档位 1~5，前端据此分级庆祝动画
  prizeName?: string;
  prizeIcon?: string;
  prizeType?: string;
  isPhysical?: boolean;
  alreadyParticipated?: boolean;
  sectors: { id: number; name: string; icon: string; index: number }[];
  winIndex: number;
  message: string;
}

// 转盘扇区配色（暖金色系，适配滋补店高端感）
export default function Home() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 表单状态
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // 验证码
  const [captcha, setCaptcha] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaSalt, setCaptchaSalt] = useState("");
  const [captchaSign, setCaptchaSign] = useState("");

  // 转盘状态
  const [phase, setPhase] = useState<"form" | "spinning" | "result">("form");
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const loadCaptcha = async () => {
    setCaptcha("");
    try {
      const r = await fetch("/api/captcha");
      if (r.ok) {
        const svg = await r.text();
        setCaptchaImg(svg);
        setCaptchaSalt(r.headers.get("X-Captcha-Salt") || "");
        setCaptchaSign(r.headers.get("X-Captcha-Sign") || "");
      }
    } catch {
      // 忽略
    }
  };

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) setActivity(d.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    loadCaptcha();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!name.trim()) {
      setMessage({ type: "error", text: "请填写您的姓名" });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setMessage({ type: "error", text: "请填写正确的手机号" });
      return;
    }
    if (!captcha.trim()) {
      setMessage({ type: "error", text: "请输入验证码" });
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          captcha: captcha.trim(),
          captchaSalt,
          captchaSign,
        }),
      });
      const d = await r.json();
      if (d.success) {
        const result = d.data as SpinResult;
        setSpinResult(result);
        setPhase("spinning");
        // 触发转盘动画
        setTimeout(() => startSpin(result), 300);
      } else {
        setMessage({ type: "error", text: d.message });
        loadCaptcha();
      }
    } catch {
      setMessage({ type: "error", text: "网络错误，请稍后重试" });
    } finally {
      setSubmitting(false);
    }
  };

  // 转盘动画：旋转到目标扇区
  const startSpin = (result: SpinResult) => {
    if (!result.sectors || result.sectors.length === 0) {
      setPhase("result");
      return;
    }
    setSpinning(true);
    const sectorCount = result.sectors.length;
    const sectorAngle = 360 / sectorCount;

    // 目标扇区索引（后端返回 winIndex；无则随机）
    const targetIdx = result.winIndex >= 0 ? result.winIndex : Math.floor(Math.random() * sectorCount);

    // 扇区 i 的中心（相对顶部 12 点方向，顺时针）角度：
    const targetCenter = targetIdx * sectorAngle + sectorAngle / 2;

    // 转盘顺时针旋转 rotation 度后，扇区 0 的中心从顶部偏移了 rotation 度。
    // 要让 targetCenter 对准顶部指针，需要顺时针旋转 360 - targetCenter（或等价 -targetCenter）。
    // 这里统一取一个"从当前角度出发、再多转几圈"的最终角度，保证顺时针且落在正确位置。
    const baseAngle = 360 - targetCenter; // 扇区对准顶部所需的净旋转角
    const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 圈
    // 归一化当前 rotation 到 [0,360)
    const current = ((rotation % 360) + 360) % 360;
    // 计算增量：从 current 顺时针转到 baseAngle（跨过至少 fullSpins 圈）
    let delta = baseAngle - current;
    if (delta < 0) delta += 360;
    const finalRotation = rotation + fullSpins * 360 + delta;

    setRotation(finalRotation);

    // 动画结束后显示结果
    setTimeout(() => {
      setSpinning(false);
      setPhase("result");
    }, 4500);
  };

  const reset = () => {
    setPhase("form");
    setSpinResult(null);
    setRotation(0);
    setName("");
    setPhone("");
    setCaptcha("");
    setMessage(null);
    loadCaptcha();
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
      </main>
    );
  }

  if (notFound || !activity) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white">
        <div className="text-center px-6">
          <div className="text-6xl mb-4">🎈</div>
          <h1 className="text-2xl font-semibold mb-2">暂无进行中的活动</h1>
          <p className="text-white/50">敬请期待，或联系活动主办方</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <Background />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-10 sm:py-14">
        {/* 顶部标题 */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-amber-200/80 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            活动进行中
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
            {activity.title}
          </h1>
          <p className="text-white/50 text-sm sm:text-base max-w-xl mx-auto">
            {activity.description}
          </p>
        </header>

        {/* 表单阶段 */}
        {phase === "form" && (
          <>
            {/* 奖品展示 */}
            <section className="mb-8">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {activity.prizes.map((prize) => (
                  <div
                    key={prize.id}
                    className="glass rounded-2xl p-3 sm:p-4 text-center transition-all duration-300 hover:scale-[1.03] hover:border-amber-400/40"
                  >
                    <div className="mb-1.5 flex justify-center">
                      <PrizeIcon src={prize.icon} size={64} />
                    </div>
                    <div className="text-xs sm:text-sm font-medium text-white leading-snug">
                      {prize.name}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="text-center mb-6">
              <p className="text-white/40 text-sm">
                已有{" "}
                <span className="text-amber-300 font-semibold">
                  {activity.entryCount.toLocaleString()}
                </span>{" "}
                人参与
              </p>
            </div>

            {/* 表单 */}
            <section className="glass-strong rounded-3xl p-6 sm:p-8 max-w-md mx-auto shadow-2xl shadow-amber-500/5">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm text-white/60 mb-2">姓名</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="请输入您的姓名"
                    maxLength={30}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">手机号</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="请输入您的手机号"
                    maxLength={11}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2">验证码</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value.replace(/\D/g, ""))}
                      placeholder="输入右侧验证码"
                      maxLength={4}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={loadCaptcha}
                      className="shrink-0 rounded-xl overflow-hidden border border-white/10 hover:border-amber-400/60 transition-colors"
                      title="点击刷新验证码"
                    >
                      {captchaImg ? (
                        <div
                          className="w-[120px] h-[44px] flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: captchaImg }}
                        />
                      ) : (
                        <div className="w-[120px] h-[44px] flex items-center justify-center text-white/30 text-xs">
                          加载中
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {message && (
                  <p className={`text-sm ${message.type === "success" ? "text-emerald-400" : "text-rose-400"}`}>
                    {message.text}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl py-3.5 font-semibold text-white bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 bg-[length:200%_auto] hover:bg-right transition-all duration-500 disabled:opacity-60 shadow-lg shadow-amber-500/20"
                >
                  {submitting ? "提交中..." : "🎡 立即抽奖"}
                </button>

                <p className="text-center text-xs text-white/30">
                  参与即表示同意活动规则，我们将严格保护您的隐私
                </p>
              </form>
            </section>
          </>
        )}

        {/* 转盘阶段 */}
        {phase === "spinning" && (
          <WheelPhase
            sectors={spinResult?.sectors || []}
            rotation={rotation}
            spinning={spinning}
          />
        )}

        {/* 结果阶段 */}
        {phase === "result" && spinResult && (
          <ResultPhase
            result={spinResult}
            onReset={reset}
          />
        )}

        {/* 底部 */}
        <footer className="text-center mt-10 space-y-3">
          <a
            href="/winners"
            className="inline-block text-sm text-amber-300/80 hover:text-amber-200 transition-colors"
          >
            🏆 查看中奖名单
          </a>
          <p className="text-white/20 text-xs">最终解释权归本店所有</p>
        </footer>
      </div>
    </main>
  );
}

// 转盘组件：豪华升级版 —— 大圆环跑马灯、渐变扇区、金边奖品、立体指针、GO 按钮
function WheelPhase({
  sectors,
  rotation,
  spinning,
}: {
  sectors: { id: number; name: string; icon: string; index: number }[];
  rotation: number;
  spinning: boolean;
}) {
  const sectorCount = sectors.length || 1;
  const sectorAngle = 360 / sectorCount;
  const size = 360; // 加大转盘尺寸
  const center = size / 2;
  const radius = size / 2 - 4;
  const ringWidth = 24; // 更宽灯环
  const outerSize = size + ringWidth * 2;
  const outerCenter = outerSize / 2;

  // 每个扇区 path
  const sectorPaths = sectors.map((_, i) => {
    const startAngle = (i * sectorAngle - 90) * (Math.PI / 180);
    const endAngle = ((i + 1) * sectorAngle - 90) * (Math.PI / 180);
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const largeArc = sectorAngle > 180 ? 1 : 0;
    return `M ${center} ${center} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  });

  // 外圈跑马灯灯泡
  const bulbCount = 24;
  const bulbs = Array.from({ length: bulbCount }, (_, i) => {
    const a = (i / bulbCount) * Math.PI * 2 - Math.PI / 2;
    const r = radius + ringWidth / 2;
    return {
      x: outerCenter + r * Math.cos(a),
      y: outerCenter + r * Math.sin(a),
      i,
    };
  });

  const labelRadius = radius * 0.64;

  return (
    <section className="flex flex-col items-center py-8">
      {/* 标题 */}
      <div className="text-center mb-6 px-4">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-shimmer-gold tracking-[0.28em] drop-shadow-[0_3px_12px_rgba(224,184,92,0.5)]">
          幸运大转盘
        </h2>
        <p className="text-amber-100/80 text-sm sm:text-base mt-3 tracking-wider">
          {spinning ? "转盘飞转中，好运即将降临…" : "点击 GO 开启好运，臻选好礼敬候你来！"}
        </p>
      </div>

      <div
        className={`relative ${spinning ? "wheel-spinning" : ""}`}
        style={{ width: outerSize, height: outerSize }}
      >
        {/* 外部辉光 */}
        <div
          className="absolute rounded-full pointer-events-none z-0"
          style={{
            inset: -44,
            background:
              "radial-gradient(circle, rgba(255,210,100,0.28) 0%, rgba(255,120,80,0.12) 40%, transparent 70%)",
          }}
        />

        {/* 指针 */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          style={{ top: -18 }}
        >
          <svg width="54" height="78" viewBox="0 0 54 78" className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
            <defs>
              <linearGradient id="ptrGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff4c7" />
                <stop offset="40%" stopColor="#f0c757" />
                <stop offset="100%" stopColor="#b07d1a" />
              </linearGradient>
              <linearGradient id="ptrGem" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff4d4d" />
                <stop offset="100%" stopColor="#a60b0b" />
              </linearGradient>
            </defs>
            <path
              d="M27 76 C12 56 5 44 5 32 A22 22 0 0 1 49 32 C49 44 42 56 27 76 Z"
              fill="url(#ptrGrad2)"
              stroke="#7a5a12"
              strokeWidth="2"
            />
            <circle cx="27" cy="28" r="10" fill="#fff8e1" stroke="#7a5a12" strokeWidth="1.6" />
            <circle cx="27" cy="28" r="6" fill="url(#ptrGem)" />
          </svg>
        </div>

        {/* 静止灯环 */}
        <svg
          width={outerSize}
          height={outerSize}
          viewBox={`0 0 ${outerSize} ${outerSize}`}
          className="absolute inset-0 z-20 block"
        >
          <defs>
            <linearGradient id="ringGrad2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7f1a22" />
              <stop offset="50%" stopColor="#4a0a10" />
              <stop offset="100%" stopColor="#7f1a22" />
            </linearGradient>
            <filter id="bulbGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            cx={outerCenter}
            cy={outerCenter}
            r={radius + ringWidth / 2}
            fill="none"
            stroke="url(#ringGrad2)"
            strokeWidth={ringWidth}
            className="drop-shadow-[0_0_15px_rgba(255,180,80,0.25)]"
          />
          <circle
            cx={outerCenter}
            cy={outerCenter}
            r={radius + 2}
            fill="none"
            stroke="#f5c45e"
            strokeWidth="3"
          />
          <circle
            cx={outerCenter}
            cy={outerCenter}
            r={radius + ringWidth - 2}
            fill="none"
            stroke="#f5c45e"
            strokeWidth="3"
          />
          <circle
            cx={outerCenter}
            cy={outerCenter}
            r={radius + ringWidth + 3}
            fill="none"
            stroke="rgba(245,196,94,0.35)"
            strokeWidth="1.5"
          />
          {bulbs.map((b) => (
            <g key={b.i}>
              <circle
                cx={b.x.toFixed(2)}
                cy={b.y.toFixed(2)}
                r="6"
                fill={b.i % 2 === 0 ? "#ffd87a" : "#ff4d4d"}
                filter={b.i % 2 === 0 ? "url(#bulbGlow)" : undefined}
                className="bulb"
                style={{ animationDelay: `${(b.i % 2) * 0.6}s` }}
              />
              <circle
                cx={b.x.toFixed(2)}
                cy={b.y.toFixed(2)}
                r="2.4"
                fill="#fff8e1"
                opacity="0.8"
              />
            </g>
          ))}
        </svg>

        {/* 旋转盘 */}
        <div
          className="absolute z-10"
          style={{
            width: size,
            height: size,
            left: ringWidth,
            top: ringWidth,
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${spinning ? 5200 : 0}ms cubic-bezier(0.08, 0.82, 0.12, 1)`,
            willChange: "transform",
            filter: spinning
              ? "drop-shadow(0 0 18px rgba(255,200,100,0.45))"
              : "drop-shadow(0 8px 24px rgba(0,0,0,0.35))",
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
            <defs>
              {sectors.map((_, i) => (
                <radialGradient
                  key={`secGrad-${i}`}
                  id={`secGrad-${i}`}
                  cx="50%"
                  cy="50%"
                  r="85%"
                >
                  {i % 2 === 0 ? (
                    <>
                      <stop offset="0%" stopColor="#c4202b" />
                      <stop offset="70%" stopColor="#9a121c" />
                      <stop offset="100%" stopColor="#7a0d16" />
                    </>
                  ) : (
                    <>
                      <stop offset="0%" stopColor="#fff6dc" />
                      <stop offset="60%" stopColor="#f2dc9e" />
                      <stop offset="100%" stopColor="#e0bf7a" />
                    </>
                  )}
                </radialGradient>
              ))}
              <radialGradient id="hubGrad2" cx="50%" cy="38%" r="75%">
                <stop offset="0%" stopColor="#fff6cc" />
                <stop offset="50%" stopColor="#f0c757" />
                <stop offset="100%" stopColor="#9e741e" />
              </radialGradient>
              <filter id="prizeShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
              </filter>
            </defs>

            <circle cx={center} cy={center} r={radius} fill="#580a12" />
            {sectorPaths.map((d, i) => (
              <path
                key={sectors[i].id}
                d={d}
                fill={`url(#secGrad-${i})`}
                stroke="#f5c45e"
                strokeWidth="1.8"
              />
            ))}

            {sectors.map((s, i) => {
              const midAngle =
                (i * sectorAngle + sectorAngle / 2 - 90) * (Math.PI / 180);
              const x = center + labelRadius * Math.cos(midAngle);
              const y = center + labelRadius * Math.sin(midAngle);
              const textRotation = i * sectorAngle + sectorAngle / 2;
              const darkSector = i % 2 === 1;
              const isImage = s.icon.startsWith("/");
              return (
                <g
                  key={s.id}
                  transform={`translate(${x.toFixed(2)}, ${y.toFixed(2)}) rotate(${textRotation.toFixed(2)})`}
                >
                  {isImage ? (
                    <>
                      <circle
                        cx="0"
                        cy="-30"
                        r="30"
                        fill="rgba(255,255,255,0.98)"
                        stroke="#e0b85c"
                        strokeWidth="2.2"
                        filter="url(#prizeShadow)"
                      />
                      <circle
                        cx="0"
                        cy="-30"
                        r="26"
                        fill="none"
                        stroke="rgba(176,125,30,0.35)"
                        strokeWidth="1"
                      />
                      <image
                        href={s.icon}
                        x="-22"
                        y="-52"
                        width="44"
                        height="44"
                        preserveAspectRatio="xMidYMid meet"
                      />
                    </>
                  ) : (
                    <text y="-20" textAnchor="middle" fontSize="28">
                      {s.icon}
                    </text>
                  )}
                  <text
                    y="18"
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="800"
                    fill={darkSector ? "#8a2411" : "#fff8e0"}
                    style={{
                      textShadow: darkSector
                        ? "none"
                        : "0 1px 4px rgba(0,0,0,0.55)",
                    }}
                  >
                    {s.name}
                  </text>
                </g>
              );
            })}

            <circle
              cx={center}
              cy={center}
              r="56"
              fill="url(#hubGrad2)"
              stroke="#7a5a12"
              strokeWidth="2.8"
              style={{ filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.45))" }}
            />
            <circle
              cx={center}
              cy={center}
              r="46"
              fill="none"
              stroke="rgba(122,90,18,0.55)"
              strokeWidth="1.4"
              strokeDasharray="4 4"
            />
            <text
              x={center}
              y={center + 11}
              textAnchor="middle"
              fontSize="34"
              className="pointer-events-none"
            >
              🎁
            </text>
          </svg>
        </div>
      </div>

      {/* 转动粒子 */}
      {spinning && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {Array.from({ length: 16 }).map((_, i) => (
            <span
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-amber-300/70"
              style={{
                left: `${20 + Math.random() * 60}%`,
                top: `${30 + Math.random() * 40}%`,
                animation: `sparkle 1.2s ease-in-out ${Math.random()}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// 结果组件
function ResultPhase({
  result,
  onReset,
}: {
  result: SpinResult;
  onReset: () => void;
}) {
  const isWin = result.won && !result.alreadyParticipated;
  // 是否展示全屏庆祝：中奖即弹；等级越高动画越华丽(prizeOrder 缺省按最轻档处理)
  const [celebrate, setCelebrate] = useState(isWin);
  const order = result.prizeOrder ?? 5;

  // 关闭庆祝遮罩(露出下方结果卡片继续填地址/返回)
  const closeCelebrate = () => setCelebrate(false);

  return (
    <section className="flex flex-col items-center py-8">
      {/* 全屏分级庆祝遮罩：一等奖=高级 / 二等奖=次高级 / 三等奖=中级 / 四等奖=次中级 / 五等或未知=基础 */}
      {celebrate && isWin && (
        <Celebration
          order={order}
          prizeName={result.prizeName || ""}
          prizeIcon={result.prizeIcon || ""}
          prizeType={result.prizeType}
          onClose={closeCelebrate}
        />
      )}

      <div className="glass-strong rounded-3xl p-8 sm:p-10 max-w-md w-full text-center animate-pop">
        <div className="text-6xl mb-4">{isWin ? "🎉" : "😊"}</div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isWin ? "恭喜中奖！" : "谢谢参与"}
        </h2>
        {isWin && result.prizeIcon && (
          <div className="my-3 flex justify-center">
            <PrizeIcon src={result.prizeIcon} size={96} />
          </div>
        )}
        <p className="text-amber-200 text-lg font-medium mb-2">
          {result.prizeName || result.message}
        </p>

        {isWin && (
          <div className="mt-4 space-y-1.5 text-amber-200/80 text-sm">
            <p>凭手机号核销</p>
            <p className="text-white/50 text-xs">图示仅供参考 · 以实物为准</p>
            <p className="text-white/50 text-xs">最终解释权归本店所有</p>
          </div>
        )}

        <button
          onClick={onReset}
          className="mt-6 text-white/50 text-sm hover:text-white transition-colors"
        >
          ← 返回
        </button>
      </div>
    </section>
  );
}

/* =========================================================
   全屏分级庆祝动画
   高级(一等奖)  >  次高级(二等奖)  >  中级(三等奖)  >  次中级(四等奖)
   五等/未知 → 基础光效(不发炫彩)。商品 logo 始终居中弹出。
   ========================================================= */
function Celebration({
  order,
  prizeName,
  prizeIcon,
  prizeType,
  onClose,
}: {
  order: number;
  prizeName: string;
  prizeIcon: string;
  prizeType?: string;
  onClose: () => void;
}) {
  const lvl = order <= 1 ? 1 : order <= 2 ? 2 : order <= 3 ? 3 : order <= 4 ? 4 : 5;
  const isBasic = lvl >= 5; // 五等/未知：基础光效

  // 标题文案（按 lvl 1~5 索引：lvl-1 取出对应等级名）
  const titles = ["一等", "二等", "三等", "四等", "五等"] as const;
  const sub = {
    1: "Congratulations!",
    2: "Amazing Luck!",
    3: "Good Job!",
    4: "Lucky You!",
    5: "Gotcha!",
  }[lvl] || "";

  // 生成彩带 / 光点(仅 lvl 1~4)
  const confetti = Array.from({ length: lvl === 1 ? 42 : lvl === 2 ? 26 : lvl === 3 ? 14 : 8 }).map((_, i) => ({
    left: `${(i * 7.3 + 3) % 100}%`,
    delay: `${((i * 131) % 40) / 10}s`,
    dur: `${2.6 + ((i * 37) % 14) / 10}s`,
    sway: `${((i % 5) - 2) * 28}px`,
    spin: `${180 + ((i * 89) % 720)}deg`,
    cw: `${6 + ((i * 13) % 8)}px`,
    ch: `${12 + ((i * 11) % 12)}px`,
    color: ["#ffd76a", "#ff9d5c", "#ffe9a8", "#fff3cf", "#ffb347"][i % 5],
  }));
  const sparks = Array.from({ length: lvl === 1 ? 30 : lvl === 2 ? 18 : 8 }).map((_, i) => {
    const ang = (i / (lvl === 1 ? 30 : lvl === 2 ? 18 : 8)) * Math.PI * 2;
    const dist = 120 + ((i * 43) % 90);
    return {
      dx: `${Math.cos(ang) * dist}px`,
      dy: `${Math.sin(ang) * dist}px`,
      delay: `${(i % 8) / 10}s`,
      color: ["#fff3cf", "#ffd76a", "#ff9d5c", "#ffe9a8"][i % 4],
    };
  });

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden flex items-center justify-center cele-mask">
      {/* 背景柔光 */}
      <div className="absolute inset-0 cele-glow" />

      {/* 等级不同的全屏粒子特效 */}
      {!isBasic && (
        <>
          {/* 彩带雨 */}
          {confetti.map((f, i) => (
            <span
              key={`c${i}`}
              className="cele-confetti"
              style={{
                left: f.left,
                width: f.cw,
                height: f.ch,
                background: f.color,
                animationDelay: f.delay,
                animationDuration: f.dur,
                ["--sway" as string]: f.sway,
                ["--spin" as string]: f.spin,
              }}
            />
          ))}
          {/* 径向光点/光波环 */}
          {sparks.map((s, i) => (
            <span
              key={`s${i}`}
              className="cele-spark"
              style={{
                background: s.color,
                ["--dx" as string]: s.dx,
                ["--dy" as string]: s.dy,
                animationDelay: s.delay,
              }}
            />
          ))}
          {lvl <= 2 && <span className={`cele-ring ${lvl === 1 ? "cele-ring--p1" : "cele-ring--p2"}`} />}
        </>
      )}

      {/* 中央内容：商品 logo + 标题 */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 cele-float">
        {/* 档位标签 */}
        {!isBasic && (
          <span className={`cele-badge ${lvl === 1 ? "cele-badge--p1" : lvl === 2 ? "cele-badge--p2" : lvl === 3 ? "cele-badge--p3" : "cele-badge--p4"}`}>
            {titles[lvl - 1]}等奖
          </span>
        )}

        {/* 商品 logo 弹出 */}
        <div className={`cele-logo-wrap ${lvl === 1 ? "cele-logo--p1" : lvl === 2 ? "cele-logo--p2" : lvl === 3 ? "cele-logo--p3" : lvl === 4 ? "cele-logo--p4" : "cele-logo--basic"}`}>
          {prizeIcon.startsWith("/") ? (
            <img src={prizeIcon} alt={prizeName} className="cele-logo-img" />
          ) : (
            <span className="cele-logo-emoji">{prizeIcon || "🎁"}</span>
          )}
        </div>

        {/* 标题文字 */}
        <div className={`cele-title ${lvl === 1 ? "cele-title--p1" : ""}`}>
          {prizeName || "恭喜中奖"}
        </div>
        <div className="cele-sub">
          {prizeType === "COUPON" ? "幸运奖" : "实物奖品"} · {sub}
        </div>

        {/* 收下按钮 */}
        <button
          onClick={onClose}
          className={`cele-btn ${lvl === 1 ? "cele-btn--p1" : ""}`}
        >
          收下奖品
        </button>
      </div>
    </div>
  );
}

function Background() {
  return (
    <>
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-amber-500/20 blur-3xl animate-float" />
      <div
        className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-rose-500/20 blur-3xl animate-float"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="absolute bottom-0 left-1/3 w-96 h-96 rounded-full bg-yellow-400/15 blur-3xl animate-float"
        style={{ animationDelay: "4s" }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,215,130,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,130,0.6) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
    </>
  );
}
