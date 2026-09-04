import prisma from "./prisma";

/**
 * 转盘抽奖：后端预判结果 + 事务扣减库存
 *
 * 规则：
 * 1. 从还有库存（drawn < stock）的奖品中，按 probability 权重抽取一个
 * 2. 抽中后扣减库存（drawn + 1），记录中奖
 * 3. 保底机制：幸运奖（COUPON 类型，兜底取 order 最大者）永不售罄、必可抽中，
 *    即使其它奖品耗尽或并发抢空，也保底抽中幸运奖，绝不出现"谢谢参与"
 * 4. 全程在事务中执行，保证并发下库存不超发（幸运奖除外，可超发）
 */

export interface SpinResult {
  won: boolean;
  prizeId?: number;
  prizeOrder?: number; // 中奖奖品档位(1=一等奖 …5=五等奖)，前端据此决定庆祝动画等级
  prizeName?: string;
  prizeIcon?: string;
  prizeType?: string;
  isPhysical?: boolean;
}

export async function spinAndDraw(
  activityId: number,
  entryId: number,
  thanksWeight: number = 0, // 谢谢参与的权重，0 表示人人有奖（但受库存限制）
  participant?: { name: string; phone: string } // 直接传入姓名/手机号，省一次事务内查询
): Promise<SpinResult> {
  return await prisma.$transaction(async (tx) => {
    // 1. 只查仍有库存的奖品（activity 存在性已在外层验证），省一次活动主表查询
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

    // 3. 构建权重表：有库存奖品 + 保底幸运奖（幸运奖必在池中）
    const pool: { prize: (typeof available)[number] | null; weight: number }[] =
      available.map((p) => ({
        prize: p,
        weight: Math.max(p.probability, 0),
      }));

    // 保底幸运奖恒入池（其 weight 恒 > 0，保证权重抽取必然命中）
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

    // 兜底：没选中（浮点误差）或选中"谢谢参与"→ 保底幸运奖
    if (!selected || !selected.prize) {
      selected = { prize: consolation, weight: 1 };
    }

    // 5. 中奖：扣减库存 + 记录
    // 乐观锁：用条件更新 `drawn < stock` 保证并发下不超发。
    // 幸运奖（保底）不设库存上限，无条件扣减（代金券可超发）。
    const prize = selected.prize!;
    if (prize.id === consolation.id) {
      await tx.prize.update({
        where: { id: prize.id },
        data: { drawn: { increment: 1 } },
      });
    } else {
      const updated = await tx.prize.updateMany({
        where: { id: prize.id, drawn: { lt: prize.stock } },
        data: { drawn: { increment: 1 } },
      });

      if (updated.count === 0) {
        // 库存刚好被并发抢完，回退为保底幸运奖（绝不落空）
        await tx.prize.update({
          where: { id: consolation.id },
          data: { drawn: { increment: 1 } },
        });
        await tx.entry.update({
          where: { id: entryId },
          data: { won: true, prizeId: consolation.id },
        });
        await tx.winner.create({
          data: {
            activityId: activityId,
            prizeId: consolation.id,
            entryId,
            name: participant?.name ?? null,
            phone: participant?.phone ?? null,
          },
        });
        return {
          won: true,
          prizeId: consolation.id,
          prizeOrder: consolation.order,
          prizeName: consolation.name,
          prizeIcon: consolation.icon,
          prizeType: consolation.type,
          isPhysical: consolation.type === "PHYSICAL",
        };
      }
    }

    await tx.entry.update({
      where: { id: entryId },
      data: { won: true, prizeId: prize.id },
    });

    // 中奖人姓名/手机号（优先用传入值，省一次事务内查询）
    await tx.winner.create({
      data: {
        activityId: activityId,
        prizeId: prize.id,
        entryId,
        name: participant?.name ?? null,
        phone: participant?.phone ?? null,
      },
    });

    return {
      won: true,
      prizeId: prize.id,
      prizeOrder: prize.order,
      prizeName: prize.name,
      prizeIcon: prize.icon,
      prizeType: prize.type,
      isPhysical: prize.type === "PHYSICAL",
    };
  });
}
