import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}