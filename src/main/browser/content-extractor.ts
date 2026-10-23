import type { WebContents } from 'electron'

/**
 * 从页面抽取到的正文
 */
export interface PageContent {
  url: string
  title: string
  text: string
  links: { text: string; href: string }[]
}

// 注入脚本返回的原始结构
interface RawExtraction {
  title: string
  text: string
}

// 抓取上限（字符）。超过后由 AiAnalyzer 再做二次截断
const MAX_EXTRACT_LENGTH = 20000

/**
 * 在指定 WebContents 中执行脚本，抽取页面正文。
 *
 * 策略（启发式，不引入第三方依赖）：
 * 1. 优先取语义化正文容器（article / main / [role=main] / 常见内容 class）
 * 2. 退化为 body
 * 3. 克隆节点后移除脚本、样式、导航等噪音节点，再取 innerText
 * 4. 压缩空行，截断到 MAX_EXTRACT_LENGTH
 *
 * 说明：executeJavaScript 在隔离世界执行，不受页面 CSP 限制。
 */
export async function extractPageContent(
  webContents: WebContents
): Promise<PageContent> {
  if (!webContents || webContents.isDestroyed()) {
    throw new Error('页面已关闭，无法抓取内容')
  }

  const url = webContents.getURL()
  const raw = await webContents.executeJavaScript(EXTRACT_SCRIPT, true)

  const title = typeof raw?.title === 'string' ? raw.title.trim() : webContents.getTitle()
  const text = typeof raw?.text === 'string' ? raw.text : ''
  const links = Array.isArray(raw?.links)
    ? raw.links
        .filter((l: any) => l && typeof l.href === 'string' && l.href.startsWith('http'))
        .map((l: any) => ({ text: typeof l.text === 'string' ? l.text : '', href: l.href }))
        .slice(0, 200)
    : []

  return {
    url,
    title: title || url,
    text: text.slice(0, MAX_EXTRACT_LENGTH),
    links,
  }
}

const EXTRACT_SCRIPT = `(function () {
  var NOISE = 'script,style,noscript,svg,canvas,iframe,nav,footer,header,aside,form,button,input,select,textarea';

  function pickContainer() {
    var selectors = [
      'article',
      'main',
      '[role="main"]',
      '#content',
      '.content',
      '.article-content',
      '.post-content',
      '.detail-content',
      '.news-content',
      '#article',
      '.article',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.innerText && el.innerText.trim().length > 200) return el;
    }
    return document.body;
  }

  function cleanText(s) {
    return s
      .replace(/\\u00a0/g, ' ')
      .replace(/[ \\t]+/g, ' ')
      .replace(/\\n{3,}/g, '\\n\\n')
      .trim();
  }

  function pickLinks() {
    try {
      return Array.prototype.slice
        .call(document.querySelectorAll('a[href]'))
        .map(function (a) {
          return { text: (a.innerText || a.textContent || '').trim(), href: a.href };
        })
        .filter(function (x) {
          return x.href && x.href.indexOf('http') === 0;
        })
        .slice(0, 200);
    } catch (e) {
      return [];
    }
  }

  try {
    var container = pickContainer();
    if (!container) return { title: document.title || '', text: '', links: pickLinks() };

    var clone = container.cloneNode(true);
    var noise = clone.querySelectorAll(NOISE);
    for (var j = 0; j < noise.length; j++) {
      var n = noise[j];
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }

    var text = cleanText(clone.innerText || clone.textContent || '');
    return { title: document.title || '', text: text, links: pickLinks() };
  } catch (e) {
    // 极端情况下退化为整页文本
    try {
      return {
        title: document.title || '',
        text: cleanText(document.body.innerText || ''),
        links: pickLinks(),
      };
    } catch (e2) {
      return { title: '', text: '', links: [] };
    }
  }
})()`
