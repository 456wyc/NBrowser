/**
 * Copilot 输出层合规兜底（纯函数）
 *
 * 系统提示里的合规红线是「软约束」，这里做最后一道「硬检测」：
 * 最终回复中若出现强投资建议句式（建议买入/目标价/预计涨到…），
 * 自动追加免责声明。只追加、不改写——不误伤正常回答，
 * 又保证涉及建议时用户一定看得到风险提示。
 */

const ADVICE_PATTERNS: RegExp[] = [
  /建议(买入|卖出|加仓|减仓|清仓|抄底|止损|止盈)/,
  /目标价/,
  /预计.*(涨|跌)到/,
  /(可以|不妨|可考虑)(考虑|尝试|一下)?(买入|卖出|加仓|减仓|清仓)/,
]

const DISCLAIMER = '\n\n> ⚠️ 以上内容由 AI 生成，仅供参考，不构成投资建议。投资决策请自行判断并注意风险。'

/** 检测文本是否包含强投资建议句式 */
export function containsAdvice(text: string): boolean {
  if (!text) return false
  return ADVICE_PATTERNS.some((re) => re.test(text))
}

/** 需要时追加免责声明（不含建议句式则原文返回） */
export function appendDisclaimerIfNeeded(text: string): string {
  if (!text) return text
  return containsAdvice(text) ? `${text}${DISCLAIMER}` : text
}
