/**
 * 策略生成提示词
 * 把用户自然语言目标转为结构化、可被回测引擎解释执行的规则配置（rule_config）。
 *
 * 合规红线（与现有 AI 分析一致）：
 * - 不预测价格、不给直接买卖建议；
 * - 这里做的是「规则的条件化描述」——用户自己决定要不要执行，工具只负责把想法转成可回测的参数。
 */

const BASE = `你是一个量化策略助手。你的任务：把用户用自然语言描述的交易想法，转成一份结构化、可回测的规则配置 JSON。

严格遵守以下规则：
1. 只输出 JSON，不要任何解释、Markdown 代码块标记或其他文字。
2. 你必须依据下方给出的指标类型与字段，生成可被程序解释的规则；不要发明 JSON 里没有的字段。
3. 中文填写 description 与每个条件的 label（label 用人话描述该条件，如"5日均线上穿20日均线"）。
4. 如果用户目标模糊，按最常见、稳健的量化做法补全参数，并在 description 中说明你的假设。
5. 风险参数（risk）必须给出合理默认值：止损 stopLossPct 建议 5~10，止盈 takeProfitPct 建议 15~30，仓位 positionPct 建议不超过 30。
6. 你不是给出投资建议，而是把用户的想法「参数化」；description 中明确写"以下为策略规则描述，不构成投资建议"。`

const SCHEMA = `输出 JSON 结构：
{
  "title": "string // 策略标题，不超过 20 字",
  "config": {
    "symbols": ["string"], // 标的代码数组，如 ["600519"]；用户未指定则填空数组，由调用方填充
    "period": "day", // 固定用 "day"
    "entry": {
      "logic": "and" | "or",
      "conditions": [ /* 入场条件，见下方条件说明 */ ]
    },
    "exit": {
      "logic": "and" | "or",
      "conditions": [ /* 出场条件 */ ]
    },
    "risk": {
      "stopLossPct": number,   // 止损百分比，正数
      "takeProfitPct": number, // 止盈百分比，正数
      "maxHoldDays": number,    // 可选，最大持有天数
      "positionPct": number     // 仓位比例 0~100
    },
    "description": "string // 人话说明策略逻辑与假设，含'不构成投资建议'字样"
  }
}

条件（conditions 数组元素）类型与字段：
{
  "type": "ma_cross" | "price_cross_ma" | "price_breakout" | "rsi" | "volume_surge" | "volume_shrink" | "macd_cross" | "kdj_cross" | "boll" | "change_pct" | "consecutive" | "ma_alignment",
  "direction": "golden" | "death" | "above" | "below" | "break_high" | "break_low" | "break_upper" | "break_lower" | "up" | "down" | "bull" | "bear" | "overbought" | "oversold",
  "label": "string",
  "fast": number,     // ma_cross 快线 / macd_cross 快线(12) / ma_alignment 短均线(5)
  "slow": number,     // ma_cross 慢线 / macd_cross 慢线(26) / ma_alignment 长均线(20)
  "signalPeriod": number, // macd_cross 信号线周期(9)
  "maPeriod": number, // price_cross_ma 均线周期
  "bollPeriod": number, // boll 均线周期(20)
  "mult": number,     // boll 标准差倍数(2)
  "lookback": number, // price_breakout 回看天数
  "days": number,     // consecutive 连续天数(3)
  "threshold": number // rsi 阈值(70/30)、volume_surge 量比(2)、volume_shrink 量比(0.5)、change_pct 涨跌幅%(3)
}

各类型含义与 direction 取值：
- ma_cross 均线交叉：golden 金叉 / death 死叉（fast/slow）
- price_cross_ma 价格穿越均线：above 站上 / below 跌破（maPeriod）
- price_breakout 突破 N 日高低：break_high / break_low（lookback）
- rsi RSI 指标：overbought 高于阈值 / oversold 低于阈值（threshold 70/30）
- volume_surge 放量：量比达到 threshold 倍（如 2）
- volume_shrink 缩量：量比低于 threshold 倍（如 0.5）
- macd_cross MACD 交叉：golden 金叉 / death 死叉（fast/slow/signalPeriod）
- kdj_cross KDJ 交叉：golden 金叉 / death 死叉（9,3,3 固定）
- boll 布林带：break_upper 突破上轨 / break_lower 跌破下轨（bollPeriod/mult）
- change_pct 当日涨跌幅：up 涨幅≥threshold / down 跌幅≥threshold（threshold 为百分比）
- consecutive 连续 N 日同向：up 连涨 / down 连跌（days）
- ma_alignment 均线排列：bull 多头排列 / bear 空头排列（fast/slow）

条件示例：
- 金叉入场：{ "type":"ma_cross", "direction":"golden", "fast":5, "slow":20, "label":"5日均线上穿20日均线" }
- 跌破均线离场：{ "type":"price_cross_ma", "direction":"below", "maPeriod":60, "label":"收盘价跌破60日均线" }
- 突破新高入场：{ "type":"price_breakout", "direction":"break_high", "lookback":20, "label":"价格突破20日最高" }
- RSI 超卖反弹：{ "type":"rsi", "direction":"oversold", "threshold":30, "label":"RSI 低于 30" }
- MACD 金叉：{ "type":"macd_cross", "direction":"golden", "fast":12, "slow":26, "signalPeriod":9, "label":"MACD 金叉" }
- 连跌 3 天抄底：{ "type":"consecutive", "direction":"down", "days":3, "label":"连续3天下跌" }
- 大跌止损离场：{ "type":"change_pct", "direction":"down", "threshold":5, "label":"单日跌幅超5%" }`

export function getStrategySystemPrompt(): string {
  return `${BASE}\n\n${SCHEMA}`
}

export function getStrategyUserPrompt(
  goal: string,
  symbols: string[] | undefined,
  period: string
): string {
  const symbolHint = symbols && symbols.length > 0
    ? `\n用户指定的标的池：${symbols.join(', ')}（请填入 config.symbols）。`
    : '\n用户未指定标的，config.symbols 填空数组，symbols 由用户后续补充。'
  return `请把下面的交易想法转成策略规则配置：

【用户目标】
${goal}

周期：${period}。${symbolHint}

请按要求只输出 JSON。`
}
