import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { useThemeMode } from '../lib/themeMode'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** 暴露给父组件的命令式句柄，用于工具栏插入/包裹文本 */
export interface MarkdownEditorHandle {
  getView: () => EditorView | null
}

/**
 * 跟随应用主题的 CodeMirror 皮肤：颜色全部引用 CSS 变量，
 * 深/浅色切换时无需重建编辑器（var() 在绘制时解析）。
 */
const appSkin = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--bg-crust)' },
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-gutters': { backgroundColor: 'var(--bg-mantle)', color: 'var(--overlay0)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(var(--blue-rgb), 0.06)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(var(--blue-rgb), 0.1)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(var(--blue-rgb), 0.25) !important',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '.cm-placeholder': { color: 'var(--overlay0)' },
  '&.cm-focused': { outline: 'none' },
})

/**
 * 基于 CodeMirror 6 的 Markdown 编辑器：
 * 语法高亮、自动换行、列表续行、代码块内嵌语言高亮、深浅主题跟随。
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  ({ value, onChange, placeholder }, ref) => {
    const viewRef = useRef<EditorView | null>(null)
    const { mode } = useThemeMode()

    useImperativeHandle(ref, () => ({
      getView: () => viewRef.current,
    }))

    const extensions = useMemo(
      () => [
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        EditorView.lineWrapping,
        appSkin,
      ],
      []
    )

    return (
      <div style={styles.wrap}>
        <CodeMirror
          value={value}
          height="100%"
          theme={mode === 'light' ? 'light' : oneDark}
          extensions={extensions}
          placeholder={placeholder}
          onChange={onChange}
          onCreateEditor={(view) => {
            viewRef.current = view
          }}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
          }}
          style={{ height: '100%', fontSize: 13.5 }}
        />
      </div>
    )
  }
)

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flex: '1 1 0',
    minWidth: 0,
    height: '100%',
    overflow: 'hidden',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg-crust)',
  },
}
