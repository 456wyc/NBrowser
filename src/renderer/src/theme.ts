/**
 * 设计令牌（单一事实来源）
 *
 * 渲染进程所有内联样式引用这里；对应的 CSS 变量（--xxx）在 styles/global.css 的
 * :root 中定义，两者的取值必须保持一致。hover / active / focus 这类无法用内联
 * 表达的状态统一写在 global.css 的 class 里。
 *
 * 配色沿用 Catppuccin Mocha，已与既有界面（#1e1e2e / #313244 / #89b4fa …）一致。
 */

export const color = {
  // 背景层次（从最深到最浅）
  crust: '#11111b',
  base: '#1e1e2e',
  mantle: '#181825',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  // 文字
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  overlay0: '#6c7086',
  overlay1: '#7f849c',
  // 主题色
  blue: '#89b4fa',
  mauve: '#cba6f7',
  green: '#a6e3a1',
  red: '#f38ba8',
  yellow: '#f9e2af',
  peach: '#fab387',
  teal: '#94e2d5',
  sky: '#89dceb',
  // 涨跌语义色（A 股红涨绿跌，独立于主题的 --red/--green）
  up: '#ef4444',
  down: '#22c55e',
} as const

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
} as const

export const shadow = {
  sm: '0 1px 2px rgba(0,0,0,0.30)',
  md: '0 6px 20px rgba(0,0,0,0.35)',
  lg: '0 12px 40px rgba(0,0,0,0.45)',
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
} as const

export const font = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
} as const

/** 内联样式里引用 CSS 变量的便捷函数（保持与 global.css 同步） */
export const v = {
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  blue: 'var(--blue)',
  text: 'var(--text)',
  subtext0: 'var(--subtext0)',
  overlay0: 'var(--overlay0)',
  surface0: 'var(--surface0)',
  surface1: 'var(--surface1)',
  bgCrust: 'var(--bg-crust)',
  bgBase: 'var(--bg-base)',
  bgMantle: 'var(--bg-mantle)',
  rSm: 'var(--r-sm)',
  rMd: 'var(--r-md)',
  rLg: 'var(--r-lg)',
  shadowMd: 'var(--shadow-md)',
  font: 'var(--font)',
} as const

/** 半透明叠加色（基于 RGB 分量，切主题时自动跟随） */
export const soft = {
  blue: (a: number) => `rgba(var(--blue-rgb), ${a})`,
  green: (a: number) => `rgba(var(--green-rgb), ${a})`,
  red: (a: number) => `rgba(var(--red-rgb), ${a})`,
  yellow: (a: number) => `rgba(var(--yellow-rgb), ${a})`,
  up: (a: number) => `rgba(var(--up-rgb), ${a})`,
  down: (a: number) => `rgba(var(--down-rgb), ${a})`,
} as const
