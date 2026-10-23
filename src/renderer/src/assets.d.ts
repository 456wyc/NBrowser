// Vite 静态资源导入类型声明（tsconfig 未启用 vite/client，这里手动声明）
declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.ico' {
  const src: string
  export default src
}
