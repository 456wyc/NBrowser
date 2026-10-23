import { useEffect, useState } from 'react'
import { IPC_CHANNELS, type Bookmark, type BookmarkGroup } from '@shared/ipc'
import { useToast } from '../hooks/useToast'
import { ErrorState } from './ErrorState'

/** 选中分组语义：-1 = 全部，0 = 未分组，>0 = 分组 id */
const GROUP_ALL = -1
const GROUP_UNGROUPED = 0

interface BookmarkGridProps {
  onNavigate?: (url: string) => void
}

export function BookmarkGrid({ onNavigate }: BookmarkGridProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [groups, setGroups] = useState<BookmarkGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<number>(GROUP_ALL)
  // 悬停的分组（显示 chip 内的 ✎/× 操作）
  const [hoverGroup, setHoverGroup] = useState<number | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newGroupId, setNewGroupId] = useState<number>(GROUP_UNGROUPED)

  const [hoverId, setHoverId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editGroupId, setEditGroupId] = useState<number>(GROUP_UNGROUPED)

  const [dragId, setDragId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  // 拖拽卡片悬停的分组 chip（放置目标）
  const [overGroup, setOverGroup] = useState<number | null>(null)

  // 分组管理
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { toast, showToast } = useToast()
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadBookmarks = async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_GET_ALL, {})
      setBookmarks(res.bookmarks)
      setLoadError(null)
    } catch (err) {
      console.error('Failed to load bookmarks:', err)
      setLoadError(err instanceof Error ? err.message : '读取书签失败')
    }
  }

  const loadGroups = async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARK_GROUPS_GET, {})
      setGroups(res.groups)
    } catch (err) {
      console.error('Failed to load bookmark groups:', err)
    }
  }

  useEffect(() => {
    loadBookmarks()
    loadGroups()
  }, [])

  const notifyFail = (action: string, err: unknown) => {
    console.error(`${action} failed:`, err)
    showToast(`${action}失败：${err instanceof Error ? err.message : String(err)}`, false)
  }

  // 当前选中分组下的书签
  const visibleBookmarks =
    selectedGroup === GROUP_ALL
      ? bookmarks
      : bookmarks.filter((b) => (b.group_id || GROUP_UNGROUPED) === selectedGroup)

  // 分组名映射（卡片角标展示所属分组）
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]))

  const startEdit = (bm: Bookmark) => {
    setEditingId(bm.id)
    setEditTitle(bm.title)
    setEditUrl(bm.url)
    setEditGroupId(bm.group_id || GROUP_UNGROUPED)
    setShowAddForm(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTitle('')
    setEditUrl('')
    setEditGroupId(GROUP_UNGROUPED)
  }

  const submitEdit = async (id: number) => {
    if (!editTitle.trim() || !editUrl.trim()) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_UPDATE, {
        id,
        title: editTitle.trim(),
        url: editUrl.trim(),
        group_id: editGroupId,
      })
      cancelEdit()
      loadBookmarks()
    } catch (err) {
      notifyFail('保存书签', err)
    }
  }

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newUrl.trim()) return

    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_ADD, {
        title: newTitle.trim(),
        url: newUrl.trim(),
        group_id: newGroupId,
      })
      setNewTitle('')
      setNewUrl('')
      setShowAddForm(false)
      loadBookmarks()
    } catch (err) {
      notifyFail('添加书签', err)
    }
  }

  const handleDeleteBookmark = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_DELETE, { id })
      loadBookmarks()
    } catch (err) {
      notifyFail('删除书签', err)
    }
  }

  const handleNavigate = (url: string) => {
    if (onNavigate) {
      onNavigate(url)
    } else {
      window.electronAPI.invoke(IPC_CHANNELS.TABS_NAVIGATE, { url })
    }
  }

  // ---------- 分组管理 ----------

  const handleCreateGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARK_GROUPS_CREATE, { name })
      setNewGroupName('')
      setCreatingGroup(false)
      await loadGroups()
      setSelectedGroup(res.group.id)
    } catch (err) {
      notifyFail('新建分组', err)
    }
  }

  const submitRename = async (id: number) => {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARK_GROUPS_UPDATE, { id, name })
      loadGroups()
    } catch (err) {
      notifyFail('重命名分组', err)
    }
  }

  const handleDeleteGroup = async (group: BookmarkGroup) => {
    if (!window.confirm(`删除分组「${group.name}」？组内网站会退回「未分组」，不会丢失。`)) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARK_GROUPS_DELETE, { id: group.id })
      if (selectedGroup === group.id) setSelectedGroup(GROUP_ALL)
      loadGroups()
      loadBookmarks()
    } catch (err) {
      notifyFail('删除分组', err)
    }
  }

  /** 把书签移动到分组（拖到 chip 上松手） */
  const handleDropOnGroup = async (groupId: number) => {
    const id = dragId
    setDragId(null)
    setOverId(null)
    setOverGroup(null)
    if (id === null) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_SET_GROUP, { id, groupId })
      loadBookmarks()
    } catch (err) {
      notifyFail('移动网站', err)
    }
  }

  // 拖拽排序
  const handleDrop = async (targetId: number) => {
    const sourceId = dragId
    setDragId(null)
    setOverId(null)
    if (sourceId === null || sourceId === targetId) return

    const from = bookmarks.findIndex((b) => b.id === sourceId)
    const to = bookmarks.findIndex((b) => b.id === targetId)
    if (from < 0 || to < 0) return

    const next = bookmarks.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    // 乐观更新，失败则回滚
    const prev = bookmarks
    setBookmarks(next)
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.BOOKMARKS_REORDER, {
        ids: next.map((b) => b.id),
      })
    } catch (err) {
      notifyFail('调整顺序', err)
      setBookmarks(prev)
    }
  }

  /** 分组下拉（添加/编辑表单共用） */
  const groupSelect = (value: number, onChange: (v: number) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="field"
      style={{ fontSize: 12 }}
    >
      <option value={GROUP_UNGROUPED}>未分组</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  )

  /** 单张书签卡片（全部/单分组两种视图共用） */
  const renderCard = (bm: Bookmark) => {
    const editing = editingId === bm.id
    const showActions = hoverId === bm.id || editing
    return (
      <div
        key={bm.id}
        draggable={!editing}
        onDragStart={() => setDragId(bm.id)}
        onDragOver={(e) => {
          e.preventDefault()
          setOverId(bm.id)
        }}
        onDragLeave={() => setOverId((cur) => (cur === bm.id ? null : cur))}
        onDrop={(e) => {
          e.preventDefault()
          handleDrop(bm.id)
        }}
        onDragEnd={() => {
          setDragId(null)
          setOverId(null)
          setOverGroup(null)
        }}
        onMouseEnter={() => setHoverId(bm.id)}
        onMouseLeave={() => setHoverId((cur) => (cur === bm.id ? null : cur))}
        onClick={() => {
          if (!editing) handleNavigate(bm.url)
        }}
        className="card"
        style={{
          ...styles.bookmarkCard,
          ...(dragId === bm.id ? styles.bookmarkCardDragging : {}),
          ...(overId === bm.id && dragId !== bm.id ? styles.bookmarkCardOver : {}),
        }}
      >
        <div style={styles.favicon}>{getFavicon(bm.url)}</div>

        {editing ? (
          <div style={styles.editBox} onClick={(e) => e.stopPropagation()}>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="field"
              style={{ width: '100%', fontSize: 12 }}
              autoFocus
            />
            <input
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              className="field"
              style={{ width: '100%', fontSize: 12 }}
            />
            {groupSelect(editGroupId, setEditGroupId)}
            <div style={styles.editActions}>
              <button onClick={() => submitEdit(bm.id)} className="btn-primary" style={{ flex: 1, fontSize: 12 }}>
                保存
              </button>
              <button onClick={cancelEdit} className="btn" style={{ flex: 1, fontSize: 12 }}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <span style={styles.bookmarkTitle}>{bm.title}</span>
            {bm.group_id !== GROUP_UNGROUPED && groupNameById.has(bm.group_id) && (
              <span style={styles.groupBadge}>{groupNameById.get(bm.group_id)}</span>
            )}
          </>
        )}

        {!editing && (
          <div
            style={{
              ...styles.actions,
              opacity: showActions ? 1 : 0,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                startEdit(bm)
              }}
              style={styles.actionBtn}
              title="编辑"
            >
              ✎
            </button>
            <button
              onClick={(e) => handleDeleteBookmark(e, bm.id)}
              style={styles.actionBtn}
              title="删除"
            >
              ×
            </button>
          </div>
        )}
      </div>
    )
  }

  // 「全部」视图：按分组分节（内置分类 + 自定义分组），未分组排在最后
  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order)
  const ungrouped = bookmarks.filter((b) => b.group_id === GROUP_UNGROUPED)

  return (
    <div style={styles.container}>
      {toast && (
        <div className={toast.ok ? 'toast' : 'toast-error'} style={{ marginBottom: 10 }}>
          {toast.text}
        </div>
      )}

      {loadError && (
        <ErrorState title="书签加载失败" desc={loadError} onRetry={loadBookmarks} />
      )}

      {/* 分组 chip 条：全部 / 未分组 / 自定义分组（✎ 重命名、× 删除）+ 新建 */}
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
          style={overGroup === GROUP_UNGROUPED && dragId !== null ? styles.chipOver : undefined}
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
            // 外层 wrapper 承担拖拽放置目标；✎/× 悬停时在 chip 内部右侧淡入，不外露不占位
            <span
              key={g.id}
              style={styles.chipWrap}
              onMouseEnter={() => setHoverGroup(g.id)}
              onMouseLeave={() => setHoverGroup((cur) => (cur === g.id ? null : cur))}
              onDragOver={(e) => {
                e.preventDefault()
                setOverGroup(g.id)
              }}
              onDragLeave={() => setOverGroup((cur) => (cur === g.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                handleDropOnGroup(g.id)
              }}
              title={`查看「${g.name}」分组（拖拽网站到此可移动分组）`}
            >
              <button
                className={'chip' + (selectedGroup === g.id ? ' active' : '')}
                style={{
                  // 悬停时平滑展开露出操作，平时不留空槽
                  paddingRight: hoverGroup === g.id ? 46 : undefined,
                  transition: 'padding-right 0.15s ease',
                  ...(overGroup === g.id && dragId !== null ? styles.chipOver : {}),
                }}
                onClick={() => setSelectedGroup(g.id)}
              >
                {g.name}
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
                    title="删除分组（组内网站退回未分组）"
                  >
                    ×
                  </span>
                </span>
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
            onBlur={() => {
              if (newGroupName.trim()) handleCreateGroup()
              else {
                setCreatingGroup(false)
                setNewGroupName('')
              }
            }}
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
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="chip"
          style={{
            marginLeft: 'auto',
            color: showAddForm ? 'var(--red)' : undefined,
          }}
          title={showAddForm ? '收起添加表单' : '添加常用网站'}
        >
          {showAddForm ? '✕ 取消添加' : '＋ 添加'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddBookmark} style={styles.addForm}>
          <input
            type="text"
            placeholder="网站名称"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="field"
          />
          <input
            type="text"
            placeholder="网址"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="field"
            style={{ flex: 1 }}
          />
          {groupSelect(newGroupId, setNewGroupId)}
          <button type="submit" className="btn-primary">
            添加
          </button>
        </form>
      )}

      {selectedGroup === GROUP_ALL ? (
        <>
          {sortedGroups.map((g) => {
            const list = bookmarks.filter((b) => b.group_id === g.id)
            if (list.length === 0) return null
            return (
              <div key={g.id} style={styles.section}>
                <div style={styles.sectionTitle}>
                  {g.name}
                  <span style={styles.sectionCount}>{list.length}</span>
                </div>
                <div style={styles.bookmarkGrid}>{list.map(renderCard)}</div>
              </div>
            )
          })}
          {ungrouped.length > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                未分组
                <span style={styles.sectionCount}>{ungrouped.length}</span>
              </div>
              <div style={styles.bookmarkGrid}>{ungrouped.map(renderCard)}</div>
            </div>
          )}
          {bookmarks.length === 0 && !loadError && (
            <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
              还没有收藏网站，点右上角「+ 添加」
            </div>
          )}
        </>
      ) : (
        <div style={styles.bookmarkGrid}>
          {visibleBookmarks.map(renderCard)}
          {visibleBookmarks.length === 0 && !loadError && (
            <div className="muted" style={{ padding: '24px 0', gridColumn: '1 / -1', textAlign: 'center' }}>
              该分组下暂无网站（可拖拽卡片到上方分组移动）
            </div>
          )}
        </div>
      )}

      <div style={styles.footer}>
        <span className="muted">
          提示：拖拽卡片可调整顺序或移入分组（拖到上方分组名上），悬停卡片可编辑或删除
        </span>
      </div>
    </div>
  )
}

