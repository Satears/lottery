import Image from "next/image";

/**
 * 全站品牌 Header：龙泉滋补行
 * - 透明背景的横向品牌 banner（圆形龙泉印记 + "龙泉滋补行"艺术字，PNG 已是 alpha=0 透明）
 * - logo 图本身已含中文"龙泉滋补行"，故不重复渲染中文
 * - logo 正下方居中显示英文 LONGQUAN（字母分散对齐）
 *
 * 与页面主内容水平对齐：使用相同的 max-w-4xl mx-auto 容器 + px-4，
 * Logo 左缘与下方内容卡片左缘处于同一垂直线。
 * sticky top-0 保持在视口顶部，长页面滚动时仍可见。
 */
export default function BrandHeader() {
  return (
    <div className="sticky top-0 z-50 w-full pointer-events-none">
      <div className="max-w-4xl mx-auto px-4 py-4 sm:py-5">
        <div
          className="flex flex-col items-start select-none"
          aria-label="龙泉滋补行"
        >
          {/* logo banner：保持原图 16:9 比例避免变形 */}
          <Image
            src="/brand/longquan-logo.png"
            alt="龙泉滋补行 Logo"
            width={1020}
            height={598}
            priority
            className="w-32 sm:w-40 h-auto aspect-[16/9] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          />
          {/* 英文放在 logo 正下方、左对齐 */}
          <span className="mt-0.5 sm:mt-1 pl-0.5 text-[10px] sm:text-xs text-amber-100/90 font-medium tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            {"LONGQUAN".split("").map((ch, i) => (
              <span
                key={i}
                className="inline-block"
                style={{
                  marginLeft: i === 0 ? 0 : "0.42em",
                  marginRight: "0.42em",
                  letterSpacing: "0.15em",
                }}
              >
                {ch}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}