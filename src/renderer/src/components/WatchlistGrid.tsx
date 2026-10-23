import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IPC_CHANNELS,
  type WatchlistItem,
  type WatchlistGroup,
  type StockSearchResult,
} from '@shared/ipc'
import { useQuotes } from '../hooks/useQuotes'
import { useToast } from '../hooks/useToast'
import { normalizeSymbol, eastmoneyQuoteUrl } from '@shared/stock-market'

const GROUP_ALL = -1
const GROUP_UNGROUPED = 0

/**
 * 导航首页的「自选股」Tab：与常用网站同款的可视化管理。
 * - 搜索添加（代码或名称，300ms 防抖，与侧栏自选股同源）
 * - 卡片悬停 × 删除、拖到分组 chip 上移动分组
 * - 分组 chip 条：全部 / 未分组 / 自定义分组（✎ 重命名、× 删除）/ ＋新建分组；智能分组只做筛选
 * - 点击卡片 → 当前标签直达东方财富行情页
 * - 任何改动经主进程 `watchlist:updated` 广播，与侧栏自选股面板实时同步
 */
export function WatchlistGrid() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<number>(GROUP_ALL)
  const { quotes } = useQuotes()
  const { toast, showToast } = useToast()

  // 搜索添加
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 分组管理
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 拖拽
  const [dragSymbol, setDragSymbol] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<number | null>(null)
  // 悬停的分组（显示 chip 内的 ✎/× 操作）
  const [hoverGroup, setHoverGroup] = useState<number | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [w, g] = await Promise.all([
          window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GET_ALL, {}),
          window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUPS_GET, {}),
        ])
        setItems(w.items)
        setGroups(g.groups)
      } catch (err) {
        console.error('Failed to load watchlist:', err)
      }
    })()
  }, [])

  // 任何来源（本页 / 侧栏）的改动都经广播同步
  useEffect(() => {
    const unsub = window.electronAPI.onWatchlistUpdated((payload) => {
      setItems(payload.items)
      setGroups(payload.groups)
    })
    return unsub
  }, [])

  // 搜索防抖（排除已添加）
  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setSearchOpen(false)
      return
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SEARCH, { keyword: kw })
        const exist = new Set(items.map((i) => normalizeSymbol(i.symbol)))
        setResults((res.results as StockSearchResult[]).filter((r) => !exist.has(r.symbol)))
        setSearchOpen(true)
      } catch {
        setResults([])
      }
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [keyword, items])

  const addStock = async (r: StockSearchResult) => {
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_ADD, {
        symbol: r.symbol,
        name: r.name,
      })
      showToast(`已添加 ${r.name}`)
      setKeyword('')
      setResults([])
      setSearchOpen(false)
    } catch (err) {
      showToast('添加失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const removeStock = async (item: WatchlistItem) => {
    if (!window.confirm(`从自选股移除「${item.name}」？`)) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_REMOVE, { symbol: item.symbol })
      showToast('已移除')
    } catch (err) {
      showToast('移除失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const handleOpen = async (item: WatchlistItem) => {
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_NAVIGATE, {
      url: eastmoneyQuoteUrl(item.symbol),
    })
  }

  const handleCreateGroup = async () => {
    const name = newGroupName.trim()
    setCreatingGroup(false)
    setNewGroupName('')
    if (!name) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUP_CREATE, { name })
      showToast('分组已创建')
    } catch (err) {
      showToast('创建失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const submitRename = async (id: number) => {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUP_UPDATE, { id, name })
      showToast('已重命名')
    } catch (err) {
      showToast('重命名失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const handleDeleteGroup = async (g: WatchlistGroup) => {
    if (!window.confirm(`删除分组「${g.name}」？组内股票将退回未分组。`)) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUP_DELETE, { id: g.id })
      if (selectedGroup === g.id) setSelectedGroup(GROUP_ALL)
      showToast('分组已删除')
    } catch (err) {
      showToast('删除失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const handleDropOnGroup = async (groupId: number) => {
    setOverGroup(null)
    if (!dragSymbol) return
    const sym = dragSymbol
    setDragSymbol(null)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SET_GROUP, {
        symbol: sym,
        groupId,
      })
      showToast('已移动分组')
    } catch (err) {
      showToast('移动失败：' + (err instanceof Error ? err.message : String(err)), false)
    }
  }

  const filtered = useMemo(
    () =>
      selectedGroup === GROUP_ALL
        ? items
        : items.filter((i) => (i.group_id ?? 0) === selectedGroup),
    [items, selectedGroup]
  )

  return (
    <div style={styles.container}>
      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginBottom: 10 }}>
          {toast.text}
        </div>
      )}

      {/* 搜索添加（与添加自选股同款：代码或名称，300ms 防抖） */}
      <div style={styles.searchWrap}>
        <input
          className="field"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索添加自选股（代码或名称）"
          style={styles.searchInput}
        />
        {searchOpen && results.length > 0 && (
          <div style={styles.dropdown}>
            {results.map((r) => (
              <div
                key={r.symbol}
                style={styles.dropdownItem}
                onClick={() => addStock(r)}
              >
                <span style={styles.dropdownName}>{r.name}</span>
                <span style={styles.dropdownCode}>{r.symbol}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分组 chip 条 */}
      <div style={styles.groupBar}>
        <button
          className={'chip' + (selectedGroup === GROUP_ALL ? ' active' : '')}
          onClick={() => setSelectedGroup(GROUP_ALL)}
        >
          全部
        </button>
        <button
          className={'chip' + (selectedGroup === GROUP_UNGROUPED ? ' active' : '')}
          onClick={() => setSelectedGroup(GROUP_UNGROUPED)}
          onDragOver={(e) => {
            e.preventDefault()
            setOverGroup(GROUP_UNGROUPED)
          }}
          onDragLeave={() => setOverGroup((cur) => (cur === GROUP_UNGROUPED ? null : cur))}
          onDrop={(e) => {
            e.preventDefault()
            handleDropOnGroup(GROUP_UNGROUPED)
          }}
          style={overGroup === GROUP_UNGROUPED && dragSymbol ? styles.chipOver : undefined}
        >
          未分组
        </button>
        {groups.map((g) =>
          renamingId === g.id ? (
            <input
              key={g.id}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') submitRename(g.id)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              onBlur={() => submitRename(g.id)}
              placeholder="分组名"
              className="field"
              style={{ width: 90, height: 24, fontSize: 12 }}
            />
          ) : (
            <span
              key={g.id}
              style={styles.chipWrap}
              onMouseEnter={() => setHoverGroup(g.id)}
              onMouseLeave={() => setHoverGroup((cur) => (cur === g.id ? null : cur))}
              // 智能分组是规则匹配的虚拟分组，不接收拖放（避免把 group_id 写成智能分组 id）
              onDragOver={g.kind === 'custom' ? (e) => {
                e.preventDefault()
                setOverGroup(g.id)
              } : undefined}
              onDragLeave={g.kind === 'custom' ? () => setOverGroup((cur) => (cur === g.id ? null : cur)) : undefined}
              onDrop={g.kind === 'custom' ? (e) => {
                e.preventDefault()
                handleDropOnGroup(g.id)
              } : undefined}
              title={g.kind === 'smart' ? `智能分组：${g.name}（按规则自动归类）` : `查看「${g.name}」分组（拖拽股票到此可移动分组）`}
            >
              <button
                className={'chip' + (selectedGroup === g.id ? ' active' : '')}
                style={{
                  // 悬停时平滑展开露出操作，平时不留空槽
                  paddingRight: g.kind === 'custom' && hoverGroup === g.id ? 46 : undefined,
                  transition: 'padding-right 0.15s ease',
                  ...(g.kind === 'custom' && overGroup === g.id && dragSymbol ? styles.chipOver : {}),
                }}
                onClick={() => setSelectedGroup(g.id)}
              >
                {g.name}
                {g.kind === 'custom' && (
                  <span
                    style={{ ...styles.chipOps, opacity: hoverGroup === g.id ? 1 : 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      style={styles.chipOp}
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenamingId(g.id)
                        setRenameValue(g.name)
                      }}
                      title="重命名分组"
                    >
                      ✎
                    </span>
                    <span
                      style={styles.chipOp}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteGroup(g)
                      }}
                      title="删除分组（组内股票退回未分组）"
                    >
                      ×
                    </span>
                  </span>
                )}
              </button>
            </span>
          )
        )}
        {creatingGroup ? (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') handleCreateGroup()
              if (e.key === 'Escape') {
                setCreatingGroup(false)
                setNewGroupName('')
              }
            }}
            onBlur={handleCreateGroup}
            placeholder="分组名"
            className="field"
            style={{ width: 90, height: 24, fontSize: 12 }}
          />
        ) : (
          <button
            className="chip"
            style={{ color: 'var(--overlay0)' }}
            onClick={() => setCreatingGroup(true)}
            title="新建分组"
          >
            ＋ 新建分组
          </button>
        )}
      </div>

      {/* 卡片 */}
      {filtered.length === 0 ? (
        <div style={styles.empty}>
          {items.length === 0
            ? '还没有自选股，在上方搜索即可添加'
            : '该分组暂无自选股，可把卡片拖到分组名上移动'}
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((item) => {
            const sym = normalizeSymbol(item.symbol)
            const quote = quotes.get(sym) || null
            const pct = quote?.changePercent ?? null
            return (
              <div
                key={item.symbol}
                onClick={() => handleOpen(item)}
                className="card"
                style={styles.card}
                draggable
                onDragStart={() => setDragSymbol(item.symbol)}
                onDragEnd={() => setDragSymbol(null)}
                title="点击查看行情，拖到分组名上移动分组"
              >
                <button
                  style={styles.cardDel}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeStock(item)
                  }}
                  title="移除自选股"
                >
                  ×
                </button>
                <span style={styles.name}>{item.name}</span>
                <span style={styles.code}>{sym}</span>
                {quote ? (
                  <>
                    <span style={{ ...styles.price, color: getPriceColor(pct) }}>
                      {quote.price ? quote.price.toFixed(2) : '--'}
                    </span>
                    <span style={{ ...styles.pct, color: getPriceColor(pct) }}>
                      {formatPct(pct)}
                    </span>
                  </>
                ) : (
                  <span style={styles.priceLoading}>--</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {items.length > 0 && (
        <div style={styles.footnote}>
          提示：悬停卡片可删除，拖动卡片到分组名上可移动分组；改动会同步到左侧自选股面板。
        </div>
      )}
    </div>
  )
}

function getPriceColor(pct: number | null): string {
  if (pct === null) return 'var(--subtext0)'
  if (pct > 0) return 'var(--up)'
  if (pct < 0) return 'var(--down)'
  return 'var(--subtext0)'
}

function formatPct(pct: number | null): string {
  if (pct === null) return '--'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px 32px',
    maxWidth: 900,
    margin: '0 auto',
  },
  searchWrap: { position: 'relative', marginBottom: 12, maxWidth: 360 },
  searchInput: { width: '100%', fontSize: 12, padding: '6px 10px' },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 20,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    marginTop: 4,
    maxHeight: 220,
    overflowY: 'auto',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  dropdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: 12,
    color: 'var(--text)',
  },
  dropdownName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dropdownCode: { color: 'var(--overlay0)', fontSize: 11, flexShrink: 0 },
  groupBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  chipWrap: { position: 'relative', display: 'inline-flex' },
  chipOps: {
    position: 'absolute',
    right: 5,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    transition: 'opacity 0.12s ease',
  },
  chipOp: {
    fontSize: 10,
    lineHeight: 1,
    color: 'var(--overlay0)',
    cursor: 'pointer',
    padding: '2px',
  },
  chipOver: { outline: '2px dashed var(--blue)', outlineOffset: 1 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 14,
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '14px 10px',
    cursor: 'pointer',
  },
  cardDel: {
    position: 'absolute',
    top: 4,
    right: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--overlay0)',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    padding: 2,
  },
  name: {
    fontSize: 13,
    color: 'var(--text)',
    fontWeight: 500,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  code: { fontSize: 11, color: 'var(--overlay0)' },
  price: { fontSize: 16, fontWeight: 600, marginTop: 4 },
  pct: { fontSize: 12 },
  priceLoading: { fontSize: 16, color: 'var(--overlay0)', marginTop: 4 },
  empty: {
    padding: '40px 0',
    textAlign: 'center',
    color: 'var(--overlay0)',
    fontSize: 13,
  },
  footnote: {
    marginTop: 18,
    textAlign: 'center',
    color: 'var(--overlay0)',
    fontSize: 11,
  },
}
