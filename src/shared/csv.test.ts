import { describe, it, expect } from 'vitest'
import { escapeCsvField, toCsv } from './csv'

describe('escapeCsvField', () => {
  it('普通字段不包裹引号', () => {
    expect(escapeCsvField('600519.SH')).toBe('600519.SH')
    expect(escapeCsvField(123)).toBe('123')
  })

  it('含逗号时包裹引号', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
  })

  it('含双引号时包裹并转义', () => {
    expect(escapeCsvField('他说"涨"了')).toBe('"他说""涨""了"')
  })

  it('含换行时包裹引号', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"')
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"')
  })

  it('null / undefined 输出空串', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('数字 0 不被丢掉', () => {
    expect(escapeCsvField(0)).toBe('0')
  })
})

describe('toCsv', () => {
  it('输出表头与数据行', () => {
    const csv = toCsv(['a', 'b'], [[1, 2]])
    expect(csv).toBe('﻿a,b\r\n1,2\r\n')
  })

  it('带 BOM 以便 Excel 正确识别 UTF-8', () => {
    expect(toCsv(['a'], [[]]).startsWith('﻿')).toBe(true)
  })

  it('复杂字段被正确转义', () => {
    const csv = toCsv(['标题'], [['含,逗号 与 "引号"']])
    expect(csv).toBe('﻿标题\r\n"含,逗号 与 ""引号"""\r\n')
  })

  it('空数据只输出表头', () => {
    expect(toCsv(['a', 'b'], [])).toBe('﻿a,b\r\n')
  })
})
