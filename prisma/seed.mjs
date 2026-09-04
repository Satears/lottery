import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 创建滋补店营销活动（转盘抽奖）
  // 注：主键为自增整数，不手动指定 id
  const activity = await prisma.activity.create({
    data: {
      title: "臻选好礼 · 敬候好运",
      description: "填写信息参与转盘抽奖，赢取燕窝、西洋参等臻选好礼",
      status: "ACTIVE",
      prizes: {
        create: [
          { name: "一等奖", icon: "/prizes/bird-nest-card.webp", stock: 1, probability: 1, type: "PHYSICAL", order: 1 },
          { name: "二等奖", icon: "/prizes/ginseng-card.webp", stock: 2, probability: 3, type: "PHYSICAL", order: 2 },
          { name: "三等奖", icon: "/prizes/bird-nest-congee-card.webp", stock: 3, probability: 5, type: "PHYSICAL", order: 3 },
          { name: "四等奖", icon: "/prizes/herb-soup-card.webp", stock: 20, probability: 20, type: "PHYSICAL", order: 4 },
          { name: "幸运奖", icon: "/prizes/coupon-card.webp", stock: 264, probability: 200, type: "COUPON", order: 5 },
        ],
      },
    },
  });

  console.log("已创建滋补店转盘活动:", activity.title, "| id =", activity.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
