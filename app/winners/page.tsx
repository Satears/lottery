"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WinnerGroup {
  level: number; // 1=一等奖 …5=幸运奖
  prizeName: string;
  icon: string;
  winners: { name: string; phone: string }[];
}

// 轮询刷新间隔（毫秒）：用于大屏实时展示，随抽奖动态更新
const REFRESH_MS = 5000;

// 固定 5 档骨架：保证大屏始终展示完整结构（一等奖在最上…幸运奖最后），
// 尚未产生中奖者的档位显示“敬请期待”，一旦有人中奖由轮询自动填充
const LEVEL_SKELETON: { level: number; prizeName: string; icon: string }[] = [
  { level: 1, prizeName: "一等奖", icon: "/prizes/bird-nest-card.webp" },
  { level: 2, prizeName: "二等奖", icon: "/prizes/ginseng-card.webp" },
  { level: 3, prizeName: "三等奖", icon: "/prizes/bird-nest-congee-card.webp" },
  { level: 4, prizeName: "四等奖", icon: "/prizes/herb-soup-card.webp" },
  { level: 5, prizeName: "幸运奖", icon: "/prizes/coupon-card.webp" },
];

export default function WinnersPage() {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [results, setResults] = useState<WinnerGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  // 查询
  const [queryPhone, setQueryPhone] = useState("");
  const [querying, setQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<{
    type: "success" | "fail" | "error";
    text: string;
    detail?: React.ReactNode;
  } | null>(null);

  // 记录当前数据，供轮询增量合并时比对
  const latestRef = useRef({ title: "", total: 0, results: [] as WinnerGroup[], hasData: false });

  // 拉取名单（静默刷新：不重置 loading，避免大屏闪烁）
  const loadWinners = useCallback(async (silent: boolean) => {
    try {
      const r = await fetch("/api/winners");
      const d = await r.json();
      if (d.success && d.data) {
        // 把已中奖档位合并进固定 5 档骨架，并按键 level 升序，保证一等奖在最上
        const byLevel = new Map<number, WinnerGroup>();
        for (const g of LEVEL_SKELETON) {
          byLevel.set(g.level, { level: g.level, prizeName: g.prizeName, icon: g.icon, winners: [] });
        }
        for (const g of d.data.results as WinnerGroup[]) {
          const base = byLevel.get(g.level);
          byLevel.set(g.level, {
            level: g.level,
            prizeName: g.prizeName,
            icon: g.icon || base?.icon || "",
            winners: g.winners ?? [],
          });
        }
        const merged = [...byLevel.values()].sort(
          (a, b) => (a.level ?? 0) - (b.level ?? 0)
        );
        latestRef.current = {
          title: d.data.title,
          total: d.data.totalWinners,
          results: merged,
          hasData: true,
        };
        setTitle(d.data.title);
        setResults(merged);
        setTotal(d.data.totalWinners);
        setNotFound(false);
        setLastSync(Date.now());
      } else {
        // 后端返回 404 = 尚无中奖者
        if (!latestRef.current.hasData) setNotFound(true);
        if (latestRef.current.hasData) {
          // 已有数据却刷新失败，保留旧名单继续展示（大屏不中断）
        }
      }
    } catch {
      // 网络错误时保留旧数据，静默等待下一次轮询
      if (!latestRef.current.hasData && !silent) setNotFound(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWinners(false);
    const timer = setInterval(() => loadWinners(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadWinners]);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^1[3-9]\d{9}$/.test(queryPhone)) {
      setQueryResult({ type: "error", text: "请输入正确的手机号" });
      return;
    }
    setQuerying(true);
    setQueryResult(null);
    try {
      const r = await fetch("/api/check-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: queryPhone }),
      });
      const d = await r.json();
      if (d.success) {
        if (d.data.won) {
          const items: { name: string; icon?: string }[] = d.data.prizes;
          setQueryResult({
            type: "success",
            text: `🎉 ${d.data.message}`,
            detail: (
              <span className="flex items-center justify-center gap-2 flex-wrap">
                <span>中奖奖品：</span>
                {items.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {p.icon?.startsWith("/") ? (
                      <img
                        src={p.icon}
                        alt=""
                        width={22}
                        height={22}
                        className="rounded object-cover shadow shadow-black/40"
                      />
                    ) : p.icon ? (
                      <span>{p.icon}</span>
                    ) : null}
                    <span>{p.name}</span>
                  </span>
                ))}
              </span>
            ) as unknown as string,
          });
        } else {
          setQueryResult({ type: "fail", text: d.data.message });
        }
      } else {
        setQueryResult({ type: "error", text: d.message });
      }
    } catch {
      setQueryResult({ type: "error", text: "网络错误，请稍后重试" });
    } finally {
      setQuerying(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <Background />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 sm:py-16">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs text-white/70 mb-6">
            <span className="text-base">🏆</span>
            中奖名单公示
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-shimmer mb-3">
            {title}
          </h1>
          <p className="text-white/40 text-sm">
            共 {total} 位幸运中奖者
            {lastSync && (
              <span className="ml-2 text-white/20 text-xs align-middle">
                · 实时更新 {new Date(lastSync).toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            )}
          </p>
        </header>

        {notFound ? (
          <div className="glass rounded-3xl p-10 text-center">
            <div className="text-5xl mb-4">🎁</div>
            <p className="text-white/50">开奖结果尚未公布，敬请期待</p>
            <p className="text-white/25 text-xs mt-3">页面将自动刷新，一旦产生中奖将实时展示</p>
          </div>
        ) : (
          <>
            {/* 中奖查询 */}
            <section className="glass-strong rounded-2xl p-6 mb-8 max-w-md mx-auto">
              <h2 className="text-center font-semibold mb-4">查询我是否中奖</h2>
              <form onSubmit={handleQuery} className="flex gap-2">
                <input
                  type="tel"
                  value={queryPhone}
                  onChange={(e) =>
                    setQueryPhone(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="输入参与时的手机号"
                  maxLength={11}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400/60 transition-all"
                />
                <button
                  type="submit"
                  disabled={querying}
                  className="shrink-0 rounded-xl px-5 py-3 text-sm font-semibold bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {querying ? "查询中" : "查询"}
                </button>
              </form>
              {queryResult && (
                <div
                  className={`mt-4 text-center text-sm ${
                    queryResult.type === "success"
                      ? "text-amber-300"
                      : queryResult.type === "fail"
                      ? "text-white/60"
                      : "text-rose-400"
                  }`}
                >
                  <div>{queryResult.text}</div>
                  {queryResult.detail && (
                    <div className="mt-1 text-white/50">{queryResult.detail}</div>
                  )}
                </div>
              )}
            </section>

            {/* 名单列表：按档位升序 一等奖→…→幸运奖 */}
            <div className="space-y-6">
              {results.map((group, gi) => (
                <div key={group.level ?? gi} className="glass rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    {group.icon?.startsWith("/") ? (
                      <img
                        src={group.icon}
                        alt=""
                        width={40}
                        height={40}
                        className="rounded-lg object-cover shadow-md shadow-black/30"
                      />
                    ) : (
                      <span className="text-2xl">{group.icon}</span>
                    )}
                    <h3 className="text-lg font-semibold text-amber-300">
                      {group.prizeName}
                    </h3>
                    <span className="text-xs text-white/40">
                      {group.winners.length} 人
                    </span>
                  </div>
                  {group.winners.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {group.winners.map((w, i) => (
                        <div
                          key={i}
                          className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col items-center gap-1"
                        >
                          <div className="font-medium text-sm">{w.name}</div>
                          <div className="text-xs text-white/40">{w.phone}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl py-6 text-center">
                      <p className="text-white/25 text-sm">
                        本档尚未开出，敬请期待 ✨
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-center text-white/25 text-xs mt-8">
              为保护隐私，名单已做脱敏处理，请以主办方通知为准
            </p>
          </>
        )}

        <footer className="text-center mt-10">
          <a
            href="/"
            className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
          >
            ← 返回参与页
          </a>
        </footer>
      </div>
    </main>
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
    </>
  );
}
