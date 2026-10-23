// 笔记知识库的 RAG 检索：问题向量化后，用余弦相似度从已向量化笔记中取 Top-K。
// 向量已归一化，故点积即余弦相似度。

import type { Database } from 'sql.js'
import { embedText } from './embeddings'

export function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as number[]) : null
  } catch {
    return null
  }
}

/** 已向量化且正文非空的笔记 */
export function getEmbeddedNotes(
  db: Database
): Array<{ id: number; title: string; content: string; embedding: number[] }> {
  const res = db.exec(
    `SELECT id, title, content, embedding_json FROM notes WHERE embedding_json IS NOT NULL AND content <> ''`
  )
  if (!res.length) return []
  const out: Array<{ id: number; title: string; content: string; embedding: number[] }> = []
  for (const row of res[0].values as unknown[][]) {
    const [id, title, content, embedding_json] = row as [number, string, string, string]
    const emb = parseEmbedding(embedding_json)
    if (emb) out.push({ id, title: String(title || ''), content: String(content || ''), embedding: emb })
  }
  return out
}

/** 还没有向量、但正文非空的笔记（用于回填） */
export function getNotesNeedingEmbedding(
  db: Database
): Array<{ id: number; title: string; content: string }> {
  const res = db.exec(
    `SELECT id, title, content FROM notes WHERE (embedding_json IS NULL OR embedding_json = 'null' OR embedding_json = '') AND content <> ''`
  )
  if (!res.length) return []
  return (res[0].values as unknown[][]).map((row) => {
    const [id, title, content] = row as [number, string, string]
    return { id, title: String(title || ''), content: String(content || '') }
  })
}

/** 写入/更新某笔记的向量 */
export function setNoteEmbedding(db: Database, id: number, embedding: number[]): void {
  db.run(`UPDATE notes SET embedding_json = ? WHERE id = ?`, [JSON.stringify(embedding), id])
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // 向量已归一化 → 点积即余弦
}

/**
 * 问题向量化后取 Top-K 最相似笔记。
 * 返回的即为真正喂给 LLM 的上下文，可直接作为可信来源。
 */
export async function retrieveTopK(
  db: Database,
  question: string,
  k: number
): Promise<Array<{ id: number; title: string; content: string }>> {
  const qe = await embedText(question)
  const notes = getEmbeddedNotes(db)
  if (notes.length === 0) return []
  return notes
    .map((n) => ({ ...n, score: cosine(qe, n.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ id, title, content }) => ({ id, title, content }))
}