function getFavicon(url: string): string {
  try {
    const hostname = new URL(url).hostname
    return hostname.charAt(0).toUpperCase()
  } catch {
    return '🌐'
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px 32px',
    maxWidth: 900,
    margin: '0 auto',
  },
  groupBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  chipOver: {
    outline: '2px dashed var(--blue)',
    outlineOffset: 1,
  },
  chipWrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
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
  addForm: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
    padding: 12,
    background: 'var(--bg-crust)',
    borderRadius: 'var(--r-md)',
  },
  bookmarkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 16,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sectionCount: {
    fontSize: 10,
    fontWeight: 400,
    color: 'var(--overlay0)',
    background: 'var(--bg-crust)',
    borderRadius: 8,
    padding: '1px 6px',
  },
  bookmarkCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 12px',
    cursor: 'pointer',
    minHeight: 96,
  },
  bookmarkCardDragging: { opacity: 0.4 },
  bookmarkCardOver: { borderColor: 'var(--blue)' },
  favicon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'var(--surface1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    color: 'var(--text)',
    marginBottom: 10,
    fontWeight: 600,
  },
  bookmarkTitle: {
    fontSize: 13,
    color: 'var(--text)',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  groupBadge: {
    fontSize: 10,
    color: 'var(--overlay0)',
    marginTop: 4,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    position: 'absolute',
    top: 4,
    right: 4,
    display: 'flex',
    gap: 2,
    transition: 'opacity 0.15s',
  },
  actionBtn: {
    width: 22,
    height: 22,
    border: 'none',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.25)',
    color: 'var(--text)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  editBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    cursor: 'default',
  },
  editActions: { display: 'flex', gap: 6, marginTop: 2 },
  footer: {
    marginTop: 40,
    textAlign: 'center',
  },
}
