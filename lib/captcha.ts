import crypto from "crypto";

/**
 * 生成验证码 SVG（4 位数字，带干扰线）
 * 返回 { svg, answer }
 */
export function generateCaptcha(): { svg: string; answer: string } {
  const answer = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 10).toString()
  ).join("");

  const width = 120;
  const height = 44;
  const chars = answer.split("");

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#1a1a2e" rx="8"/>`;

  // 干扰线
  for (let i = 0; i < 4; i++) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    const color = `rgba(129, 140, 248, ${0.3 + Math.random() * 0.4})`;
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`;
  }

  // 干扰点
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    svg += `<circle cx="${x}" cy="${y}" r="${Math.random() * 1.5}" fill="rgba(255,255,255,0.25)"/>`;
  }

  // 字符（随机旋转、颜色、位置）
  chars.forEach((ch, i) => {
    const x = 20 + i * 25 + Math.random() * 6;
    const y = 28 + Math.random() * 8;
    const rotate = (Math.random() - 0.5) * 40;
    const colors = ["#a5b4fc", "#f0abfc", "#6ee7b7", "#fbbf24", "#93c5fd"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const fontSize = 24 + Math.random() * 6;
    svg += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${color}" font-family="Arial, sans-serif" font-weight="bold" transform="rotate(${rotate} ${x} ${y})">${ch}</text>`;
  });

  svg += `</svg>`;
  return { svg, answer };
}

/**
 * 用 HMAC 签名验证码答案，避免服务端存储状态（适配多实例部署）
 * 返回 token，供后续校验
 */
export function signCaptcha(answer: string, salt: string): string {
  return crypto
    .createHmac("sha256", process.env.CAPTCHA_SECRET || "lucky-draw-captcha")
    .update(`${answer}:${salt}`)
    .digest("hex")
    .slice(0, 16);
}

export function verifyCaptcha(answer: string, salt: string, sign: string): boolean {
  const expected = signCaptcha(answer, salt);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sign));
}
