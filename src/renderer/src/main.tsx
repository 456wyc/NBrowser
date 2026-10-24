import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { NavHome } from './pages/NavHome'
import { PopoutShell } from './pages/PopoutShell'
import { PetApp } from './pages/PetApp'
import './styles/global.css'

/**
 * preload 未生效时的错误面板
 *
 * preload 会按页面来源决定是否暴露 electronAPI（详见 preload/index.ts）。
 * 一旦判断失误，界面会白屏且不易察觉，这里显式兜底提示。
 */
function PreloadError() {
  return (
    <div style={styles.wrap}>
      <div style={styles.box}>
        <div style={styles.title}>界面未能初始化</div>
        <div style={styles.desc}>
          没有检测到 <code style={styles.code}>window.electronAPI</code>，preload 脚本未生效。
        </div>
        <div style={styles.kv}>
          <span style={styles.key}>当前地址</span>
          <span style={styles.val}>{location.href}</span>
        </div>
        <div style={styles.hint}>
          排查方向：
          <ol style={styles.ol}>
            <li>确认是执行了 npm install / 完整安装了依赖</li>
            <li>确认 preload 已构建：out/preload/index.js 存在</li>
            <li>确认页面来源被判定为可信（localhost / file 下的 renderer 页面）</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

/**
 * 极简 hash 路由（不引入 react-router）
 *
 * - 默认：渲染完整浏览器外壳（App）
 * - #/nav：只渲染导航首页（NavHome），用于「新标签页」的内容区。
 *   这样标签里不会再递归渲染一整套侧边栏 / 标签栏外壳。
 * - #/popout?tab=<id>：只渲染独立窗口外壳（PopoutShell），
 *   一条地址栏 + 网页区占位，真正的网页由主进程挂到这个 OS 窗口上。
 * - #/pet：AI 桌宠浮窗（透明无边框小窗口，只有吉祥物 + 聊天面板）。
 */
function pickRoot() {
  if (!window.electronAPI) return <PreloadError />
  if (location.hash.startsWith('#/popout')) return <PopoutShell />
  if (location.hash.startsWith('#/pet')) return <PetApp />
  return location.hash.startsWith('#/nav') ? <NavHome /> : <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{pickRoot()}</React.StrictMode>
)

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-base)',
    color: 'var(--text)',
    fontFamily: 'system-ui, sans-serif',
  },
  box: {
    maxWidth: 560,
    padding: 24,
    borderRadius: 10,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--red)',
  },
  title: { fontSize: 17, fontWeight: 600, color: 'var(--red)', marginBottom: 10 },
  desc: { fontSize: 13, lineHeight: 1.7, color: 'var(--text)' },
  code: {
    background: 'var(--surface0)',
    padding: '1px 5px',
    borderRadius: 4,
    color: 'var(--blue)',
  },
  kv: { display: 'flex', gap: 8, marginTop: 12, fontSize: 12 },
  key: { color: 'var(--overlay0)', flexShrink: 0 },
  val: { color: 'var(--subtext0)', wordBreak: 'break-all' },
  hint: { marginTop: 14, fontSize: 12, color: 'var(--subtext0)', lineHeight: 1.7 },
  ol: { margin: '6px 0 0', paddingLeft: 20 },
}
