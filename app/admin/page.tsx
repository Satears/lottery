"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Prize {
  id: number;
  name: string;
  icon: string;
  stock: number;
  drawn: number;
  probability: number;
  type: string;
  order: number;
}

interface Activity {
  id: number;
  title: string;
  description: string;
  status: string;
  prizes: Prize[];
  _count?: { entries: number; winners: number };
  entryCount?: number;
  winnerCount?: number;
}

interface Entry {
  id: number;
  name: string;
  phone: string;
  createdAt: string;
  won?: boolean;
  prizeId?: number;
  prizeName?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentId, setCurrentId] = useState<number | "">("");
  const [current, setCurrent] = useState<Activity | null>(null);

  // 参与名单
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryTotal, setEntryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");

  // 中奖名单
  const [winnerList, setWinnerList] = useState<any[]>([]);
  const [winnerTotal, setWinnerTotal] = useState(0);

  // 标签页
  const [tab, setTab] = useState<"overview" | "entries" | "winners" | "settings">(
    "overview"
  );

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }),
    [token]
  );

  // 初始化
  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (!t) {
      router.replace("/admin/login");
      return;
    }
    setToken(t);
  }, [router]);

  // 加载活动列表
  const loadActivities = useCallback(async () => {
    if (!token) return;
    const r = await fetch("/api/admin/activity", { headers: headers() });
    const d = await r.json();
    if (d.success) {
      setActivities(d.data);
      if (d.data.length > 0 && !currentId) {
        setCurrentId(d.data[0].id);
      }
    } else if (d.message === "未授权，请提供正确的管理密码") {
      localStorage.removeItem("admin_token");
      router.replace("/admin/login");
    }
  }, [token, headers, currentId, router]);

  useEffect(() => {
    if (token) {
      loadActivities()
        .catch(() => {
          /* 服务暂不可达时静默，避免未捕获异常 */
        })
        .finally(() => setLoading(false));
    }
  }, [token, loadActivities]);

  // 加载当前活动详情
  useEffect(() => {
    if (!token || !currentId) return;
    fetch(`/api/admin/activity?id=${currentId}`, { headers: headers() })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCurrent(d.data);
      })
      .catch(() => {
        /* 忽略网络错误 */
      });
  }, [token, currentId, headers]);

  // 加载参与名单
  const loadEntries = useCallback(async () => {
    if (!token || !currentId) return;
    const params = new URLSearchParams({
      activityId: String(currentId),
      page: String(page),
      pageSize: "20",
      keyword,
    });
    const r = await fetch(`/api/admin/entries?${params}`, {
      headers: headers(),
    });
    const d = await r.json();
    if (d.success) {
      setEntries(d.data.entries);
      setEntryTotal(d.data.total);
    }
  }, [token, currentId, page, keyword, headers]);

  useEffect(() => {
    if (tab === "entries") loadEntries().catch(() => {});
  }, [tab, loadEntries]);

  // 加载中奖名单
  const loadWinners = useCallback(async () => {
    if (!token || !currentId) return;
    const r = await fetch(
      `/api/admin/winners?activityId=${currentId}`,
      { headers: headers() }
    );
    const d = await r.json();
    if (d.success) {
      setWinnerList(d.data.list);
      setWinnerTotal(d.data.total);
    }
  }, [token, currentId, headers]);

  useEffect(() => {
    if (tab === "winners") loadWinners().catch(() => {});
  }, [tab, loadWinners]);

  // 导出 CSV
  const handleExport = async () => {
    if (!currentId) return;
    const r = await fetch(
      `/api/admin/entries?activityId=${currentId}&export=true`,
      { headers: headers() }
    );
    const d = await r.json();
    if (!d.success) return;

    const esc = (v: string) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = d.data.map((e: Entry) => [
      e.name,
      e.phone,
      e.createdAt,
      e.prizeName || "未中奖",
    ]);
    const csv =
      "\uFEFF姓名,手机号,参与时间,中奖奖品\n" +
      rows.map((r: string[]) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `参与名单_${currentId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 顶栏 */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎰</div>
            <div>
              <h1 className="text-xl font-semibold">抽奖活动管理后台</h1>
              <p className="text-white/40 text-xs">Lucky Draw Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/winners"
              target="_blank"
              className="text-sm text-amber-300 hover:text-amber-200 transition-colors"
            >
              公示页 ↗
            </a>
            <a
              href="/"
              target="_blank"
              className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
            >
              参与页 ↗
            </a>
            <button
              onClick={() => {
                localStorage.removeItem("admin_token");
                router.replace("/admin/login");
              }}
              className="text-sm glass rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-colors"
            >
              退出
            </button>
          </div>
        </header>

        {/* 活动选择 */}
        {activities.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-sm text-white/40">活动：</span>
            <select
              value={currentId === "" ? "" : String(currentId)}
              onChange={(e) => {
                setCurrentId(e.target.value ? Number(e.target.value) : "");
                setPage(1);
              }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400/60"
            >
              {activities.map((a) => (
                <option key={a.id} value={a.id} className="bg-[#1a1a2e]">
                  {a.title}（{a.status === "ACTIVE" ? "进行中" : a.status === "ENDED" ? "已结束" : "草稿"}）
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 标签页 */}
        <nav className="flex gap-1 mb-6 glass rounded-xl p-1 w-fit">
          {[
            { key: "overview", label: "概览" },
            { key: "entries", label: "参与名单" },
            { key: "winners", label: "中奖名单" },
            { key: "settings", label: "活动设置" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                tab === t.key
                  ? "bg-indigo-500/80 text-white font-medium"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* 内容区 */}
        {tab === "overview" && (
          <Overview current={current} />
        )}

        {tab === "entries" && (
          <Entries
            entries={entries}
            total={entryTotal}
            page={page}
            setPage={setPage}
            keyword={keyword}
            setKeyword={setKeyword}
            onExport={handleExport}
          />
        )}

        {tab === "winners" && (
          <WinnersList
            list={winnerList}
            total={winnerTotal}
            onRefresh={loadWinners}
          />
        )}

        {tab === "settings" && (
          <Settings
            current={current}
            onSaved={() => {
              loadActivities();
            }}
          />
        )}
      </div>
    </main>
  );
}

function Overview({ current }: { current: Activity | null }) {
  const stats = [
    {
      label: "参与人数",
      value: current?._count?.entries ?? 0,
      icon: "👥",
    },
    {
      label: "中奖人数",
      value: current?._count?.winners ?? 0,
      icon: "🏆",
    },
    {
      label: "奖品库存",
      value: current?.prizes?.reduce((s, p) => s + (p.stock - p.drawn), 0) ?? 0,
      icon: "🎁",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{s.icon}</div>
              <div>
                <div className="text-2xl font-bold text-white">
                  {s.value.toLocaleString()}
                </div>
                <div className="text-xs text-white/40">{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {current && (
        <div className="glass rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4">活动信息</h3>
          <div className="space-y-2 text-sm">
            <InfoRow label="标题" value={current.title} />
            <InfoRow label="描述" value={current.description || "—"} />
            <InfoRow
              label="状态"
              value={
                current.status === "ACTIVE"
                  ? "进行中"
                  : current.status === "ENDED"
                  ? "已结束"
                  : "草稿"
              }
            />
          </div>
          <h4 className="font-semibold text-white mt-6 mb-3">奖品设置</h4>
          <div className="space-y-2">
            {current.prizes.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2.5"
              >
                <span className="flex items-center gap-2">
                  {p.icon?.startsWith("/") ? (
                    <img
                      src={p.icon}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded object-cover"
                    />
                  ) : (
                    <span>{p.icon}</span>
                  )}
                  <span className="text-sm">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                    {p.type === "COUPON" ? "优惠券" : "实物"}
                  </span>
                </span>
                <span className="text-xs text-indigo-300">
                  剩 {p.stock - p.drawn}/{p.stock}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-white/40 w-16 shrink-0">{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}

function Entries({
  entries,
  total,
  page,
  setPage,
  keyword,
  setKeyword,
  onExport,
}: {
  entries: Entry[];
  total: number;
  page: number;
  setPage: (p: number) => void;
  keyword: string;
  setKeyword: (k: string) => void;
  onExport: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="font-semibold">
          参与名单 <span className="text-white/40 text-sm">共 {total} 人</span>
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="搜索姓名/手机号"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400/60"
          />
          <button
            onClick={onExport}
            className="text-sm bg-indigo-500/80 rounded-lg px-3 py-2 hover:bg-indigo-500 transition-colors"
          >
            导出 CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-white/40 border-b border-white/10">
              <th className="py-2 px-3 font-medium">姓名</th>
              <th className="py-2 px-3 font-medium">手机号</th>
              <th className="py-2 px-3 font-medium">中奖情况</th>
              <th className="py-2 px-3 font-medium">参与时间</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-white/30">
                  暂无参与者
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-3 px-3">{e.name}</td>
                  <td className="py-3 px-3 text-white/70">{e.phone}</td>
                  <td className="py-3 px-3">
                    {e.won ? (
                      <span className="text-amber-300 text-xs">
                        🎁 {e.prizeName || "已中奖"}
                      </span>
                    ) : (
                      <span className="text-white/30 text-xs">未中奖</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-white/50">
                    {new Date(e.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="text-sm glass rounded-lg px-3 py-1.5 disabled:opacity-30"
          >
            上一页
          </button>
          <span className="text-sm text-white/50">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="text-sm glass rounded-lg px-3 py-1.5 disabled:opacity-30"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function WinnersList({
  list,
  total,
  onRefresh,
}: {
  list: any[];
  total: number;
  onRefresh: () => void;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">
          中奖名单 <span className="text-white/40 text-sm">共 {total} 人</span>
        </h3>
        <button
          onClick={onRefresh}
          className="text-sm text-indigo-300 hover:text-indigo-200 transition-colors"
        >
          刷新
        </button>
      </div>

      {list.length === 0 ? (
        <div className="py-10 text-center text-white/30">
          暂无中奖记录
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/10">
                <th className="py-2 px-3 font-medium">奖品</th>
                <th className="py-2 px-3 font-medium">姓名</th>
                <th className="py-2 px-3 font-medium">手机号</th>
                <th className="py-2 px-3 font-medium">类型</th>
                <th className="py-2 px-3 font-medium">收货地址</th>
                <th className="py-2 px-3 font-medium">中奖时间</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {w.prizeIcon?.startsWith("/") ? (
                        <img
                          src={w.prizeIcon}
                          alt=""
                          width={28}
                          height={28}
                          className="rounded object-cover shadow shadow-black/40"
                        />
                      ) : w.prizeIcon ? (
                        <span className="text-xl leading-none">{w.prizeIcon}</span>
                      ) : null}
                      <span className="text-amber-300">{w.prizeName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3">{w.name}</td>
                  <td className="py-3 px-3 text-white/70">{w.phone}</td>
                  <td className="py-3 px-3">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                      {w.prizeType === "COUPON" ? "优惠券" : "实物"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-white/60 max-w-[200px] truncate">
                    {w.address || "—"}
                  </td>
                  <td className="py-3 px-3 text-white/50">
                    {new Date(w.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Settings({
  current,
  onSaved,
}: {
  current: Activity | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [prizes, setPrizes] = useState<
    { name: string; icon: string; stock: number; probability: number; type: string }[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (current) {
      setTitle(current.title);
      setDescription(current.description || "");
      setStatus(current.status);
      setPrizes(
        current.prizes.map((p) => ({
          name: p.name,
          icon: p.icon,
          stock: p.stock,
          probability: p.probability,
          type: p.type,
        }))
      );
    }
  }, [current]);

  const handleSave = async () => {
    if (!title.trim()) {
      setMsg("标题不能为空");
      return;
    }
    setSaving(true);
    setMsg("");
    const token = localStorage.getItem("admin_token");
    try {
      const r = await fetch("/api/admin/activity", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: current?.id,
          title,
          description,
          status,
          prizes: prizes.filter((p) => p.name.trim()),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg("保存成功！");
        onSaved();
      } else {
        setMsg(d.message || "保存失败");
      }
    } catch {
      setMsg("网络错误");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <h3 className="font-semibold">活动设置</h3>

      <div>
        <label className="block text-sm text-white/60 mb-2">活动标题</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400/60"
        />
      </div>

      <div>
        <label className="block text-sm text-white/60 mb-2">活动描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400/60 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm text-white/60 mb-2">活动状态</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400/60"
        >
          <option value="DRAFT" className="bg-[#1a1a2e]">草稿</option>
          <option value="ACTIVE" className="bg-[#1a1a2e]">进行中</option>
          <option value="ENDED" className="bg-[#1a1a2e]">已结束</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-white/60 mb-2">奖品设置</label>
        <div className="space-y-3">
          {prizes.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="flex items-center gap-2">
                {p.icon?.startsWith("/") ? (
                  <img src={p.icon} alt="" width={36} height={36} className="rounded object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center text-xs text-white/30">无图</div>
                )}
                <input
                  type="text"
                  value={p.icon}
                  onChange={(e) => {
                    const arr = [...prizes];
                    arr[i].icon = e.target.value;
                    setPrizes(arr);
                  }}
                  placeholder="/prizes/xxx.webp 或 emoji"
                  className="w-48 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs outline-none focus:border-indigo-400/60"
                  title="图片路径或 emoji"
                />
              </div>
              <input
                type="text"
                value={p.name}
                onChange={(e) => {
                  const arr = [...prizes];
                  arr[i].name = e.target.value;
                  setPrizes(arr);
                }}
                placeholder="奖品名称"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400/60"
              />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-white/40">库存</span>
                <input
                  type="number"
                  value={p.stock}
                  min={1}
                  onChange={(e) => {
                    const arr = [...prizes];
                    arr[i].stock = Math.max(1, parseInt(e.target.value) || 1);
                    setPrizes(arr);
                  }}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-indigo-400/60"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-white/40">权重</span>
                <input
                  type="number"
                  value={p.probability}
                  min={0}
                  onChange={(e) => {
                    const arr = [...prizes];
                    arr[i].probability = Math.max(0, parseInt(e.target.value) || 0);
                    setPrizes(arr);
                  }}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-indigo-400/60"
                />
              </div>
              <select
                value={p.type}
                onChange={(e) => {
                  const arr = [...prizes];
                  arr[i].type = e.target.value;
                  setPrizes(arr);
                }}
                className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-indigo-400/60"
              >
                <option value="PHYSICAL" className="bg-[#1a1a2e]">实物</option>
                <option value="COUPON" className="bg-[#1a1a2e]">优惠券</option>
              </select>
              <button
                onClick={() => setPrizes(prizes.filter((_, j) => j !== i))}
                className="text-rose-400 text-sm px-1 hover:text-rose-300"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              setPrizes([
                ...prizes,
                { name: "", icon: "🎁", stock: 1, probability: 1, type: "PHYSICAL" },
              ])
            }
            className="text-sm text-indigo-300 hover:text-indigo-200"
          >
            + 添加奖品
          </button>
        </div>
      </div>

      {msg && (
        <p
          className={`text-sm ${
            msg.includes("成功") ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {msg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-xl px-6 py-3 font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {saving ? "保存中..." : "保存设置"}
      </button>
    </div>
  );
}
