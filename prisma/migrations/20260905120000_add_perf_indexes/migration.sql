-- 性能索引：按手机号查询（check-winner 无 activityId 时的全表扫描优化）
CREATE INDEX "Entry_phone_idx" ON "Entry"("phone");

-- 性能索引：公示页按 (activityId, createdAt) 排序/过滤，替代原单列索引
DROP INDEX "Winner_activityId_idx";
CREATE INDEX "Winner_activityId_createdAt_idx" ON "Winner"("activityId", "createdAt");
