import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ok, fail, getIp } from "@/lib/api";
import { verifyCaptcha } from "@/lib/captcha";
import { rateLimit } from "@/lib/ratelimit";
import { spinAndDrawTx } from "@/lib/spin";

// 强制动态渲染：活动状态/库存实时变化，禁止静态化
export const dynamic = "force-dynamic";

// 活动详情内存缓存（短 TTL 2 秒），吸收高峰期读压力
// 注意：库存/参与数会延迟最多 2 秒，对转盘展示无影响；抽奖结果以后端事务为准
let activityCache: { activity: any; data: any; expireAt: number } | null = null;
const ACTIVITY_CACHE_TTL = 2000;

/**
 * 获取当前激活活动（含 prizes 原生活动），带 2 秒内存缓存。
 * GET（活动展示）与 POST（抽奖入口）共用，消除抽奖链路每次的 activity 全表查询。
 * 注意：这里缓存的是"活动基础信息 + 奖品快照"。抽奖的真实扣库存/防超发
 * 仍由 spinAndDraw 事务内实时查询 prizes 保证，不受本缓存影响（最多延迟 2 秒反映库存变化，可接受）。
 */
async function getActiveActivity() {
  const now = Date.now();
  if (activityCache && activityCache.expireAt > now) {
    return activityCache;
  }
  const activity = await prisma.activity.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      prizes: { orderBy: { order: "asc" } },
      _count: { select: { entries: true } },
    },
  });
  if (!activity) return null;
  activityCache = {
    activity,
    data: null as any,
    expireAt: now + ACTIVITY_CACHE_TTL,
  };
  return activityCache;
}

// 获取当前激活的活动（对外公开）
export async function GET() {
  const hit = await getActiveActivity();
  if (!hit) {
    return fail("暂无进行中的活动", 404);
  }
  if (hit.data) return ok(hit.data);

  const activity: any = hit.activity;
  const data = {
    id: activity.id,
    title: activity.title,
    description: activity.description,
    status: activity.status,
    startAt: activity.startAt,
    endAt: activity.endAt,
    // 转盘需要奖品扇区信息
    prizes: activity.prizes.map((p: any) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      type: p.type,
      stock: p.stock,
      drawn: p.drawn,
      remaining: p.stock - p.drawn,
    })),
    entryCount: activity._count.entries,
  };
  hit.data = data;
  return ok(data);
}

// 组装"已参与过"响应（避免重复抽；奖品信息取自活动缓存快照）
function buildAlreadyParticipated(existing: any, activity: any) {
  const prevPrize = existing.prizeId
    ? (activity?.prizes || []).find((p: any) => p.id === existing.prizeId)
    : null;
  return ok({
    id: existing.id,
    alreadyParticipated: true,
    won: existing.won,
    prizeId: existing.prizeId,
    prizeOrder: prevPrize?.order ?? null,
    prizeName: prevPrize?.name || null,
    prizeIcon: prevPrize?.icon || null,
    prizeType: prevPrize?.type || null,
    message: "该手机号已参与过本次活动",
  });
}

// 提交参与 + 执行转盘开奖（一体，创建记录与开奖在同一原子事务）
export async function POST(req: NextRequest) {
  const ip = getIp(req);

  // 防刷：同一 IP 每 60 秒最多 5 次提交
  if (!rateLimit(`entry:${ip}`, 5, 60_000)) {
    return fail("操作过于频繁，请稍后再试", 429);
  }

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const phone = body?.phone?.trim();
  const captcha = body?.captcha?.trim();
  const captchaSalt = body?.captchaSalt;
  const captchaSign = body?.captchaSign;

  if (!name || name.length < 1 || name.length > 30) {
    return fail("请填写正确的姓名");
  }
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return fail("请填写正确的手机号");
  }

  // 校验验证码
  if (!captcha || !captchaSalt || !captchaSign) {
    return fail("请输入验证码", 400);
  }
  if (!verifyCaptcha(captcha, captchaSalt, captchaSign)) {
    return fail("验证码错误，请重新输入", 400);
  }

  // 复用活动缓存：省去每次抽奖前一次 activity+prizes 全表查询，降低 DB 读压力
  const hit = await getActiveActivity();
  const activity: any = hit?.activity ?? null;
  if (!activity) {
    return fail("暂无进行中的活动", 404);
  }

  // 检查活动时间
  if (activity.endAt && new Date(activity.endAt) < new Date()) {
    return fail("活动已结束", 400);
  }

  // 防重复参与（同一活动同一手机号）—— 快速路径
  const existing = await prisma.entry.findUnique({
    where: {
      activityId_phone: { activityId: activity.id, phone },
    },
  });
  if (existing) {
    return buildAlreadyParticipated(existing, activity);
  }

  try {
    // 创建参与记录 + 开奖必须在同一事务内：避免"记录已建、开奖失败"导致该手机号被卡死无法重试
    const { entry, result } = await prisma.$transaction(async (tx) => {
      const e = await tx.entry.create({
        data: { activityId: activity.id, name, phone, ip },
      });
      const r = await spinAndDrawTx(tx, activity.id, e.id, 0, { name, phone });
      return { entry: e, result: r };
    });

    // 组装转盘扇区数据（用于前端动画指向）
    const sectors = activity.prizes.map((p: any, i: number) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      index: i,
    }));

    // 找到中奖扇区索引
    let winIndex = -1;
    if (result.won && result.prizeId) {
      winIndex = sectors.findIndex((s: any) => s.id === result.prizeId);
    }

    return ok({
      id: entry.id,
      ...result,
      sectors,
      winIndex,
      message: result.won
        ? `恭喜您抽中「${result.prizeName}」！`
        : "很遗憾，本次未中奖",
    });
  } catch (e: any) {
    // 并发重复提交：撞唯一约束 (activityId, phone)，按"已参与"返回其历史结果
    if (e?.code === "P2002") {
      const dup = await prisma.entry.findUnique({
        where: { activityId_phone: { activityId: activity.id, phone } },
      });
      if (dup) return buildAlreadyParticipated(dup, activity);
    }
    console.error("[activity] 抽奖失败:", e);
    return fail("服务器繁忙，请稍后重试", 500);
  }
}
