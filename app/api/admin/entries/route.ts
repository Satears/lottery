import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { adminGuard } from "@/lib/auth";

// 管理端：获取参与名单（支持分页、搜索、导出）
export async function GET(req: NextRequest) {
  if (adminGuard(req)) return adminGuard(req)!;

  const { searchParams } = new URL(req.url);
  const activityIdRaw = searchParams.get("activityId");
  const activityId = activityIdRaw ? Number(activityIdRaw) : NaN;
  const pageRaw = parseInt(searchParams.get("page") || "", 10);
  const pageSizeRaw = parseInt(searchParams.get("pageSize") || "", 10);
  // 防 NaN / 越界（避免 Prisma skip/take 收到非法值抛错）
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 ? Math.min(pageSizeRaw, 200) : 20;
  const keyword = searchParams.get("keyword") || "";
  const exportAll = searchParams.get("export") === "true";

  if (!activityIdRaw || Number.isNaN(activityId)) return fail("缺少活动 ID");

  const where: any = {
    activityId,
    ...(keyword
      ? {
          OR: [
            { name: { contains: keyword } },
            { phone: { contains: keyword } },
          ],
        }
      : {}),
  };

  if (exportAll) {
    const entries = await prisma.entry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { winners: { include: { prize: true } } },
    });
    // 附上奖品名称，方便导出
    const mapped = entries.map((e) => ({
      ...e,
      prizeName: e.winners[0]?.prize?.name || null,
    }));
    return ok(mapped);
  }

  const [total, entries] = await Promise.all([
    prisma.entry.count({ where }),
    prisma.entry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { winners: { include: { prize: true } } },
    }),
  ]);

  const mapped = entries.map((e) => ({
    ...e,
    prizeName: e.winners[0]?.prize?.name || null,
  }));

  return ok({
    total,
    page,
    pageSize,
    entries: mapped,
  });
}

// 管理端：删除单个参与者
export async function DELETE(req: NextRequest) {
  if (adminGuard(req)) return adminGuard(req)!;

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = idRaw ? Number(idRaw) : NaN;
  if (!idRaw || Number.isNaN(id)) return fail("缺少参与者 ID");

  await prisma.entry.delete({ where: { id } }).catch(() => null);
  return ok({ deleted: true });
}
