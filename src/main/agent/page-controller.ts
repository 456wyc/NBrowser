import type { WebContents } from 'electron'
import type { LLMClient } from '../ai/llm-client'
import type { PageAgentEvent } from '@shared/ipc'

/**
 * 页面智能体（最小闭环 PoC）
 *
 * 思路：拿活动标签的 webContents，循环做「感知 → 决策 → 执行」：
 *   1. 感知：用 executeJavaScript 给页面可见的可交互元素打上 data-niu-idx 编号，
 *      返回一份精简的元素清单喂给大模型；
 *   2. 决策：调用 OpenAI 兼容接口（completeJson）让它返回一步动作 JSON；
 *   3. 执行：click / type / scroll / navigate 直接作用在页面 DOM 上；
 *   4. done 时结束并回传总结。
 *
 * 说明：这是「主进程持有 WebContents、可直接操作页面」带来的天然优势 ——
 * 不需要像 Playwright 那样走远程 CDP，也不需要额外的浏览器实例。
 */

export interface PageElement {
  idx: number
  tag: string
  text: string
  name: string
  placeholder: string
  type: string
  role: string
  href: string
}

export interface PageAgentAction {
  thought?: string
  action: 'click' | 'type' | 'scroll' | 'navigate' | 'done'
  idx?: number
  text?: string
  dir?: 'up' | 'down'
  url?: string
  answer?: string
}

export interface PageAgentOptions {
  webContents: WebContents
  llm: LLMClient
  goal: string
  maxSteps?: number
  signal: AbortSignal
  onEvent: (e: PageAgentEvent) => void
}

// 给页面可见的可交互元素打编号并返回精简清单（最多 60 个）
const PERCEIVE_JS = `(() => {
  const SEL = 'a,button,input,textarea,select,[role="button"],[contenteditable="true"],[tabindex]';
  const nodes = Array.from(document.querySelectorAll(SEL));
  const out = [];
  for (const el of nodes) {
    if (el.dataset.niuIdx) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const idx = out.length + 1;
    el.setAttribute('data-niu-idx', String(idx));
    out.push({
      idx,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 40),
      name: el.getAttribute('name') || el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      type: (el.getAttribute('type') || '').toLowerCase(),
      role: el.getAttribute('role') || '',
      href: el.getAttribute('href') || ''
    });
    if (out.length >= 60) break;
  }
  return out;
})()`

async function perceive(wc: WebContents): Promise<PageElement[]> {
  try {
    if (wc.isDestroyed()) return []
    const res = await wc.executeJavaScript(PERCEIVE_JS)
    return Array.isArray(res) ? (res as PageElement[]) : []
  } catch {
    return []
  }
}

async function executeAction(
  wc: WebContents,
  action: PageAgentAction
): Promise<string> {
  if (wc.isDestroyed()) return '页面已关闭'
  const a = action.action
  if (a === 'navigate') {
    const url = action.url
    if (!url) return '缺少目标网址'
    try {
      await wc.loadURL(url)
      return `已导航到 ${url}`
    } catch (err) {
      return '导航失败：' + (err instanceof Error ? err.message : String(err))
    }
  }
  if (a === 'scroll') {
    const dy = action.dir === 'up' ? -400 : 400
    await wc.executeJavaScript(`window.scrollBy(0, ${dy}); 'ok'`)
    return `已向${action.dir === 'up' ? '上' : '下'}滚动`
  }
  // click / type 需要先把动作脚本拼好（idx 来自模型，必须转成安全整数）
  const idx = Number(action.idx)
  if (!Number.isInteger(idx) || idx <= 0) return '无效的元素编号'

  if (a === 'click') {
    const js = `(async () => {
      const el = document.querySelector('[data-niu-idx="${idx}"]');
      if (!el) return '元素不存在';
      el.scrollIntoView({ block: 'center' });
      el.click();
      return '已点击';
    })()`
    try {
      return String(await wc.executeJavaScript(js))
    } catch (err) {
      return '点击失败：' + (err instanceof Error ? err.message : String(err))
    }
  }

  // type：兼容 React 受控组件（用原生 value setter 再派发 input 事件）
  const text = (action.text ?? '').replace(/`/g, '\\`')
  const js = `(async () => {
    const el = document.querySelector('[data-niu-idx="${idx}"]');
    if (!el) return '元素不存在';
    const val = \`${text}\`;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.focus();
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.textContent = val;
      el.focus();
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    return '已输入';
  })()`
  try {
    return String(await wc.executeJavaScript(js))
  } catch (err) {
    return '输入失败：' + (err instanceof Error ? err.message : String(err))
  }
}

export async function runPageAgent(opts: PageAgentOptions): Promise<void> {
  const { webContents: wc, llm, goal, onEvent, signal } = opts
  const maxSteps = opts.maxSteps && opts.maxSteps > 0 ? opts.maxSteps : 10

  if (!wc || wc.isDestroyed()) {
    onEvent({ type: 'error', message: '页面已关闭，无法操作' })
    return
  }

  const history: string[] = []

  for (let step = 1; step <= maxSteps; step++) {
    if (signal.aborted) {
      onEvent({ type: 'error', message: '已停止' })
      return
    }

    const url = wc.getURL()
    const elements = await perceive(wc)
    onEvent({ type: 'perceive', step, elementsCount: elements.length })

    const system =
      '你是浏览器操作助手，通过编号控制网页。用户目标：' +
      goal +
      '。\n当前页面：' +
      url +
      '\n每步只能选择一个动作，严格只返回如下 JSON（不要解释、不要多余字段）：\n' +
      '{"thought":"简要思路","action":"click|type|scroll|navigate|done","idx":数字,"text":"要输入的内容(仅 type)","dir":"up|down(仅 scroll)","url":"目标网址(仅 navigate)","answer":"完成总结(仅 done)"}\n' +
      '若目标已达成，用 done 并返回 answer。不要一次做多步。'

    const user =
      '页面可见交互元素（最多 60，#idx 为编号）：\n' +
      (elements.length
        ? elements
            .map((e) => `#${e.idx} <${e.tag}> ${e.text || e.name || e.placeholder || e.href}`)
            .join('\n')
        : '（当前无可交互元素）') +
      '\n\n历史动作：\n' +
      (history.length ? history.join('\n') : '（无）') +
      '\n\n下一步？'

    let action: PageAgentAction
    try {
      action = (await llm.completeJson(system, user)) as PageAgentAction
    } catch (err) {
      onEvent({
        type: 'error',
        message: '模型调用失败：' + (err instanceof Error ? err.message : String(err)),
      })
      return
    }

    if (action.action === 'done') {
      onEvent({ type: 'done', step, answer: action.answer ?? '', finalUrl: wc.getURL() })
      return
    }

    const result = await executeAction(wc, action)
    history.push(`#${step} ${action.action} idx=${action.idx ?? ''} -> ${result}`)
    onEvent({
      type: 'action',
      step,
      action: action.action,
      target: String(action.idx ?? ''),
      thought: action.thought ?? '',
      result,
    })

    // 等待页面稳定（导航/SPA 渲染）后再进入下一步感知
    await new Promise((r) => setTimeout(r, 1200))
  }

  onEvent({
    type: 'done',
    step: maxSteps,
    answer: '已达到最大步数仍未明确完成，请检查页面或继续指示。',
    finalUrl: wc.isDestroyed() ? '' : wc.getURL(),
  })
}
