/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // 奖品图标 / 品牌 logo 等静态不变资源 → 长缓存，减轻高峰期回源压力
        // 图片文件名内含业务标识，更新时请改名以破坏缓存
        source: "/:path(prizes|brand)/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
