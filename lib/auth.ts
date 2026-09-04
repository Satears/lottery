import { NextRequest } from "next/server";
import { fail } from "./api";

// 简单的密码认证：通过 Authorization: Bearer <password> 或 x-admin-password header
export function requireAdmin(req: NextRequest): boolean {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = req.headers.get("x-admin-password");
  return bearer === ADMIN_PASSWORD || header === ADMIN_PASSWORD;
}

export function adminGuard(req: NextRequest) {
  if (!requireAdmin(req)) {
    return fail("未授权，请提供正确的管理密码", 401);
  }
  return null;
}
