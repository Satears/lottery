import Image from "next/image";

/**
 * 全站品牌 Header：龙泉滋补行
 *
 * - fixed top-0 真正固定在视口顶部（脱离文档流，长页面滚动时持续可见）
 * - 透明背景，无遮罩覆盖（让"焊死"在顶部，而非"悬浮"在内容上方）
 * - logo 图本身已含中文"龙泉滋补行"艺术字，故不重复渲染中文
 * - logo 正下方居中显示英文 LONGQUAN（字母分散对齐）
 *
 * 布局约定：layout.tsx 中紧跟 BrandHeader 之后会渲染一个等高占位元素，
 * 以避免 fixed 头部覆盖页面内容顶部。
 */
export default function BrandHeader() {
  return (
    <div className="fixed top-0 inset-x-0 z-50 w-full pointer-events-none">
      <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
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
            className="w-32 sm:w-40 h-auto aspect-[16/9] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
          />
          {/* 英文放在 logo 正下方、左对齐 */}
          <span className="mt-0.5 sm:mt-1 pl-0.5 text-[10px] sm:text-xs text-amber-100/95 font-medium tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
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