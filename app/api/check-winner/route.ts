import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ok, fail, getIp } from "@/lib/api";
import { maskPhone } from "@/lib/draw";
import { rateLimit } from "@/lib/ratelimit";

// 查询是否中奖：输入手机号精确匹配
export async function POST(req: NextRequest) {
  // 防枚举：同一 IP 每 60 秒最多 10 次查询
  if (!rateLimit(`check:${getIp(req)}`, 10, 60_000)) {
    return fail("查询过于频繁，请稍后再试", 429);
  }

  const body = await req.json().catch(() => null);
  const phone = body?.phone?.trim();
  // activityId 可为数字或字符串，统一转成数字
  const activityIdRaw = body?.activityId;
  const activityId =
    activityIdRaw === undefined || activityIdRaw === null || activityIdRaw === ""
      ? undefined
      : Number(activityIdRaw);
  const activityIdValid = activityId !== undefined && !Number.isNaN(activityId);

  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return fail("请输入正确的手机号");
  }

  const entry = await prisma.entry.findFirst({
    where: {
      phone,
      ...(activityIdValid ? { activityId } : {}),
    },
    include: {
      activity: true,
      winners: { include: { prize: true } },
    },
  });

  if (!entry) {
    return fail("该手机号未参与本次活动", 404);
  }

  if (entry.winners.length === 0) {
    return ok({
      participated: true,
      won: false,
      activityTitle: entry.activity.title,
      message: "很遗憾，本次未中奖",
    });
  }

  return ok({
    participated: true,
    won: true,
    activityTitle: entry.activity.title,
    message: "恭喜您中奖了！",
    prizes: entry.winners.map((w) => ({
      name: w.prize.name,
      icon: w.prize.icon,
    })),
    name: entry.name,
    phone: maskPhone(entry.phone),
  });
}
