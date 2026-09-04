import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { adminGuard } from "@/lib/auth";

// 管理端：查看中奖名单（含地址、奖品类型）
export async function GET(req: NextRequest) {
  if (adminGuard(req)) return adminGuard(req)!;

  const { searchParams } = new URL(req.url);
  const activityIdRaw = searchParams.get("activityId");
  const activityId = activityIdRaw ? Number(activityIdRaw) : NaN;
  if (!activityIdRaw || Number.isNaN(activityId)) return fail("缺少活动 ID");

  const winners = await prisma.winner.findMany({
    where: { activityId },
    include: {
      prize: true,
      entry: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const list = winners.map((w) => ({
    id: w.id,
    prizeName: w.prize.name,
    prizeIcon: w.prize.icon,
    prizeType: w.prize.type,
    // 优先用冗余的中奖人姓名/手机号，address 仍需关联 entry
    name: w.name ?? w.entry.name,
    phone: w.phone ?? w.entry.phone,
    address: w.entry.address,
    won: w.entry.won,
    createdAt: w.createdAt,
  }));

  return ok({
    total: list.length,
    list,
  });
}
