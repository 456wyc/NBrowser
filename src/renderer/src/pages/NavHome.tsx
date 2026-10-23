import { useEffect, useRef, useState } from 'react'
import { IPC_CHANNELS } from '@shared/ipc'
import { toNavigableUrl } from '@shared/url'
import { BookmarkGrid } from '../components/BookmarkGrid'
import { WatchlistGrid } from '../components/WatchlistGrid'
import { NotesPanel } from '../components/NotesPanel'
import { TodayVisitsPage } from './TodayVisits'
import { useThemeMode } from '../lib/themeMode'

type Tab = 'bookmarks' | 'watchlist' | 'visits' | 'notes'

interface NavHomeProps {
  onNavigate?: (url: string) => void
}

export function NavHome({ onNavigate }: NavHomeProps) {
  const [activeTab, setActiveTab] = useState<Tab>('bookmarks')
  const [searchText, setSearchText] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  // 本文档的主题跟随：挂载时向主进程对齐 + 订阅广播（只读，绝不 THEME_SET）。
  // 之前移除按钮时把这个 hook 一并删了，导致整个文档没有主题逻辑、永远不跟随切换。
  useThemeMode()

  // Ctrl/Cmd+L 在新标签页没有地址栏可聚焦，由 AddressBar 转发到这里的大搜索框
  useEffect(() => {
    const onFocus = () => searchRef.current?.focus()
    window.addEventListener('navhome:focus-search', onFocus)
    return () => window.removeEventListener('navhome:focus-search', onFocus)
  }, [])

  // 导航首页的搜索：原始输入直接交给主进程统一转换（与地址栏同一套规则与搜索引擎配置）
  const handleSearch = async () => {
    const input = searchText.trim()
    if (!input) return
    if (onNavigate) {
      onNavigate(toNavigableUrl(input))
    } else {
      await window.electronAPI.invoke(IPC_CHANNELS.TABS_NAVIGATE, { url: input })
    }
    setSearchText('')
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* 搜索框 */}
        <div style={styles.searchWrap}>
          <input
            ref={searchRef}
            className="field"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索或输入网址，回车直达"
            style={styles.searchInput}
          />
          <button onClick={handleSearch} className="btn-primary" style={styles.searchBtn}>
            搜索
          </button>
        </div>

        {/* Tab 切换 */}
        <div style={styles.tabs}>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={activeTab === 'bookmarks' ? 'nav-tab active' : 'nav-tab'}
          >
            常用网站
          </button>
          <button
            onClick={() => setActiveTab('watchlist')}
            className={activeTab === 'watchlist' ? 'nav-tab active' : 'nav-tab'}
          >
            自选股
          </button>
          <button
            onClick={() => setActiveTab('visits')}
            className={activeTab === 'visits' ? 'nav-tab active' : 'nav-tab'}
          >
            今日浏览
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={activeTab === 'notes' ? 'nav-tab active' : 'nav-tab'}
          >
            笔记
          </button>
        </div>

        {/* Tab 内容 */}
        <div style={styles.tabContent}>
          {activeTab === 'bookmarks' && <BookmarkGrid onNavigate={onNavigate} />}
          {activeTab === 'watchlist' && <WatchlistGrid />}
          {activeTab === 'visits' && <TodayVisitsPage />}
          {activeTab === 'notes' && (
            <div style={{ height: '100%', minHeight: 0, display: 'flex' }}>
              <NotesPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    background: 'var(--bg-base)',
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  searchWrap: {
    display: 'flex',
    gap: 8,
    padding: '20px 32px 4px',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    height: 34,
    padding: '0 14px',
    borderRadius: 17,
    background: 'var(--bg-crust)',
    fontSize: 13,
  },
  searchBtn: {
    height: 34,
    padding: '0 20px',
    borderRadius: 17,
    fontSize: 13,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    padding: '16px 32px 0',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  tabContent: {
    flex: 1,
    overflow: 'auto',
  },
}
