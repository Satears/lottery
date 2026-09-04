"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem("admin_token")) {
      router.replace("/admin");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (d.success) {
        localStorage.setItem("admin_token", d.data.token);
        router.replace("/admin");
      } else {
        setError(d.message || "登录失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a0f] relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="absolute bottom-0 -right-32 w-96 h-96 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="relative z-10 glass-strong rounded-3xl p-8 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎰</div>
          <h1 className="text-2xl font-semibold text-white">管理后台</h1>
          <p className="text-white/40 text-sm mt-1">请输入管理密码</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="管理密码"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3 font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-500 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-6">
          前往 <a href="/" className="text-indigo-400 hover:underline">参与页面</a>
        </p>
      </div>
    </main>
  );
}
