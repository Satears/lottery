import { Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * 转盘抽奖：后端预判结果 + 事务扣减库存
 *
 * 规则：
 * 1. 从还有库存（drawn < stock）的奖品中，按 probability 权重抽取一个
 * 2. 抽中后扣减库存（drawn + 1），记录中奖
 * 3. 保底机制：幸运奖（COUPON 类型，兜底取 order 最大者）永不售罄、必可抽中；
 *    其它奖品耗尽或并发抢空时回退到幸运奖，绝不出现"谢谢参与"
 * 4. 全程在事务中执行，保证并发下实物库存不超发（幸运奖 COUPON 除外，可超发兜底）
 * 5. 兜底奖品若为实物（未配置 COUPON）且也已售罄，则记为"未中奖"，
 *    避免对实物奖品的无限超发（返回 won=false）
 */

export type Tx = Prisma.TransactionClient;

export interface SpinResult {
  won: boolean;
  prizeId?: number;
  prizeOrder?: number; // 中奖奖品档位(1=一等奖 …5=五等奖)，前端据此决定庆祝动画等级
  prizeName?: string;
  prizeIcon?: string;
  prizeType?: string;
  isPhysical?: boolean;
}

type ClaimResult = "won" | "soldout";

/**
 * 尝试扣减某个奖品一个名额
 * - COUPON：无条件递增（可超发兜底）
 * - 其它：条件更新 `drawn < stock`，并发下被抢空返回 soldout
 */
async function claim(tx: Tx, prize: {
  id: number;
  stock: number;
  type: string;
}): Promise<ClaimResult> {
  if (prize.type === "COUPON") {
    await tx.prize.update({
      where: { id: prize.id },
      data: { drawn: { increment: 1 } },
    });
    return "won";
  }
  const updated = await tx.prize.updateMany({
    where: { id: prize.id, drawn: { lt: prize.stock } },
    data: { drawn: { increment: 1 } },
  });
  return updated.count > 0 ? "won" : "soldout";
}

/**
 * 在指定事务内执行开奖（供外层把"创建参与记录"与"开奖"合并为一个原子事务）
 */
export async function spinAndDrawTx(
  tx: Tx,
  activityId: number,
  entryId: number,
  thanksWeight: number = 0, // 谢谢参与的权重，0 表示人人有奖（但受库存限制）
  participant?: { name: string; phone: string } // 直接传入姓名/手机号，省一次事务内查询
): Promise<SpinResult> {
  // 1. 只查仍有库存的奖品（activity 存在性已在外层验证）
  const prizes = await tx.prize.findMany({
    where: { activityId },
    orderBy: { order: "asc" },
  });

  if (prizes.length === 0) {
    throw new Error("活动不存在或无奖品");
  }

  // 保底奖品（幸运奖）：COUPON 类型；兜底取 order 最大者。永不售罄。
  const consolation =
    prizes.find((p) => p.type === "COUPON") ||
    prizes.reduce((a, b) => (a.order > b.order ? a : b));

  // 2. 过滤出还有库存的"非保底"奖品（幸运奖永远可抽，不在此列）
  const available = prizes.filter(
    (p) => p.drawn < p.stock && p.id !== consolation.id
  );

  // 3. 构建权重表：有库存奖品 + 保底奖（恒入池，保证抽取必然命中）
  const pool: { prize: (typeof available)[number] | null; weight: number }[] =
    available.map((p) => ({
      prize: p,
      weight: Math.max(p.probability, 0),
    }));

  pool.push({
    prize: consolation,
    weight: Math.max(consolation.probability, 0) || 1,
  });

  // 谢谢参与（如果 thanksWeight > 0 才加入）
  if (thanksWeight > 0) {
    pool.push({ prize: null, weight: thanksWeight });
  }

  // 4. 加权随机抽取
  const totalWeight = pool.reduce((s, item) => s + item.weight, 0);
  // 如果所有权重都为 0（未配置概率），则等概率抽取
  const useEqual = totalWeight === 0;
  let rand = Math.random() * (useEqual ? pool.length : totalWeight);

  let selected: (typeof pool)[number] | null = null;
  for (const item of pool) {
    const w = useEqual ? 1 : item.weight;
    if (rand < w) {
      selected = item;
      break;
    }
    rand -= w;
  }

  // 兜底：没选中（浮点误差）或权重抽到"谢谢参与"→ 保底奖
  if (!selected || !selected.prize) {
    selected = { prize: consolation, weight: 1 };
  }

  // 5. 中奖：扣减库存 + 记录（全程在本事务内）
  let target = selected.prize!;
  let status = await claim(tx, target);

  // 实物被并发抢空且非保底 → 回退到保底奖
  if (status === "soldout" && target.id !== consolation.id) {
    target = consolation;
    status = await claim(tx, target);
  }

  // 保底奖（实物且无 COUPON）也已售罄 → 记"未中奖"，避免实物超发
  if (status === "soldout") {
    await tx.entry.update({
      where: { id: entryId },
      data: { won: false, prizeId: null },
    });
    return { won: false };
  }

  await tx.entry.update({
    where: { id: entryId },
    data: { won: true, prizeId: target.id },
  });

  // 中奖人姓名/手机号（冗余存储，便于公示页直接展示，无需每处 join）
  await tx.winner.create({
    data: {
      activityId: activityId,
      prizeId: target.id,
      entryId,
      name: participant?.name ?? null,
      phone: participant?.phone ?? null,
    },
  });

  return {
    won: true,
    prizeId: target.id,
    prizeOrder: target.order,
    prizeName: target.name,
    prizeIcon: target.icon,
    prizeType: target.type,
    isPhysical: target.type === "PHYSICAL",
  };
}

/**
 * 独立事务版（默认用途：单次开奖原子提交）
 */
export async function spinAndDraw(
  activityId: number,
  entryId: number,
  thanksWeight: number = 0,
  participant?: { name: string; phone: string }
): Promise<SpinResult> {
  return prisma.$transaction((tx) =>
    spinAndDrawTx(tx, activityId, entryId, thanksWeight, participant)
  );
}
