import { generateCaptcha, signCaptcha } from "@/lib/captcha";

// 强制动态渲染：验证码每次请求都必须重新生成，禁止静态化/缓存
export const dynamic = "force-dynamic";

// 生成验证码
export async function GET() {
  const { svg, answer } = generateCaptcha();
  const salt = Math.random().toString(36).slice(2);
  const sign = signCaptcha(answer, salt);

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
      // 通过自定义 header 传递盐和签名，供前端提交时回传
      "X-Captcha-Salt": salt,
      "X-Captcha-Sign": sign,
    },
  });
}
