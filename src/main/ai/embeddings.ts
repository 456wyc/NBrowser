// 本地离线文本向量化（RAG 的 embedding 来源）
// 使用 transformers.js + Xenova/all-MiniLM-L6-v2，全程不依赖任何 LLM API，
// 模型权重首次使用时下载并缓存到 userData/models，之后离线可用。
//
// 注意：强制 wasm 后端，避免依赖 onnxruntime-node 的原生二进制
// （pnpm 默认拦截其构建脚本，原生包可能缺失），wasm 自带无需下载原生组件。

import path from 'node:path'
import { app } from 'electron'

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
export const EMBED_DIM = 384

// transformers.js 是 ESM 包，主进程为 CJS，故用动态 import 在运行时从 node_modules 加载。
// 该包已被 externalize 插件保持外部，不会被打进 bundle，运行时由 Node 直接解析。
type Extractor = (
  text: string,
  opts?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: ArrayLike<number> }>

let extractorPromise: Promise<Extractor> | null = null

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = (await import('@huggingface/transformers')) as any
      // 强制 wasm 后端，规避 onnxruntime-node 原生二进制缺失
      try {
        if (mod.env?.backends?.onnx) mod.env.backends.onnx.backend = 'wasm'
      } catch {
        /* 忽略 */
      }
      mod.env.allowLocalModels = false
      mod.env.cacheDir = path.join(app.getPath('userData'), 'models', 'transformers')
      // 允许通过环境变量指定 HF 镜像（如国内 HF_ENDPOINT），提升首次下载成功率
      if (process.env.HF_ENDPOINT) mod.env.hubUrl = process.env.HF_ENDPOINT
      const extractor = (await mod.pipeline('feature-extraction', MODEL_ID, {
        quantized: true,
      })) as Extractor
      return extractor
    })().catch((err) => {
      extractorPromise = null // 失败后允许下次重试（例如模型下载完成之后）
      throw err
    })
  }
  return extractorPromise
}

/** 将一段文本转成 384 维单位向量（归一化后点积即余弦相似度） */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as ArrayLike<number>)
}
