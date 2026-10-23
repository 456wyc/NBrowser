import { useState, useEffect, useRef, useCallback } from 'react'
import { IPC_CHANNELS, type Note, type NoteSummary, type NoteMessage } from '@shared/ipc'
import { renderMarkdown } from '../lib/markdown'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'

/**
 * 笔记面板：随时记录（Markdown）、与 AI 讨论想法、把全部笔记作为个人知识库提问。
 * 同一组件复用于：右侧面板标签、导航首页 Tab、以及「笔记」空间自动打开的面板。
 */

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function NotesPanel() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [current, setCurrent] = useState<Note | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingNote, setLoadingNote] = useState(false)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [editorMode, setEditorMode] = useState<'split' | 'edit' | 'preview'>('edit')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const [kbQuestion, setKbQuestion] = useState('')
  const [kbAnswer, setKbAnswer] = useState('')
  const [kbBusy, setKbBusy] = useState(false)
  const [kbSources, setKbSources] = useState<Array<{ id: number; title: string }>>([]) // 知识库答案引用的笔记
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('') // 列表搜索
  const [activeTag, setActiveTag] = useState<string | null>(null) // 标签筛选
  const [allTags, setAllTags] = useState<string[]>([]) // 全部标签（筛选栏用）
  const [tagDraft, setTagDraft] = useState('') // 标签编辑输入
  const [exportInfo, setExportInfo] = useState<{ path: string } | null>(null) // 最近导出结果（用于打开文件）
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle') // 保存状态提示
  const [conflict, setConflict] = useState(false) // 乐观锁冲突标记（别处已改过该笔记）
  // 列表栏宽度与折叠状态（记忆到 localStorage；右侧面板空间紧张时可收起列表）
  const [listWidth, setListWidth] = useState(() => {
    const v = Number(localStorage.getItem('notes.listWidth'))
    return Number.isFinite(v) && v >= 140 && v <= 440 ? v : 200
  })
  const [listCollapsed, setListCollapsed] = useState(
    () => localStorage.getItem('notes.listCollapsed') === '1'
  )
  const listWidthRef = useRef(listWidth)
  listWidthRef.current = listWidth

  const saveTimer = useRef<number | null>(null)
  const currentRef = useRef<Note | null>(null)
  currentRef.current = current
  // 乐观锁基线：本实例最近一次从服务端读到的该笔记 updated_at
  const baseUpdatedAtRef = useRef<number | null>(null)
  // 本实例是否有尚未保存的本地编辑（标题/正文）。用于跨实例同步时判断是否需弹冲突提示
  const dirtyRef = useRef(false)
  // 正在保存的笔记 id（用于忽略主进程回播的「自身回声」，避免自己刚存的改动被误判为冲突）
  const expectingSelfRef = useRef<number | null>(null)
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const sortNotes = (list: NoteSummary[]): NoteSummary[] =>
    [...list].sort((a, b) => {
      if (a.pin !== b.pin) return b.pin - a.pin // 置顶优先
      return b.updated_at - a.updated_at // 最近更新优先
    })

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_GET_ALL, {})
      const sorted = sortNotes(res.notes)
      setNotes(sorted)
      // 汇总去重标签（用于筛选栏），切换标签时保持不变
      const tagSet = new Set<string>()
      for (const n of sorted) for (const t of n.tags) tagSet.add(t)
      setAllTags([...tagSet].sort())
      // 还没有选中的笔记时，自动选中第一条（置顶/最近），避免一进来整片空白
      if (!currentRef.current && sorted.length > 0) {
        await selectNote(sorted[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingList(false)
    }
  }, [])

  // 列表：有搜索词时走全文搜索（服务端），否则取全部
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      loadList()
      return
    }
    let cancelled = false
    setLoadingList(true)
    window.electronAPI
      .invoke(IPC_CHANNELS.NOTES_SEARCH, { query: q })
      .then((res: { notes: NoteSummary[] }) => {
        if (!cancelled) setNotes(sortNotes(res.notes))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, loadList])

  const persist = useCallback(async (patch: Partial<Note>) => {
    const base = currentRef.current
    if (!base) return
    const merged: Note = { ...base, ...patch }
    currentRef.current = merged
    setCurrent(merged)
    setSaveState('saving')
    expectingSelfRef.current = merged.id // 标记「我正在保存这条」，用于忽略主进程回播的自身回声
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      try {
        const res: { note: Note; conflict?: boolean } = await window.electronAPI.invoke(
          IPC_CHANNELS.NOTES_SAVE,
          {
            id: merged.id,
            title: merged.title,
            content: merged.content,
            chat: merged.chat,
            pin: merged.pin,
            tags: merged.tags,
            baseUpdatedAt: baseUpdatedAtRef.current ?? undefined,
          }
        )
        if (res.conflict) {
          // 别处已改过该笔记：保留本地编辑，提示用户选择「同步最新」或「覆盖保存」
          expectingSelfRef.current = null
          setConflict(true)
          setSaveState('idle')
          return
        }
        // 成功：更新基线，避免下次误判冲突
        baseUpdatedAtRef.current = res.note.updated_at
        expectingSelfRef.current = null
        currentRef.current = { ...currentRef.current, ...res.note } as Note
        setCurrent(currentRef.current)
        setConflict(false)
        dirtyRef.current = false
        setSaveState('saved')
        await loadList()
      } catch (err) {
        expectingSelfRef.current = null
        setSaveState('idle')
        setError(err instanceof Error ? err.message : String(err))
      }
    }, 600)
  }, [loadList])

  const selectNote = useCallback(async (id: number) => {
    setLoadingNote(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_GET, { id })
      if (res.note) {
        currentRef.current = res.note
        setCurrent(res.note)
        setTitle(res.note.title)
        setContent(res.note.content)
        baseUpdatedAtRef.current = res.note.updated_at // 载入即作为乐观锁基线
        setConflict(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingNote(false)
    }
  }, [])

  // 乐观锁冲突后的两种处理：refresh=取别处的最新版（放弃本地未存改动）；force=强制覆盖
  const resolveConflict = useCallback(
    async (mode: 'refresh' | 'force') => {
      const base = currentRef.current
      if (!base) return
      if (mode === 'refresh') {
        await selectNote(base.id)
        return
      }
      setConflict(false)
      setSaveState('saving')
      expectingSelfRef.current = base.id // 强制覆盖也是一次保存，其回播同样应被忽略
      try {
        const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_SAVE, {
          id: base.id,
          title: base.title,
          content: base.content,
          chat: base.chat,
          pin: base.pin,
          tags: base.tags,
          force: true,
        })
        baseUpdatedAtRef.current = res.note.updated_at
        expectingSelfRef.current = null
        currentRef.current = { ...currentRef.current, ...res.note } as Note
        setCurrent(currentRef.current)
        dirtyRef.current = false
        setSaveState('saved')
        await loadList()
      } catch (err) {
        expectingSelfRef.current = null
        setSaveState('idle')
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [selectNote, loadList]
  )

  // 跨实例实时同步：主进程在任意写操作后广播最新笔记，本实例据此自动跟随更新
  useEffect(() => {
    const off = window.electronAPI.onNotesUpdated((payload) => {
      // 删除：若正在看这条，清空当前视图
      if (payload.deletedId != null) {
        if (currentRef.current?.id === payload.deletedId) {
          currentRef.current = null
          setCurrent(null)
          setTitle('')
          setContent('')
          setConflict(false)
        }
        return
      }
      const d = payload.note
      if (!d) return
      const cur = currentRef.current
      if (!cur || d.id !== cur.id) return
      if (d.updated_at === baseUpdatedAtRef.current) return // 内容未变，跳过
      // 自身回声：本实例刚保存（persist/resolveConflict 进行中）产生的回播，忽略以免误判冲突
      if (d.id === expectingSelfRef.current) {
        baseUpdatedAtRef.current = d.updated_at
        return
      }
      if (dirtyRef.current) {
        // 本地有未保存改动，不覆盖，提示用户选择「同步最新」或「覆盖保存」
        setConflict(true)
        return
      }
      // 静默跟随：把另一端的最新内容同步到本视图
      currentRef.current = {
        ...currentRef.current,
        updated_at: d.updated_at,
        title: d.title,
        content: d.content,
        tags: d.tags,
      } as Note
      setCurrent(currentRef.current)
      setTitle(d.title)
      setContent(d.content)
      baseUpdatedAtRef.current = d.updated_at
      setConflict(false)
      void loadList()
    })
    return off
  }, [loadList])

  const newNote = useCallback(async () => {
    // 已有一张空笔记（无标题/正文/对话）时不再新建，直接复用，避免堆积空笔记
    const cur = currentRef.current
    if (cur && !cur.title.trim() && !cur.content.trim() && (cur.chat ?? []).length === 0) return
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_SAVE, {
        title: '',
        content: '',
        chat: [],
      })
      currentRef.current = res.note
      setCurrent(res.note)
      setTitle('')
      setContent('')
      baseUpdatedAtRef.current = res.note.updated_at
      setConflict(false)
      setChatOpen(false)
      setEditorMode('edit')
      setSaveState('idle')
      await loadList()
      // 新建后把焦点放到标题框，第一击就有反应
      requestAnimationFrame(() => titleRef.current?.focus())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [loadList])

  const togglePin = useCallback(() => {
    if (!currentRef.current) return
    persist({ pin: currentRef.current.pin ? 0 : 1 })
  }, [persist])

  const deleteNote = useCallback(async () => {
    const base = currentRef.current
    if (!base) return
    if (!window.confirm('删除这条笔记？此操作不可恢复。')) return
    try {
      await window.electronAPI.invoke(IPC_CHANNELS.NOTES_DELETE, { id: base.id })
      currentRef.current = null
      setCurrent(null)
      setTitle('')
      setContent('')
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [loadList])

  const sendChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || chatBusy || !currentRef.current) return
    const history = [...(currentRef.current.chat ?? []), { role: 'user', content: text } as NoteMessage]
    // 乐观更新
    const optimistic: Note = { ...currentRef.current, chat: history }
    currentRef.current = optimistic
    setCurrent(optimistic)
    setChatInput('')
    setChatBusy(true)
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_CHAT, {
        context: currentRef.current.content,
        messages: history,
      })
      const withReply: Note = {
        ...currentRef.current!,
        chat: [...history, { role: 'assistant', content: res.reply } as NoteMessage],
      }
      currentRef.current = withReply
      setCurrent(withReply)
      await window.electronAPI.invoke(IPC_CHANNELS.NOTES_SAVE, {
        id: withReply.id,
        title: withReply.title,
        content: withReply.content,
        chat: withReply.chat,
        pin: withReply.pin,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChatBusy(false)
    }
  }, [chatInput, chatBusy])

  const askKb = useCallback(async () => {
    const q = kbQuestion.trim()
    if (!q || kbBusy) return
    setKbBusy(true)
    setKbAnswer('')
    setKbSources([])
    setError(null)
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_KB_QUERY, { question: q })
      setKbAnswer(res.answer)
      // 来源由后端宽松解析并校验（不依赖 LLM 的标注格式），直接渲染跳转 chip
      setKbSources(Array.isArray(res.sources) ? res.sources : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setKbBusy(false)
    }
  }, [kbQuestion, kbBusy])

  const clearChat = useCallback(() => {
    if (!currentRef.current) return
    if (!window.confirm('清空这条笔记的讨论记录？此操作不可恢复。')) return
    persist({ chat: [] })
  }, [persist])

  const exportNotes = useCallback(async (id?: number) => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_EXPORT, { id })
      if (!res.success) return // 用户取消，静默
      if (res.path) setExportInfo({ path: res.path }) // 展示「打开 / 在文件夹中显示」入口
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // 打开笔记 .md 自动同步目录
  const openSyncDir = useCallback(async () => {
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.NOTES_SYNC_DIR, undefined)
      await window.electronAPI.invoke(IPC_CHANNELS.SHELL_OPEN, { path: res.path })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // 拖拽调整列表宽度（140–440px），松手后记忆
  const startListResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = listWidthRef.current
    let w = startW
    const onMove = (ev: MouseEvent) => {
      w = Math.min(440, Math.max(140, startW + (ev.clientX - startX)))
      setListWidth(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('notes.listWidth', String(w))
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // 折叠 / 展开列表
  const toggleList = useCallback(() => {
    setListCollapsed((c) => {
      localStorage.setItem('notes.listCollapsed', c ? '0' : '1')
      return !c
    })
  }, [])

  // 导出成功后，用系统打开文件或在文件管理器中显示
  const openExported = useCallback(async (reveal: boolean) => {
    if (!exportInfo) return
    try {
      const res = await window.electronAPI.invoke(IPC_CHANNELS.SHELL_OPEN, {
        path: exportInfo.path,
        reveal,
      })
      if (!res.success) setError('打开文件失败')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [exportInfo])

  const onTitleChange = (v: string) => {
    setTitle(v)
    dirtyRef.current = true
    persist({ title: v })
  }
  const onContentChange = (v: string) => {
    setContent(v)
    dirtyRef.current = true
    persist({ content: v })
  }

  // ===== 标签编辑 =====
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').trim()
    if (!t || !currentRef.current) return
    if (currentRef.current.tags.includes(t)) {
      setTagDraft('')
      return
    }
    persist({ tags: [...currentRef.current.tags, t] })
    setTagDraft('')
  }
  const removeTag = (t: string) => {
    if (!currentRef.current) return
    persist({ tags: currentRef.current.tags.filter((x) => x !== t) })
  }

  // ===== Markdown 格式化工具栏（直接操作 CodeMirror 视图）=====
  const wrapSelection = useCallback((before: string, after: string = before) => {
    const view = editorRef.current?.getView()
    if (!view) return
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    view.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: { anchor: from + before.length, head: from + before.length + selected.length },
    })
    view.focus()
  }, [])

  const toggleLinePrefix = useCallback((prefix: string) => {
    const view = editorRef.current?.getView()
    if (!view) return
    const { from, to } = view.state.selection.main
    const lineFrom = view.state.doc.lineAt(from).from
    const lineTo = view.state.doc.lineAt(to).to
    const text = view.state.sliceDoc(lineFrom, lineTo)
    const next = text.startsWith(prefix) ? text.slice(prefix.length) : prefix + text
    view.dispatch({
      changes: { from: lineFrom, to: lineTo, insert: next },
      selection: { anchor: from + (text.startsWith(prefix) ? -prefix.length : prefix.length) },
    })
    view.focus()
  }, [])

  const insertAtCursor = useCallback((text: string) => {
    const view = editorRef.current?.getView()
    if (!view) return
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    })
    view.focus()
  }, [])

  return (
    <div style={styles.container}>
      {/* 头部：标题 + 问知识库 + 导出全部 */}
      <div style={styles.head}>
        <span style={styles.headTitle}>📒 笔记</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={toggleList}
          style={styles.chipBtn}
          title={listCollapsed ? '展开笔记列表' : '收起笔记列表'}
        >
          {listCollapsed ? '☰' : '▤'}
        </button>
        <button onClick={() => openSyncDir()} style={styles.chipBtn} title="打开笔记 .md 自动同步目录">
          📂 同步文件夹
        </button>
        <button onClick={() => setKbOpen(true)} style={styles.chipBtn} title="把全部笔记当作知识库提问">
          💡 问知识库
        </button>
      </div>

      {exportInfo && (
        <div style={styles.exportBar}>
          <span style={styles.exportBarText} title={exportInfo.path}>
            已导出：{exportInfo.path.split(/[\\/]/).pop()}
          </span>
          <button onClick={() => openExported(false)} style={styles.exportBarBtn} title="用默认程序打开文件">
            打开
          </button>
          <button onClick={() => openExported(true)} style={styles.exportBarBtn} title="在文件管理器中显示">
            在文件夹中显示
          </button>
          <button onClick={() => setExportInfo(null)} style={styles.exportBarClose} title="关闭">
            ×
          </button>
        </div>
      )}

      {conflict && (
        <div style={styles.conflictBar}>
          <span style={styles.conflictBarText}>
            该笔记已在别处被修改，本地未保存的改动将覆盖它
          </span>
          <button onClick={() => resolveConflict('refresh')} style={styles.conflictBarBtn} title="放弃本地改动，载入最新版本">
            同步最新
          </button>
          <button onClick={() => resolveConflict('force')} style={styles.conflictBarBtn} title="用本地内容覆盖对方改动">
            仍要保存
          </button>
        </div>
      )}

      <div style={styles.body}>
        {/* 列表（可折叠 / 拖拽调宽） */}
        {listCollapsed ? (
          <div style={styles.listSlim}>
            <button onClick={toggleList} style={styles.listSlimBtn} title="展开笔记列表">
              »
            </button>
            <div style={styles.listSlimItems}>
              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => selectNote(n.id)}
                  title={n.pin ? '📌 ' : '' + (n.title.trim() || '（无标题）')}
                  style={{
                    ...styles.listSlimItem,
                    ...(current?.id === n.id ? styles.listSlimItemActive : {}),
                  }}
                >
                  {n.pin ? '📌' : '📄'}
                </button>
              ))}
            </div>
          </div>
        ) : (
        <>
        <div style={{ ...styles.list, width: listWidth }}>
          <button onClick={newNote} className="btn-primary" style={styles.newBtn}>
            ＋ 新建笔记
          </button>
          <div style={styles.searchRow}>
            <input
              className="field"
              value={query}
              placeholder="搜索标题 / 内容…"
              onChange={(e) => setQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          {allTags.length > 0 && (
            <div style={styles.tagBar}>
              <button
                onClick={() => setActiveTag(null)}
                className={activeTag === null ? 'tag-chip active' : 'tag-chip'}
                title="显示全部笔记"
              >
                全部
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(activeTag === t ? null : t)}
                  className={activeTag === t ? 'tag-chip active' : 'tag-chip'}
                  title={`筛选含「${t}」的笔记`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
          {loadingList && <div style={styles.hint}>加载中…</div>}
          {!loadingList && notes.length === 0 && (
            <div style={styles.hint}>
              {query.trim() ? '没有匹配的笔记' : '还没有笔记，点上方「新建笔记」开始记录吧'}
            </div>
          )}
          {(() => {
            const displayed = activeTag ? notes.filter((n) => n.tags.includes(activeTag)) : notes
            if (!loadingList && notes.length > 0 && displayed.length === 0) {
              return <div style={styles.hint}>该标签下没有匹配的笔记</div>
            }
            if (loadingList || displayed.length === 0) return null
            return (
              <div style={styles.listInner}>
                {displayed.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => selectNote(n.id)}
                    style={{
                      ...styles.item,
                      ...(current?.id === n.id ? styles.itemActive : {}),
                    }}
                  >
                    <div style={styles.itemTitle}>
                      {n.pin ? '📌 ' : ''}
                      {n.title.trim() || '（无标题）'}
                    </div>
                    <div style={styles.itemPreview}>{n.preview || '空笔记'}</div>
                    {n.tags.length > 0 && (
                      <div style={styles.itemTags}>
                        {n.tags.map((t) => (
                          <span key={t} className="tag-mini">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={styles.itemTime}>{formatRelative(n.updated_at)}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
        <div
          className="notes-resize-handle"
          onMouseDown={startListResize}
          onDoubleClick={toggleList}
          title="拖拽调整宽度 · 双击折叠列表"
        />
        </>
        )}

        {/* 编辑区 */}
        <div style={styles.editor}>
          {!current && (
            <div style={styles.placeholder}>从左侧选择一条笔记，或新建一条开始记录与思考。</div>
          )}
          {current && (
            <>
              <input
                ref={titleRef}
                className="field"
                value={title}
                placeholder="标题（自动保存）"
                onChange={(e) => onTitleChange(e.target.value)}
                style={styles.titleInput}
              />
              <div style={styles.tagEditor}>
                {(current.tags ?? []).map((t) => (
                  <span key={t} className="tag-chip active">
                    #{t}
                    <button
                      onClick={() => removeTag(t)}
                      className="tag-remove"
                      title="移除标签"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className="field"
                  value={tagDraft}
                  placeholder="加标签，回车确认"
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addTag(tagDraft)
                    } else if (e.key === 'Backspace' && !tagDraft && (current.tags ?? []).length > 0) {
                      removeTag((current.tags ?? [])[current.tags.length - 1])
                    }
                  }}
                  style={styles.tagInput}
                />
              </div>
              {/* 格式化工具栏：仅编辑/分屏（有编辑器）时出现 */}
              {editorMode !== 'preview' && (
                <div style={styles.formatBar}>
                  <button style={styles.fmtBtn} title="标题" onClick={() => toggleLinePrefix('# ')}>H</button>
                  <button style={styles.fmtBtn} title="加粗" onClick={() => wrapSelection('**')}>B</button>
                  <button style={styles.fmtBtn} title="斜体" onClick={() => wrapSelection('*')}>I</button>
                  <button style={styles.fmtBtn} title="引用" onClick={() => toggleLinePrefix('> ')}>❝</button>
                  <button style={styles.fmtBtn} title="无序列表" onClick={() => toggleLinePrefix('- ')}>☰</button>
                  <button style={styles.fmtBtn} title="行内代码" onClick={() => wrapSelection('`')}>{'</>'}</button>
                  <button style={styles.fmtBtn} title="链接" onClick={() => wrapSelection('[', '](https://)')}>🔗</button>
                  <button style={styles.fmtBtn} title="分割线" onClick={() => insertAtCursor('\n\n---\n\n')}>—</button>
                  <div style={{ flex: 1 }} />
                  <span style={styles.count}>{content.length} 字</span>
                </div>
              )}
              <div style={styles.editorToolbar}>
                {(['edit', 'split', 'preview'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setEditorMode(m)}
                    className={editorMode === m ? 'seg-btn active' : 'seg-btn'}
                    style={{ flex: '0 0 auto', padding: '0 10px' }}
                  >
                    {m === 'edit' ? '编辑' : m === 'split' ? '分屏' : '预览'}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                <span style={styles.saveTag}>
                  {saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '✓ 已保存' : ''}
                </span>
                <button
                  onClick={() => exportNotes(current.id)}
                  style={styles.toolBtn}
                  title="把这条笔记另存为 Markdown 文件"
                >
                  ⬇ 导出本条
                </button>
                <button
                  onClick={togglePin}
                  style={{ ...styles.toolBtn, ...(current.pin ? styles.toolBtnActive : {}) }}
                  title="置顶 / 取消置顶"
                >
                  📌 {current.pin ? '已置顶' : '置顶'}
                </button>
                <button onClick={deleteNote} style={styles.toolBtnDanger} title="删除笔记">
                  🗑 删除
                </button>
                <button
                  onClick={() => setChatOpen((v) => !v)}
                  style={{ ...styles.toolBtn, ...(chatOpen ? styles.toolBtnActive : {}) }}
                  title="与 AI 讨论这条笔记"
                >
                  💬 讨论
                </button>
              </div>

              <div style={styles.editorArea}>
                {(editorMode === 'edit' || editorMode === 'split') && (
                  <MarkdownEditor
                    value={content}
                    onChange={onContentChange}
                    placeholder="在这里用 Markdown 记录想法…（自动保存）"
                  />
                )}
                {(editorMode === 'preview' || editorMode === 'split') && (
                  <div
                    className="md-preview"
                    style={styles.preview}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                  />
                )}
              </div>

              {/* 与 AI 讨论 */}
              {chatOpen && (
                <div style={styles.chat}>
                  <div style={styles.chatHead}>
                    <span style={styles.chatHeadTitle}>💬 与 AI 讨论</span>
                    <button
                      onClick={clearChat}
                      disabled={!(current.chat ?? []).length}
                      style={styles.chatClearBtn}
                      title="清空讨论记录"
                    >
                      清空
                    </button>
                  </div>
                  <div style={styles.chatMsgs}>
                    {current.chat.length === 0 && (
                      <div style={styles.hint}>把这条笔记当作背景，和 AI 聊聊你的想法、找盲点、要追问。</div>
                    )}
                    {current.chat.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          ...styles.bubble,
                          ...(m.role === 'user' ? styles.bubbleUser : styles.bubbleAi),
                        }}
                      >
                        <div style={styles.bubbleRole}>{m.role === 'user' ? '我' : 'AI'}</div>
                        {m.role === 'assistant' ? (
                          <div
                            className="md-preview"
                            style={styles.bubbleMd}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                          />
                        ) : (
                          <div style={styles.bubbleText}>{m.content}</div>
                        )}
                      </div>
                    ))}
                    {chatBusy && <div style={styles.hint}>AI 思考中…</div>}
                  </div>
                  <div style={styles.chatInputRow}>
                    <input
                      className="field"
                      value={chatInput}
                      placeholder="说点什么…（Enter 发送）"
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') sendChat()
                      }}
                      style={styles.chatInput}
                    />
                    <button
                      onClick={sendChat}
                      disabled={chatBusy || !chatInput.trim()}
                      className="btn-primary"
                    >
                      发送
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBar}>⚠ {error}</div>}

      {/* 知识库问答弹层 */}
      {kbOpen && (
        <div style={styles.modalMask} onClick={() => setKbOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>💡 问我的知识库</span>
              <button onClick={() => setKbOpen(false)} className="icon-btn">
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.kbInputRow}>
                <input
                  className="field"
                  value={kbQuestion}
                  placeholder="基于我全部笔记提问，例如：我之前对白酒板块的判断是什么？"
                  onChange={(e) => setKbQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') askKb()
                  }}
                  style={styles.kbInput}
                />
                <button onClick={askKb} disabled={kbBusy || !kbQuestion.trim()} className="btn-primary">
                  提问
                </button>
              </div>
              {kbBusy && <div style={styles.hint}>检索笔记并思考中…</div>}
              {kbAnswer && (
                <>
                  <div
                    className="md-preview"
                    style={styles.kbAnswer}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(kbAnswer) }}
                  />
                  {kbSources.length > 0 && (
                    <div style={styles.kbSources}>
                      <span style={styles.kbSourcesLabel}>来源：</span>
                      {kbSources.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            selectNote(s.id)
                            setKbOpen(false)
                          }}
                          style={styles.kbSourceChip}
                          title={`跳转到笔记 #${s.id}`}
                        >
                          📄 {s.title.trim() || `笔记 ${s.id}`}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    width: '100%', // 关键：作为 flex 子项时不能收缩成内容宽度
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    color: 'var(--text)',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headTitle: { fontSize: 13, fontWeight: 600 },
  exportBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(var(--green-rgb), 0.08)',
    flexShrink: 0,
  },
  exportBarText: {
    flex: 1,
    fontSize: 12,
    color: 'var(--green)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  exportBarBtn: {
    height: 22,
    padding: '0 8px',
    border: '1px solid var(--green)',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--green)',
    fontSize: 11,
    cursor: 'pointer',
    flexShrink: 0,
  },
  exportBarClose: {
    border: 'none',
    background: 'transparent',
    color: 'var(--overlay0)',
    fontSize: 14,
    cursor: 'pointer',
    flexShrink: 0,
  },
  conflictBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(var(--yellow-rgb), 0.12)',
    flexShrink: 0,
  },
  conflictBarText: {
    flex: 1,
    fontSize: 12,
    color: 'var(--yellow)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  conflictBarBtn: {
    height: 22,
    padding: '0 8px',
    border: '1px solid var(--yellow)',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--yellow)',
    fontSize: 11,
    cursor: 'pointer',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
  },
  list: {
    width: 200,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  listSlim: {
    width: 26,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 10,
  },
  listSlimBtn: {
    width: 20,
    height: 24,
    padding: 0,
    border: 'none',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--overlay0)',
    fontSize: 14,
    cursor: 'pointer',
  },
  listSlimItems: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    paddingBottom: 10,
  },
  listSlimItem: {
    width: 20,
    height: 20,
    padding: 0,
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    fontSize: 12,
    lineHeight: 1,
    cursor: 'pointer',
    opacity: 0.75,
  },
  listSlimItemActive: {
    background: 'rgba(var(--blue-rgb), 0.18)',
    opacity: 1,
  },
  newBtn: { margin: 10, flexShrink: 0 },
  searchRow: { padding: '0 10px', flexShrink: 0 },
  searchInput: { width: '100%' },
  tagBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 5,
    padding: '6px 10px',
    flexShrink: 0,
    maxHeight: 76,
    overflowY: 'auto',
  },
  listInner: { flex: 1, overflowY: 'auto', padding: '0 6px 10px' },
  hint: { padding: '12px 10px', fontSize: 12, color: 'var(--overlay0)', lineHeight: 1.6 },
  item: {
    padding: '8px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    marginBottom: 4,
  },
  itemActive: { background: 'var(--surface0)' },
  itemTitle: { fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemPreview: { fontSize: 11, color: 'var(--overlay0)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemTime: { fontSize: 10, color: 'var(--overlay0)', marginTop: 3, opacity: 0.8 },
  editor: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  placeholder: { padding: 24, color: 'var(--overlay0)', fontSize: 13, lineHeight: 1.7 },
  titleInput: { margin: '10px 12px 0', flexShrink: 0, fontWeight: 600 },
  tagEditor: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px 2px',
    flexShrink: 0,
  },
  tagInput: { flex: '1 1 90px', minWidth: 90, height: 24, fontSize: 12 },
  formatBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '4px 12px',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  fmtBtn: {
    minWidth: 26,
    height: 24,
    padding: '0 6px',
    border: '1px solid var(--border)',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--subtext0)',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  count: { fontSize: 11, color: 'var(--overlay0)', paddingRight: 4, whiteSpace: 'nowrap' },
  saveTag: { fontSize: 11, color: 'var(--green)', whiteSpace: 'nowrap', flexShrink: 0 },
  editorToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  editorArea: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    padding: '0 12px 8px',
    gap: 8,
    overflow: 'hidden',
  },
  preview: {
    flex: '1 1 0',
    minWidth: 0,
    height: '100%',
    overflow: 'auto',
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg-mantle)',
    fontSize: 13.5,
    lineHeight: 1.8,
  },
  chipBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 28,
    padding: '0 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--subtext0)',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  toolBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 26,
    padding: '0 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--subtext0)',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  toolBtnActive: {
    color: 'var(--yellow)',
    borderColor: 'var(--yellow)',
  },
  toolBtnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 26,
    padding: '0 8px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--red)',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  chat: {
    flexShrink: 0,
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: 220,
    minHeight: 0,
  },
  chatHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  chatHeadTitle: { fontSize: 12, fontWeight: 600, color: 'var(--subtext0)' },
  chatClearBtn: {
    height: 22,
    padding: '0 8px',
    border: '1px solid var(--border)',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--overlay0)',
    fontSize: 11,
    cursor: 'pointer',
  },
  chatMsgs: { flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  bubble: { maxWidth: '90%', padding: '6px 10px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.6 },
  bubbleUser: { alignSelf: 'flex-end', background: 'var(--blue)', color: '#fff' },
  bubbleAi: { alignSelf: 'flex-start', background: 'var(--surface0)', color: 'var(--text)' },
  bubbleRole: { fontSize: 10, opacity: 0.7, marginBottom: 2 },
  bubbleText: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  bubbleMd: { fontSize: 12.5, lineHeight: 1.6 },
  chatInputRow: { display: 'flex', gap: 6, padding: '8px 10px', flexShrink: 0 },
  chatInput: { flex: 1 },
  errorBar: {
    flexShrink: 0,
    padding: '6px 12px',
    background: 'var(--red)',
    color: '#fff',
    fontSize: 12,
  },
  modalMask: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: 'min(640px, 90vw)',
    maxHeight: '80vh',
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    fontWeight: 600,
  },
  modalBody: { padding: 14, overflowY: 'auto' },
  kbInputRow: { display: 'flex', gap: 8, marginBottom: 12 },
  kbInput: { flex: 1 },
  kbAnswer: {
    whiteSpace: 'pre-wrap',
    lineHeight: 1.7,
    fontSize: 13,
    background: 'var(--bg-mantle)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 12,
  },
  kbSources: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  kbSourcesLabel: { fontSize: 12, color: 'var(--overlay0)' },
  kbSourceChip: {
    height: 24,
    padding: '0 10px',
    border: '1px solid var(--blue)',
    borderRadius: 12,
    background: 'transparent',
    color: 'var(--blue)',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
}
