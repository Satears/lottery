import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";

// 管理端登录校验
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = body?.password;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";

  if (!password || password !== ADMIN_PASSWORD) {
    return fail("密码错误", 401);
  }

  return ok({ token: password });
}
