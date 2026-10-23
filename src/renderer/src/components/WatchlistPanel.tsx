import { useState, useEffect, useRef } from 'react'
import {
  IPC_CHANNELS,
  type WatchlistItem,
  type Quote,
  type StockSearchResult,
  type WatchlistGroup,
} from '@shared/ipc'
import { useQuotes } from '../hooks/useQuotes'
import { useToast } from '../hooks/useToast'
import { normalizeSymbol, eastmoneyQuoteUrl } from '@shared/stock-market'
import { matchSmartGroup, GROUP_ALL, GROUP_UNGROUPED } from '@shared/watchlist-groups'

interface WatchlistPanelProps {
  // 当前页面识别出的股票代码（来自 activity tab 的 URL）
  pageSymbol?: string | null
}

export function WatchlistPanel({ pageSymbol }: WatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [groups, setGroups] = useState<WatchlistGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<number>(GROUP_ALL)
  const [showSearch, setShowSearch] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingFromPage, setAddingFromPage] = useState(false)
  const [hoverSymbol, setHoverSymbol] = useState<string | null>(null)
  const [dragSymbol, setDragSymbol] = useState<string | null>(null)
  const [overSymbol, setOverSymbol] = useState<string | null>(null)
  // 分组创建
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  // 行内「移动到分组」菜单
  const [groupMenuSymbol, setGroupMenuSymbol] = useState<string | null>(null)
  // 批量操作
  const [batchMode, setBatchMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 拖拽到分组 chip 时的高亮分组
  const [overGroup, setOverGroup] = useState<number | null>(null)
  // 分组重命名
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const groupMenuRef = useRef<HTMLDivElement>(null)

  const { quotes, error: quoteError, loading: quotesLoading, refresh } = useQuotes()

  // 加载自选股列表
  const loadWatchlist = async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GET_ALL, {})
    setItems(res.items)
  }

  // 加载分组
  const loadGroups = async () => {
    const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUPS_GET, {})
    setGroups(res.groups)
  }

  useEffect(() => {
    loadWatchlist()
    loadGroups()
  }, [])

  // 任何来源（本面板 / 导航首页）的自选股改动都经主进程广播同步
  useEffect(() => {
    const unsub = window.electronAPI.onWatchlistUpdated((payload) => {
      setItems(payload.items)
      setGroups(payload.groups)
    })
    return unsub
  }, [])

  // 点击空白处关闭「移动到分组」菜单
  useEffect(() => {
    if (!groupMenuSymbol) return
    const onDown = (e: MouseEvent) => {
      const el = groupMenuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setGroupMenuSymbol(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [groupMenuSymbol])

  // 搜索防抖
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setSearchResults([])
      return
    }
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SEARCH, {
          keyword: searchKeyword.trim(),
        })
        setSearchResults(res.results)
      } catch (err) {
        console.error('Search failed:', err)
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchKeyword])

  // 当前选中分组是否为可拖拽排序（智能分组不可）
  const activeGroupObj = groups.find((g) => g.id === activeGroup) || null
  const canReorder = !activeGroupObj || activeGroupObj.kind === 'custom' || activeGroup === GROUP_ALL

  // 按当前分组过滤 + 排序
  const filteredItems = (() => {
    let list = items
    if (activeGroup === GROUP_ALL) {
      list = items
    } else if (activeGroup === GROUP_UNGROUPED) {
      list = items.filter((i) => i.group_id === 0)
    } else if (activeGroupObj?.kind === 'smart') {
      list = items.filter((i) =>
        matchSmartGroup(
          activeGroupObj.rule || '',
          i.symbol,
          quotes.get(normalizeSymbol(i.symbol))?.changePercent ?? null
        )
      )
      // 涨跌分组按幅度排序
      if (activeGroupObj.rule === 'change:up' || activeGroupObj.rule === 'change:down') {
        list = [...list].sort(
          (a, b) =>
            (quotes.get(normalizeSymbol(b.symbol))?.changePercent ?? 0) -
            (quotes.get(normalizeSymbol(a.symbol))?.changePercent ?? 0)
        )
      }
    } else {
      list = items.filter((i) => i.group_id === activeGroup)
    }
    return list
  })()

  // 添加自选股（携带当前自定义分组）
  const targetGroupId = activeGroupObj?.kind === 'custom' ? activeGroup : GROUP_UNGROUPED

  const handleAdd = async (result: StockSearchResult) => {
    await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_ADD, {
      symbol: result.symbol,
      name: result.name,
      groupId: targetGroupId,
    })
    setSearchKeyword('')
    setSearchResults([])
    setShowSearch(false)
    loadWatchlist()
  }

  // 删除自选股
  const handleRemove = async (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation()
    await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_REMOVE, { symbol })
    loadWatchlist()
  }

  // 操作失败统一提示：此前只写 console，界面上看起来像成功了
  const { toast, showToast } = useToast()
  const notifyFail = (action: string, err: unknown) => {
    console.error(`${action} failed:`, err)
    showToast(`${action}失败：${err instanceof Error ? err.message : String(err)}`, false)
  }

  // 就地重命名（双击股票名称触发；变量带 Stock 前缀，避免与分组重命名的 renameValue 撞名）
  const [renamingSymbol, setRenamingSymbol] = useState<string | null>(null)
  const [stockRenameValue, setStockRenameValue] = useState('')
  const submitRenameItem = async (symbol: string) => {
    const name = stockRenameValue.trim()
    setRenamingSymbol(null)
    setStockRenameValue('')
    if (!name) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_UPDATE, { symbol, name })
      showToast('已重命名')
      await loadWatchlist()
    } catch (err) {
      notifyFail('重命名', err)
    }
  }

  // 把当前页面的股票加入自选（先用代码反查名称）
  const handleAddFromPage = async () => {
    if (!pageSymbol || addingFromPage) return
    setAddingFromPage(true)
    try {
      const normalized = normalizeSymbol(pageSymbol)
      const code = normalized.split('.')[0]
      let name = code
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SEARCH, {
          keyword: code,
        })
        const hit =
          res.results.find((r) => r.symbol.toLowerCase().startsWith(code.toLowerCase())) ||
          res.results[0]
        if (hit?.name) name = hit.name
      } catch {
        // 反查失败时直接用代码作为名称
      }
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_ADD, {
        symbol: normalized,
        name,
        groupId: targetGroupId,
      })
      await loadWatchlist()
    } catch (err) {
      notifyFail('加入自选', err)
    } finally {
      setAddingFromPage(false)
    }
  }

  // 点击自选股 -> 新开行情标签
  const handleClickStock = async (item: WatchlistItem) => {
    // 点击行时收起可能打开的「移动到分组」菜单
    setGroupMenuSymbol(null)
    // 东方财富行情页；URL 由 shared 统一生成（按代码前缀规范化市场）
    const url = eastmoneyQuoteUrl(item.symbol)
    await window.electronAPI.invoke(IPC_CHANNELS.TABS_CREATE, { url, active: true })
  }

  // 拖拽排序：把 dragSymbol 落到的目标行重排并持久化
  const handleDrop = async (targetSymbol: string) => {
    setOverSymbol(null)
    if (!dragSymbol || dragSymbol === targetSymbol) {
      setDragSymbol(null)
      return
    }
    const from = filteredItems.findIndex((i) => i.symbol === dragSymbol)
    const to = filteredItems.findIndex((i) => i.symbol === targetSymbol)
    if (from < 0 || to < 0) {
      setDragSymbol(null)
      return
    }
    const next = filteredItems.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const symbols = next.map((i) => i.symbol)
    setDragSymbol(null)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_REORDER, { symbols })
    } catch (err) {
      notifyFail('调整顺序', err)
    } finally {
      loadWatchlist()
    }
  }

  // 把股票拖到分组 chip 上 -> 归入该分组
  const handleDropOnGroup = async (groupId: number) => {
    const symbol = dragSymbol
    setOverGroup(null)
    setDragSymbol(null)
    if (!symbol) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SET_GROUP, { symbol, groupId })
      setGroupMenuSymbol(null)
      await loadWatchlist()
    } catch (err) {
      notifyFail('移入分组', err)
    }
  }

  // ---- 批量操作 ----
  const toggleSelect = (symbol: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      return next
    })
  }

  const exitBatch = () => {
    setBatchMode(false)
    setSelected(new Set())
  }

  const handleBatchMove = async (groupId: number) => {
    const symbols = Array.from(selected)
    if (symbols.length === 0) return
    try {
      for (const symbol of symbols) {
        await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SET_GROUP, { symbol, groupId })
      }
      exitBatch()
      await loadWatchlist()
    } catch (err) {
      notifyFail('批量移动', err)
    }
  }

  const handleBatchRemove = async () => {
    const symbols = Array.from(selected)
    if (symbols.length === 0) return
    try {
      for (const symbol of symbols) {
        await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_REMOVE, { symbol })
      }
      exitBatch()
      await loadWatchlist()
    } catch (err) {
      notifyFail('批量删除', err)
    }
  }

  // 创建自定义分组
  const handleCreateGroup = async () => {
    const name = newGroupName.trim()
    if (!name) {
      setCreating(false)
      setNewGroupName('')
      return
    }
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUP_CREATE, { name })
      setActiveGroup(res.group.id)
      await loadGroups()
    } catch (err) {
      notifyFail('新建分组', err)
    } finally {
      setCreating(false)
      setNewGroupName('')
    }
  }

  // 重命名自定义分组
  const submitRename = async (id: number) => {
    const name = renameValue.trim()
    setRenamingId(null)
    setRenameValue('')
    if (!name) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUP_UPDATE, { id, name })
      await loadGroups()
    } catch (err) {
      notifyFail('重命名分组', err)
    }
  }

  // 删除自定义分组
  const handleDeleteGroup = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_GROUP_DELETE, { id })
      if (activeGroup === id) setActiveGroup(GROUP_ALL)
      await loadGroups()
    } catch (err) {
      notifyFail('删除分组', err)
    }
  }

  // 移动股票到分组
  const handleSetGroup = async (symbol: string, groupId: number) => {
    setGroupMenuSymbol(null)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.WATCHLIST_SET_GROUP, { symbol, groupId })
      await loadWatchlist()
    } catch (err) {
      notifyFail('移动分组', err)
    }
  }

  // 合并自选股和行情数据（按规范化后的代码 key 查行情）
  const itemsWithQuote = filteredItems.map((item) => ({
    item,
    quote: quotes.get(normalizeSymbol(item.symbol)) || null,
  }))

  // 自定义分组（用于移动菜单）
  const customGroups = groups.filter((g) => g.kind === 'custom')

  const groupNameOf = (groupId: number): string =>
    customGroups.find((g) => g.id === groupId)?.name ?? ''

  // 不同分组的空态文案更有针对性
  const emptyHint = (() => {
    if (activeGroup === GROUP_ALL) return '点击上方 + 添加'
    if (activeGroup === GROUP_UNGROUPED) return '未分组里还没有股票'
    if (activeGroupObj?.kind === 'smart') return '当前没有符合该规则的股票'
    return '把股票拖到分组标签上，或用行内 📁 移入'
  })()

  // 分组 chip 作为放置目标（仅未分组 / 自定义分组可接收，智能分组是虚拟的）
  const dropProps = (groupId: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragSymbol) return
      e.preventDefault()
      setOverGroup(groupId)
    },
    onDragLeave: () => setOverGroup((cur) => (cur === groupId ? null : cur)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      handleDropOnGroup(groupId)
    },
  })

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>自选股</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
            style={{
              ...styles.headerBtn,
              ...(batchMode ? styles.headerBtnActive : {}),
            }}
            title="批量操作"
          >
            批量
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="icon-btn"
            title="添加自选股"
          >
            {showSearch ? '×' : '+'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginBottom: 8 }}>
          {toast.text}
        </div>
      )}

      {/* 批量操作条 */}
      {batchMode && (
        <div style={styles.batchBar}>
          <button
            onClick={() =>
              setSelected(
                selected.size === filteredItems.length
                  ? new Set()
                  : new Set(filteredItems.map((i) => i.symbol))
              )
            }
            style={styles.batchAction}
          >
            {selected.size === filteredItems.length ? '取消全选' : '全选'}
          </button>
          <select
            className="field"
            style={{ maxWidth: 140 }}
            value=""
            onChange={(e) => {
              if (e.target.value === '') return
              handleBatchMove(Number(e.target.value))
            }}
            disabled={selected.size === 0}
          >
            <option value="">移动到分组…</option>
            <option value={GROUP_UNGROUPED}>未分组</option>
            {customGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleBatchRemove}
            style={{ ...styles.batchAction, color: 'var(--red)' }}
            disabled={selected.size === 0}
          >
            移除{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
        </div>
      )}

      {/* 分组切换 chips */}
      <div style={styles.groupBar}>
        <button
          onClick={() => setActiveGroup(GROUP_ALL)}
          style={{ ...styles.groupChip, ...(activeGroup === GROUP_ALL ? styles.groupChipActive : {}) }}
        >
          全部
        </button>
        <button
          onClick={() => setActiveGroup(GROUP_UNGROUPED)}
          {...dropProps(GROUP_UNGROUPED)}
          style={{
            ...styles.groupChip,
            ...(activeGroup === GROUP_UNGROUPED ? styles.groupChipActive : {}),
            ...(overGroup === GROUP_UNGROUPED && dragSymbol ? styles.groupChipOver : {}),
          }}
        >
          未分组
        </button>
        {groups.map((g) => (
          <span key={g.id} style={styles.groupChipWrap}>
            {renamingId === g.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => submitRename(g.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(g.id)
                  if (e.key === 'Escape') {
                    setRenamingId(null)
                    setRenameValue('')
                  }
                }}
                style={styles.renameInput}
              />
            ) : (
              <>
                <button
                  onClick={() => setActiveGroup(g.id)}
                  {...(g.kind === 'custom' ? dropProps(g.id) : {})}
                  style={{
                    ...styles.groupChip,
                    ...(activeGroup === g.id ? styles.groupChipActive : {}),
                    ...(g.kind === 'custom' && overGroup === g.id && dragSymbol
                      ? styles.groupChipOver
                      : {}),
                  }}
                >
                  {g.name}
                </button>
                {g.kind === 'custom' && (
                  <>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenamingId(g.id)
                        setRenameValue(g.name)
                      }}
                      style={styles.groupRename}
                      title="重命名分组"
                    >
                      ✎
                    </span>
                    <span
                      onClick={(e) => handleDeleteGroup(e, g.id)}
                      style={styles.groupDelete}
                      title="删除分组"
                    >
                      ×
                    </span>
                  </>
                )}
              </>
            )}
          </span>
        ))}
        {creating ? (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onBlur={handleCreateGroup}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateGroup()
              if (e.key === 'Escape') {
                setCreating(false)
                setNewGroupName('')
              }
            }}
            placeholder="分组名"
            style={styles.groupInput}
          />
        ) : (
          <button onClick={() => setCreating(true)} style={styles.groupAddBtn} title="新建分组">
            +
          </button>
        )}
      </div>

      {showSearch && (
        <div style={styles.searchBox}>
          <input
            type="text"
            className="field"
            style={{ width: '100%' }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="输入代码或名称搜索"
            autoFocus
          />
          {searching && <div style={styles.searching}>搜索中...</div>}
          {searchResults.length > 0 && (
            <div style={styles.searchResults}>
              {searchResults.map((result) => (
                <div
                  key={result.symbol}
                  onClick={() => handleAdd(result)}
                  style={styles.searchResultItem}
                >
                  <span style={styles.searchResultName}>{result.name}</span>
                  <span style={styles.searchResultCode}>{result.symbol}</span>
                  <span style={styles.addIcon}>+</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {quoteError && (
        <button
          onClick={() => void refresh()}
          style={styles.errorBanner}
          title={`${quoteError}（点击重试）`}
        >
          ⟳ 数据可能延迟，点击刷新
        </button>
      )}

      {/* 当前页面识别到的股票 */}
      {pageSymbol && (
        <div style={styles.pageStockBar}>
          <span style={styles.pageStockLabel}>当前页面</span>
          <span style={styles.pageStockSymbol}>{pageSymbol}</span>
          {items.some((i) => normalizeSymbol(i.symbol) === (pageSymbol ? normalizeSymbol(pageSymbol) : '')) ? (
            <span style={styles.pageStockAdded}>已在自选</span>
          ) : (
            <button
              onClick={handleAddFromPage}
              disabled={addingFromPage}
              style={styles.pageStockAdd}
              title="加入自选股"
            >
              {addingFromPage ? '…' : '+ 自选'}
            </button>
          )}
        </div>
      )}

      <div style={styles.list}>
        {itemsWithQuote.length === 0 && !quotesLoading && (
          <div style={styles.empty}>
            <p>暂无自选股</p>
            <p style={styles.emptyHint}>{emptyHint}</p>
          </div>
        )}
        {itemsWithQuote.map(({ item, quote }) => (
          <div
            key={item.symbol}
            draggable={canReorder && !batchMode}
            onClick={() => (batchMode ? toggleSelect(item.symbol) : handleClickStock(item))}
            onMouseEnter={() => setHoverSymbol(item.symbol)}
            onMouseLeave={() => setHoverSymbol((cur) => (cur === item.symbol ? null : cur))}
            onDragStart={(e) => {
              if (!canReorder) return
              setDragSymbol(item.symbol)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (!canReorder) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (overSymbol !== item.symbol) setOverSymbol(item.symbol)
            }}
            onDragLeave={() => setOverSymbol((cur) => (cur === item.symbol ? null : cur))}
            onDrop={(e) => {
              if (!canReorder) return
              e.preventDefault()
              handleDrop(item.symbol)
            }}
            onDragEnd={() => {
              setDragSymbol(null)
              setOverSymbol(null)
              setOverGroup(null)
            }}
            className="wl-row"
            style={{
              ...styles.stockItem,
              ...(pageSymbol === item.symbol ? styles.stockItemCurrent : {}),
              ...(dragSymbol === item.symbol ? styles.stockItemDragging : {}),
              ...(overSymbol === item.symbol && dragSymbol && dragSymbol !== item.symbol
                ? styles.stockItemOver
                : {}),
              ...(selected.has(item.symbol) ? styles.stockItemSelected : {}),
            }}
          >
            {batchMode ? (
              <span
                className={'checkbox-box' + (selected.has(item.symbol) ? ' on' : '')}
                style={{ marginRight: 2 }}
              >
                {selected.has(item.symbol) ? '✓' : ''}
              </span>
            ) : (
              <span
                style={{ ...styles.dragHandle, opacity: hoverSymbol === item.symbol ? 1 : 0.25 }}
                title="拖拽排序"
              >
                ⠿
              </span>
            )}
            <div style={styles.stockInfo}>
              {renamingSymbol === item.symbol ? (
                <input
                  className="field"
                  style={{ ...styles.stockName, height: 22, padding: '0 6px', fontSize: 12 }}
                  value={stockRenameValue}
                  autoFocus
                  onChange={(e) => setStockRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') submitRenameItem(item.symbol)
                    if (e.key === 'Escape') setRenamingSymbol(null)
                  }}
                  title="回车保存，Esc 取消"
                />
              ) : (
                <span
                  style={styles.stockName}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setRenamingSymbol(item.symbol)
                    setRenameValue(item.name)
                  }}
                  title="双击重命名"
                >
                  {item.name}
                </span>
              )}
              <span style={styles.stockCode}>
                {normalizeSymbol(item.symbol)}
                {groupNameOf(item.group_id) && (
                  <span style={styles.groupBadge}>{groupNameOf(item.group_id)}</span>
                )}
              </span>
            </div>
            <div style={styles.stockPrice}>
              {quote ? (
                <>
                  <span style={{ ...styles.price, color: getPriceColor(quote.changePercent) }}>
                    {formatPrice(quote.price)}
                  </span>
                  <span
                    style={{
                      ...styles.changePercent,
                      color: getPriceColor(quote.changePercent),
                    }}
                  >
                    {formatChangePercent(quote.changePercent)}
                  </span>
                </>
              ) : (
                <span style={styles.priceLoading}>--</span>
              )}
            </div>
            {/* 移动到分组 */}
            <span
              onClick={(e) => {
                e.stopPropagation()
                setGroupMenuSymbol((cur) => (cur === item.symbol ? null : item.symbol))
              }}
              // 阻止冒泡到 document，否则「点击外部关闭」会先关掉、onClick 再打开，导致菜单关不掉
              onMouseDown={(e) => e.stopPropagation()}
              style={{ ...styles.rowGroupBtn, opacity: hoverSymbol === item.symbol ? 1 : 0.25 }}
              title="移动到分组"
            >
              📁
            </span>
            {groupMenuSymbol === item.symbol && (
              <div
                ref={groupMenuRef}
                style={styles.groupMenu}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={styles.groupMenuItem}
                  onClick={() => handleSetGroup(item.symbol, GROUP_UNGROUPED)}
                >
                  未分组
                </div>
                {customGroups.map((g) => (
                  <div
                    key={g.id}
                    style={styles.groupMenuItem}
                    onClick={() => handleSetGroup(item.symbol, g.id)}
                  >
                    {g.name}
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={(e) => handleRemove(e, item.symbol)}
              style={{ ...styles.removeBtn, opacity: hoverSymbol === item.symbol ? 1 : 0 }}
              title="移除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function getPriceColor(changePercent: number): string {
  // A 股习惯：涨红跌绿
  if (changePercent > 0) return 'var(--up)'
  if (changePercent < 0) return 'var(--down)'
  return 'var(--subtext0)'
}

function formatPrice(price: number): string {
  if (!price) return '--'
  return price.toFixed(2)
}

function formatChangePercent(pct: number): string {
  if (pct === undefined || pct === null) return '--'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '12px 0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 16px 8px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
  },
  groupBar: {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: 6,
    padding: '0 12px 10px',
    alignItems: 'center',
    // 单行横向滚动：分组变多时不再撑高，避免挤压列表
    overflowX: 'auto',
    overflowY: 'hidden',
    flexShrink: 0,
  },
  groupChip: {
    border: '1px solid var(--border-strong)',
    borderRadius: 12,
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '3px 10px',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  groupChipActive: {
    background: 'rgba(var(--blue-rgb), 0.18)',
    borderColor: 'var(--blue)',
    color: 'var(--blue)',
  },
  groupChipOver: {
    borderColor: 'var(--green)',
    background: 'rgba(var(--green-rgb), 0.18)',
    color: 'var(--green)',
  },
  headerBtn: {
    height: 24,
    padding: '0 8px',
    border: '1px solid var(--border-strong)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  headerBtnActive: {
    borderColor: 'var(--blue)',
    color: 'var(--blue)',
    background: 'rgba(var(--blue-rgb), 0.12)',
  },
  batchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px 10px',
    flexWrap: 'wrap',
  },
  batchAction: {
    border: '1px solid var(--border-strong)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '3px 8px',
  },
  stockItemSelected: {
    background: 'rgba(var(--green-rgb), 0.10)',
    boxShadow: 'inset 2px 0 0 var(--green)',
  },
  groupChipWrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  groupDelete: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: 'var(--border-strong)',
    color: 'var(--red)',
    fontSize: 10,
    lineHeight: '14px',
    textAlign: 'center',
    cursor: 'pointer',
    opacity: 0.85,
  },
  groupRename: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: 'var(--border-strong)',
    color: 'var(--blue)',
    fontSize: 9,
    lineHeight: '14px',
    textAlign: 'center',
    cursor: 'pointer',
    opacity: 0.85,
  },
  renameInput: {
    width: 84,
    height: 22,
    border: '1px solid var(--blue)',
    borderRadius: 12,
    background: 'var(--bg-base)',
    color: 'var(--text)',
    fontSize: 12,
    outline: 'none',
    padding: '0 8px',
  },
  groupAddBtn: {
    width: 24,
    height: 22,
    border: '1px dashed var(--border-strong)',
    borderRadius: 12,
    background: 'transparent',
    color: 'var(--subtext0)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: 0,
  },
  groupInput: {
    width: 80,
    height: 22,
    border: '1px solid var(--blue)',
    borderRadius: 12,
    background: 'var(--bg-base)',
    color: 'var(--text)',
    fontSize: 12,
    outline: 'none',
    padding: '0 8px',
  },
  searchBox: {
    padding: '0 12px 8px',
  },
  searching: {
    fontSize: 12,
    color: 'var(--overlay0)',
    padding: '8px 4px',
  },
  searchResults: {
    marginTop: 4,
    maxHeight: 200,
    overflowY: 'auto',
    background: 'var(--bg-base)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
  },
  searchResultItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    gap: 8,
  },
  searchResultName: {
    flex: 1,
    fontSize: 13,
    color: 'var(--text)',
  },
  searchResultCode: {
    fontSize: 12,
    color: 'var(--overlay0)',
  },
  addIcon: {
    fontSize: 16,
    color: 'var(--blue)',
    fontWeight: 'bold',
  },
  errorBanner: {
    display: 'block',
    width: 'calc(100% - 24px)',
    padding: '6px 16px',
    fontSize: 11,
    color: 'var(--yellow)',
    background: 'rgba(var(--yellow-rgb), 0.1)',
    margin: '0 12px 8px',
    border: 'none',
    borderRadius: 4,
    textAlign: 'center',
    cursor: 'pointer',
  },
  pageStockBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    margin: '0 12px 8px',
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(var(--blue-rgb), 0.1)',
  },
  pageStockLabel: { fontSize: 11, color: 'var(--overlay0)', flexShrink: 0 },
  pageStockSymbol: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--blue)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pageStockAdded: { fontSize: 11, color: 'var(--overlay0)', flexShrink: 0 },
  pageStockAdd: {
    flexShrink: 0,
    padding: '2px 8px',
    border: '1px solid var(--blue)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--blue)',
    cursor: 'pointer',
    fontSize: 11,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    position: 'relative',
  },
  empty: {
    textAlign: 'center',
    color: 'var(--overlay0)',
    padding: '40px 20px',
    fontSize: 13,
  },
  emptyHint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  stockItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'pointer',
    position: 'relative',
    gap: 8,
  },
  stockItemCurrent: {
    background: 'rgba(var(--blue-rgb), 0.08)',
    boxShadow: 'inset 2px 0 0 var(--blue)',
  },
  stockItemDragging: {
    opacity: 0.4,
  },
  stockItemOver: {
    background: 'rgba(var(--blue-rgb), 0.18)',
    boxShadow: 'inset 2px 0 0 var(--blue)',
  },
  dragHandle: {
    flexShrink: 0,
    cursor: 'grab',
    color: 'var(--overlay0)',
    fontSize: 14,
    lineHeight: 1,
    userSelect: 'none',
    transition: 'opacity 0.15s',
  },
  stockInfo: {
    flex: 1,
    minWidth: 0,
  },
  stockName: {
    display: 'block',
    fontSize: 13,
    color: 'var(--text)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stockCode: {
    display: 'block',
    fontSize: 11,
    color: 'var(--overlay0)',
    marginTop: 2,
  },
  groupBadge: {
    marginLeft: 6,
    padding: '0 5px',
    borderRadius: 6,
    background: 'rgba(var(--blue-rgb), 0.15)',
    color: 'var(--blue)',
    fontSize: 10,
  },
  stockPrice: {
    textAlign: 'right',
    flexShrink: 0,
  },
  price: {
    display: 'block',
    fontSize: 14,
    fontWeight: 600,
  },
  changePercent: {
    display: 'block',
    fontSize: 11,
    marginTop: 2,
  },
  priceLoading: {
    fontSize: 14,
    color: 'var(--overlay0)',
  },
  rowGroupBtn: {
    flexShrink: 0,
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1,
    userSelect: 'none',
    transition: 'opacity 0.15s',
  },
  groupMenu: {
    position: 'absolute',
    right: 24,
    top: 36,
    zIndex: 20,
    minWidth: 96,
    background: 'var(--bg-base)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    overflow: 'hidden',
  },
  groupMenuItem: {
    padding: '6px 10px',
    fontSize: 12,
    color: 'var(--text)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--overlay0)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    opacity: 0,
    transition: 'opacity 0.15s',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}
