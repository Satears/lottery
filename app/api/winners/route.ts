import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { maskName, maskPhone } from "@/lib/draw";

// 强制动态渲染：名单随抽奖实时变化
export const dynamic = "force-dynamic";

// 名单内存缓存：中奖名单仅在有人新中奖时才变化，大屏 5s 轮询下可吸收大量重复查询
// TTL 3 秒，新中奖最多延迟 3 秒展示，与前端轮询节奏匹配
let winnersCache: { key: string; data: any; expireAt: number } | null = null;
const WINNERS_CACHE_TTL = 3000;

// 中奖名单公示（公开，脱敏）
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const activityIdRaw = searchParams.get("activityId");
  const activityId = activityIdRaw && activityIdRaw !== "undefined" ? Number(activityIdRaw) : NaN;
  const activityIdValid = !Number.isNaN(activityId);
  const cacheKey = activityIdValid ? String(activityId) : "latest";
  const now = Date.now();

  // 命中缓存直接返回
  if (winnersCache && winnersCache.key === cacheKey && winnersCache.expireAt > now) {
    return ok(winnersCache.data);
  }

  // 查询有中奖记录的活动（转盘模式：参与即开奖，活动可保持 ACTIVE）
  const activity = await prisma.activity.findFirst({
    where: {
      ...(activityIdValid ? { id: activityId } : {}),
      winners: { some: {} },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      prizes: { orderBy: { order: "asc" } },
      winners: {
        include: { prize: true, entry: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!activity || activity.winners.length === 0) {
    return fail("暂无开奖结果", 404);
  }

  // 按奖品分组，脱敏展示；每组带 level（= prize.order，1=一等奖 …5=幸运奖）用于前端稳定排序
  const grouped = activity.winners.reduce<Record<number, any>>((acc, w) => {
    const lvl = w.prize.order;
    if (!acc[lvl]) {
      acc[lvl] = {
        level: lvl,
        prizeName: w.prize.name,
        icon: w.prize.icon,
        winners: [],
      };
    }
    acc[lvl].winners.push({
      // 只显示姓氏 + 脱敏，保护隐私
      name: maskName(w.name ?? w.entry.name),
      phone: maskPhone(w.phone ?? w.entry.phone),
    });
    return acc;
  }, {});

  // 按档位升序输出：一等奖 → 二等奖 → 三等奖 → 四等奖 → 幸运奖
  const results = Object.values(grouped).sort(
    (a, b) => (a.level as number) - (b.level as number)
  );

  const data = {
    activityId: activity.id,
    title: activity.title,
    results,
    totalWinners: activity.winners.length,
  };
  winnersCache = { key: cacheKey, data, expireAt: now + WINNERS_CACHE_TTL };
  return ok(data);
}
