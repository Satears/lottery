import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { adminGuard } from "@/lib/auth";

// 管理端：获取活动（含详情）或所有活动列表
export async function GET(req: NextRequest) {
  if (adminGuard(req)) return adminGuard(req)!;

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = idRaw ? Number(idRaw) : NaN;

  if (idRaw && !Number.isNaN(id)) {
    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        prizes: { orderBy: { order: "asc" } },
        _count: { select: { entries: true, winners: true } },
      },
    });
    if (!activity) return fail("活动不存在", 404);
    return ok(activity);
  }

  const activities = await prisma.activity.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      prizes: { orderBy: { order: "asc" } },
      _count: { select: { entries: true, winners: true } },
    },
  });
  return ok(activities);
}

// 管理端：创建/更新活动
export async function POST(req: NextRequest) {
  if (adminGuard(req)) return adminGuard(req)!;

  const body = await req.json().catch(() => null);
  const { id: idRaw, title, description, status, endAt, prizes } = body || {};
  const id = idRaw === undefined || idRaw === null ? undefined : Number(idRaw);

  if (!title?.trim()) return fail("活动标题不能为空");

  const data = {
    title: title.trim(),
    description: description?.trim() || null,
    status: status || "DRAFT",
    endAt: endAt ? new Date(endAt) : null,
  };

  if (id !== undefined && !Number.isNaN(id)) {
    // 更新
    const activity = await prisma.activity.update({
      where: { id },
      data,
    });

    if (prizes && Array.isArray(prizes)) {
      // 数据保护：一旦已有中奖/参与记录就禁止重置奖品
      // （Prize onDelete:Cascade 会级联删除 Winner，导致中奖公示被清空且 Entry.prizeId 悬空）
      const hasWinners = await prisma.winner.count({ where: { activityId: id } });
      if (hasWinners > 0) {
        return fail("该活动已有中奖记录，禁止重置奖品（会清空中奖名单）。如需调整，请新建活动", 400);
      }
      // 简单处理：删除旧的重新创建（无中奖记录前才允许）
      await prisma.prize.deleteMany({ where: { activityId: id } });
      await prisma.prize.createMany({
        data: prizes.map((p: any, i: number) => ({
          activityId: id,
          name: p.name,
          icon: p.icon || "🎁",
          stock: p.stock === undefined || p.stock === null || Number.isNaN(Number(p.stock)) ? 1 : Number(p.stock),
          drawn: 0,
          probability: p.probability === undefined || p.probability === null || Number.isNaN(Number(p.probability)) ? 0 : Number(p.probability),
          type: p.type === "COUPON" ? "COUPON" : "PHYSICAL",
          order: i + 1,
        })),
      });
    }

    return ok(activity);
  }

  // 创建
  const activity = await prisma.activity.create({
    data: {
      ...data,
      prizes: prizes?.length
        ? {
            create: prizes.map((p: any, i: number) => ({
              name: p.name,
              icon: p.icon || "🎁",
              stock: p.stock === undefined || p.stock === null || Number.isNaN(Number(p.stock)) ? 1 : Number(p.stock),
              drawn: 0,
              probability: p.probability === undefined || p.probability === null || Number.isNaN(Number(p.probability)) ? 0 : Number(p.probability),
              type: p.type === "COUPON" ? "COUPON" : "PHYSICAL",
              order: i + 1,
            })),
          }
        : undefined,
    },
  });

  return ok(activity);
}
