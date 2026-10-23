/**
 * CSV 序列化
 *
 * 规则：
 * - 字段含逗号、双引号、换行时用双引号包裹
 * - 内部双引号转义为两个双引号
 * - 用 \r\n 换行（Excel 兼容）
 * - 输出带 BOM，避免 Excel 打开中文乱码
 */

export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''

  let text = String(value)
  if (text.includes(',') || text.includes('"') || /\r|\n/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines: string[] = []
  lines.push(headers.map(escapeCsvField).join(','))
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','))
  }
  // \ufeff 为 BOM
  return `﻿${lines.join('\r\n')}\r\n`
}
