/**
 * 简单的内存滑动窗口限流器
 * 用于防刷：限制同一 IP 在窗口内的提交次数
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// 内存保护：桶数软上限（防伪造海量 IP 打爆内存 → OOM 宕机）
const MAX_BUCKETS = 20000;
// 全局清扫间隔：每 N ms 主动回收过期桶，避免只增不减的内存增长
const SWEEP_MS = 30_000;
let lastSweep = Date.now();

/** 周期清扫 + 容量保护：过期桶删掉，超上限时从最旧开始淘汰 */
function sweep(now: number) {
  const cutoff = now - SWEEP_MS * 2; // 桶内时间戳最旧不超过 2 个清扫周期前(实际窗口由调用方定)
  // 周期清扫：回收整桶已过期(桶内无有效时间戳)的 key
  if (now - lastSweep >= SWEEP_MS) {
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      // 桶里所有时间戳都早于 60s 则视为过期桶，删除
      const latest = bucket.timestamps[bucket.timestamps.length - 1];
      if (latest !== undefined && now - latest > 60_000) {
        buckets.delete(key);
      }
    }
  }
  // 容量保护：仍超上限则清空(降级为不设限, 但已属极端攻击, 至少不 OOM)
  if (buckets.size > MAX_BUCKETS) {
    // 清掉一半最老访问的桶
    let excess = buckets.size - MAX_BUCKETS;
    for (const key of buckets.keys()) {
      if (excess <= 0) break;
      buckets.delete(key);
      excess--;
    }
  }
}

/**
 * 检查是否允许本次请求
 * @param key 限流键（如 IP）
 * @param limit 窗口内最大次数
 * @param windowMs 窗口毫秒数
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  // 只裁剪当前桶的时间戳（避免访问高频 key 时反复全量 filter 的开销只在超过窗口时做一次）
  const arr = bucket.timestamps;
  if (arr.length && arr[0] < cutoff) {
    bucket.timestamps = arr.filter((t) => t > cutoff);
  }

  if (bucket.timestamps.length >= limit) {
    return false; // 超限
  }
  bucket.timestamps.push(now);
  sweep(now);
  return true;
}
