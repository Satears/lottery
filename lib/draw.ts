/**
 * 手机号脱敏：138****1234
 */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

/**
 * 姓名脱敏：两端保留汉字、中间打码。
 *   1字  -> 张三          (无可遮)
 *   2字  -> 张*           (保留首字)
 *   3字  -> 张*三
 *   4字  -> 欧**娜  （首尾汉字 + 中间星）
 */
export function maskName(name: string): string {
  if (!name) return "***";
  const n = name.length;
  if (n === 1) return name;
  if (n === 2) return name.slice(0, 1) + "*";
  return name.slice(0, 1) + "*".repeat(n - 2) + name.slice(-1);
}
