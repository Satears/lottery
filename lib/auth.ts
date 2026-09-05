import crypto from "crypto";
import { NextRequest } from "next/server";
import { fail } from "./api";

/**
 * 后台认证：签发带过期时间的 HMAC 签名令牌（不暴露明文密码本身）。
 * 密钥复用 CAPTCHA_SECRET（多实例一致即可），无需新增环境变量。
 */

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时有效

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "admin123456";
}

function authSecret(): string {
  return process.env.CAPTCHA_SECRET || "lucky-draw-captcha";
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function hmac(msg: string): string {
  return crypto.createHmac("sha256", authSecret()).update(msg).digest("hex");
}

/** 登录成功后签发令牌：<passwordHash>.<expireAtMs>.<signature> */
export function issueAdminToken(): string {
  const payload = `${sha256(adminPassword())}.${Date.now() + TOKEN_TTL_MS}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [hash, expStr, sig] = parts;

  const expected = hmac(`${hash}.${expStr}`);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  // 令牌必须绑定当前管理员密码，改密后旧令牌立即失效
  return sha256(adminPassword()) === hash;
}

/** 认证守卫：通过返回 null，未通过返回 401 响应 */
export function adminGuard(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = req.headers.get("x-admin-password");
  const token = bearer || header;
  if (verifyAdminToken(token)) return null;
  return fail("未授权，请提供正确的管理密码", 401);
}
