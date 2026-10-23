// sql.js 类型声明
// sql.js 是 SQLite 的 WebAssembly 版本
// 这里声明我们用到的核心 API

declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: typeof Database
  }

  export class Database {
    constructor(data?: ArrayLike<number> | Buffer | null)
    exec(sql: string, params?: any[]): QueryExecResult[]
    run(sql: string, params?: any[]): Database
    prepare(sql: string): Statement
    close(): void
    export(): Uint8Array
  }

  export interface Statement {
    bind(params?: any[]): boolean
    step(): boolean
    get(params?: any[]): any[]
    getColumnNames(): string[]
    free(): boolean
    run(params?: any[]): void
  }

  export interface QueryExecResult {
    columns: string[]
    values: any[][]
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
}
