# 🎡 幸运转盘抽奖系统

一个高级感设计的转盘抽奖网站（滋补店「龙泉滋补行」营销场景）。**后端预判开奖** + Canvas 转盘动画演示，基于 **Next.js 14 + Prisma + PostgreSQL**，可直接部署到 Railway。

## 功能特性

- 🎨 **高级感前端**：深红暖金主题 + 玻璃拟态 + 流光动效，移动端适配
- 🧭 **全站品牌 Header**：logo + 品牌名常驻顶部，透明无白底，与内容区对齐
- 🎡 **转盘抽奖**：填表后进入转盘，动画停在**后端已预判**的结果扇区
- 🎯 **后端预判开奖**：提交时后端按库存 + 概率权重在**事务内**开奖，转盘只是"演"给用户看（防刷、中奖率可控）
- 📦 **库存管理**：每个奖品独立库存，事务乐观锁扣减防超发
- 🛟 **保底机制**：幸运奖（COUPON 兜底档）永不售罄，其它奖品耗尽时自动回退幸运奖，**绝不出现"谢谢参与"**
- 🏆 **奖品类型**：`PHYSICAL` 实物奖（可填收货地址）+ `COUPON` 优惠券/代金券（到店核销）
- 🔒 **防刷三件套**：同一手机号仅可参与一次 + 图形验证码（HMAC 签名）+ IP 限流（内存 Map 带过期清扫，防内存泄漏）
- 🏅 **中奖公示页**：按 一等奖→幸运奖 分档排序公示，**大屏 5 秒自动轮询刷新**，实时时间戳
- 📱 **中奖查询**：`/api/check-winner` 支持手机号查询是否中奖（姓名/手机号均已脱敏）
- 📊 **管理后台**：活动设置（库存/权重/类型）、参与名单（搜索/分页/**CSV 导出含中奖列**）、中奖名单（含收货地址）
- 🔐 **密码认证**：`ADMIN_PASSWORD` 保护后台，适合营销活动场景
- ⚡ **性能优化**：活动/名单接口内存缓存、静态图片资源长缓存（`immutable`）、IP 限流防泄漏

## 技术栈

- **框架**：Next.js 14 (App Router) + React 18 + TypeScript
- **样式**：Tailwind CSS 3
- **数据库**：PostgreSQL + Prisma 5 ORM（含 migration）
- **部署**：Railway（Docker，见 `Dockerfile` + `railway.json`）

## 目录结构

```
├── app/
│   ├── page.tsx                  # 参与页（填表 → 转盘）
│   ├── winners/page.tsx          # 中奖公示页（分档排序 + 大屏轮询）
│   ├── admin/
│   │   ├── login/page.tsx        # 后台登录
│   │   └── page.tsx              # 后台主界面（活动/名单/中奖/CSV 导出）
│   ├── _components/BrandHeader.tsx # 全站品牌 Header
│   ├── api/
│   │   ├── activity/route.ts     # GET 活动配置 / POST 参与抽奖
│   │   ├── captcha/route.ts      # 图形验证码
│   │   ├── winners/route.ts      # 中奖名单（分档排序）
│   │   ├── check-winner/route.ts # 手机号查中奖
│   │   └── admin/                # 登录 / 活动 / 名单 / 中奖
│   ├── globals.css
│   └── layout.tsx
├── lib/
│   ├── spin.ts      # 抽奖核心逻辑（事务预判 + 扣库存 + 保底）
│   ├── draw.ts      # 姓名/手机号脱敏工具
│   ├── captcha.ts   # 验证码生成与 HMAC 签名
│   ├── ratelimit.ts # IP 限流（带过期清扫）
│   ├── api.ts       # 响应工具 / 取 IP
│   ├── auth.ts      # 后台认证守卫
│   └── prisma.ts    # Prisma 单例客户端
├── prisma/
│   ├── schema.prisma
│   ├── migrations/               # SQL migration
│   └── seed.mjs                  # 示例数据
├── public/
│   ├── bg/            # 背景图
│   ├── brand/         # 品牌 logo
│   └── prizes/        # 奖品图（card/wheel，长缓存）
├── test/              # 压测脚本（loadtest*.mjs，不进入镜像）
├── Dockerfile         # Railway 多阶段构建
├── railway.json       # Railway 配置
└── package.json
```

## 本地开发

```bash
npm install

# 复制并修改环境变量
cp .env.example .env

# 初始化 / 同步数据库 schema
npx prisma migrate dev        # 或首次建库：npx prisma db push

# 可选：导入示例活动数据
npm run db:seed

# 启动开发服务器（默认 3000）
npm run dev
```

本地访问：
- 参与页：<http://localhost:3000>
- 中奖公示：<http://localhost:3000/winners>
- 管理后台：<http://localhost:3000/admin>
- 后台密码：环境变量 `ADMIN_PASSWORD`（未设时默认 `admin123456`，**生产务必改为强密码**）

## 生产构建与本地运行

```bash
npm run build        # prisma generate + next build
npm start            # next start
```

## 部署到 Railway

### 1. 推送到 GitHub

本项目采用 **Dockerfile 部署**（`railway.json` 已配置 builder=DOCKERFILE）。将仓库推送到 GitHub，在 Railway **New → Deploy from GitHub repo** 选择该仓库即可。

### 2. 添加 PostgreSQL

Railway **New → Database → Add PostgreSQL**，会自动注入 `DATABASE_URL`。

### 3. 配置环境变量（Railway Variables 面板）

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `${{Postgres.DATABASE_URL}}` 引用 |
| `ADMIN_PASSWORD` | 后台管理密码（务必强密码） | 你的强密码 |
| `CAPTCHA_SECRET` | 验证码 HMAC 密钥（多实例须一致） | 随机长字符串 |

> 若需要本地 / 测试环境密钥样例，见 `.env.example`。**真实 `.env` 已被 `.gitignore` 与 `.dockerignore` 双重排除，绝不会进入镜像或仓库。**

### 4. 数据库迁移

`Dockerfile` 的启动命令会在应用启动前自动执行 `prisma migrate deploy` 应用迁移，无需手动操作。

### 5. 初始化活动数据（可选）

```bash
railway run npm run db:seed
```

或登录后台在"活动设置"中手动创建活动并设为"进行中"。

### 本地 SQLite 说明（如有）

> 本项目当前使用 **PostgreSQL**。若曾以 SQLite 本地运行，请确认 `.env` 中 `DATABASE_URL` 指向 PostgreSQL，并将 `prisma/schema.prisma` 的 `provider` 统一为 `"postgresql"` 后再迁移/部署。

## 抽奖规则（后端预判）

1. 用户填写姓名 + 手机号 → 校验手机号唯一 + 图形验证码 + IP 限流
2. 后端在**单事务**内按 一等奖→幸运奖 顺序、结合各奖品剩余库存与 `probability` 权重预判一个结果
3. 实物奖用 `updateMany` 乐观锁（`drawn < stock`）扣减防超发；幸运奖（COUPON 兜底）可超发兜底
4. 前端 Canvas 转盘播放动画并停在预判扇区，随后弹窗庆祝 / 提示
5. 转盘动画结束后，中奖信息写库并同步到公示页 / 查询接口

## 中奖公示 & 大屏

`/winners` 页面按奖品档位（一等→幸运奖）分组排序展示中奖名单（姓名/手机号脱敏），并**每 5 秒静默轮询**更新。空档显示"本档尚未开出"。适合投放到实体店大屏。

## 压测脚本

`test/` 下提供高保真压测脚本（服务需已启动，默认 `http://localhost:3001`，可用 `--url` 覆盖）：

```bash
# 真实抽奖压测：走完整验证码 + POST /api/activity，会真实扣库存
node test/loadtest-draw.mjs

# 高并发连接复用压测（默认 GET /api/activity，测吞吐上限）
node test/loadtest-keepalive.mjs --concurrency 200 --requests 5000
```

> 详细调优结论见 `性能测试与调优报告.md`，部署前检查见 `生产部署检查报告.md`。
