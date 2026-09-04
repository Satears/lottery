import { NextRequest, NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function ok(data: unknown) {
  return json({ success: true, data }, 200);
}

export function fail(message: string, status = 400) {
  return json({ success: false, message }, status);
}

export function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
