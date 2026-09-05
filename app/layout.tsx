import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import BrandHeader from "./_components/BrandHeader";

export const metadata: Metadata = {
  title: "龙泉滋补行 · 幸运抽奖",
  description: "填写信息即可参与抽奖，赢取心动好礼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <BrandHeader />
        {/* 占位：BrandHeader 是 fixed 定位(脱离文档流)，
            需等高占位元素让页面内容不被顶部 logo 覆盖 */}
        <div aria-hidden className="h-28 sm:h-32" />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}