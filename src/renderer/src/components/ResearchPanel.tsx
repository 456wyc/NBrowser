import { AiPanel } from './AiPanel'
import { AgentPanel } from '../pages/AgentPanel'
import { ResearchReportsPanel } from '../pages/ResearchReportsPanel'
import type { ResearchTier, ResearchView } from '../layout/config'

/**
 * 🔍 研究模块（AI 分析 + 深度研究 + 报告库 三合一）
 *
 * 原来右侧面板的「✨分析 / 🕸研究 / 📚报告」是同一个用户心智（用 AI 研究股票）
 * 的三种深度，拆成三个标签纯属技术实现驱动的信息架构。合并后：
 *
 * - 一个输入区 + 三档深度：⚡快览（秒级，单页结构化整理）/ 🔎深挖（当前页多步深挖）/
 *   🕸深度研究（分钟级，自主联网调研产出报告）；
 * - 📚 报告库作为子视图（历史报告的查看/导出/删除）；
 * - 复用了三个现有组件，主进程零改动。
 */

/** useAiAnalysis 的最小接口（避免组件反向依赖 hook 实现） */
export interface AiPanelState {
  result: Parameters<typeof AiPanel>[0]['result']
  history: Parameters<typeof AiPanel>[0]['history']
  loading: boolean
  loadingHistory: boolean
  error: string | null
  analyzePage: () => Promise<unknown>
  loadHistory: () => Promise<unknown>
  deleteRecord: (id: number) => Promise<unknown>
}

const TIERS: Array<{ id: ResearchTier; icon: string; label: string; title: string }> = [
  { id: 'quick', icon: '⚡', label: '快览', title: '秒级：结构化整理当前页（利好/利空/关键数据）' },
  { id: 'deepen', icon: '🔎', label: '深挖', title: '以当前页为起点多步深挖，交叉验证' },
  { id: 'deep', icon: '🕸', label: '深度研究', title: '分钟级：自主联网检索调研，产出研究报告' },
]

export function ResearchPanel({
  tier,
  onTierChange,
  view,
  onViewChange,
  ai,
  onClosePanel,
  onOpenAiSettings,
}: {
  tier: ResearchTier
  onTierChange: (t: ResearchTier) => void
  view: ResearchView
  onViewChange: (v: ResearchView) => void
  ai: AiPanelState
  onClosePanel: () => void
  onOpenAiSettings: () => void
}) {
  // 报告库子视图
  if (view === 'reports') {
    return (
      <div style={styles.wrap}>
        <div style={styles.header}>
          <button
            className="icon-btn"
            style={styles.backBtn}
            title="返回研究"
            onClick={() => onViewChange('tiers')}
          >
            ←
          </button>
          <span style={styles.headerIcon}>📚</span>
          <span style={styles.headerTitle}>研究报告库</span>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" style={styles.closeBtn} title="关闭面板" onClick={onClosePanel}>
            ×
          </button>
        </div>
        <div style={styles.body}>
          <ResearchReportsPanel />
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      {/* 深度分档 + 报告库入口 */}
      <div style={styles.header}>
        <div style={styles.seg}>
          {TIERS.map((t) => (
            <button
              key={t.id}
              className={'seg-btn' + (tier === t.id ? ' active' : '')}
              title={t.title}
              onClick={() => onTierChange(t.id)}
            >
              <span style={styles.tierIcon}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="chip"
          style={styles.reportsBtn}
          title="查看历史研究报告"
          onClick={() => onViewChange('reports')}
        >
          📚 报告库
        </button>
        <button className="icon-btn" style={styles.closeBtn} title="关闭面板" onClick={onClosePanel}>
          ×
        </button>
      </div>

      <div style={styles.body}>
        {tier === 'quick' && (
          <AiPanel
            result={ai.result}
            history={ai.history}
            loading={ai.loading}
            loadingHistory={ai.loadingHistory}
            error={ai.error}
            onAnalyze={() => void ai.analyzePage()}
            onLoadHistory={() => void ai.loadHistory()}
            onDeleteRecord={(id) => void ai.deleteRecord(id)}
            onClose={onClosePanel}
            onOpenSettings={onOpenAiSettings}
          />
        )}
        {/* 模式由外层档位决定，内层不再展示重复的模式切换 */}
        {tier === 'deepen' && <AgentPanel key="deepen" initialMode="deepen" showModeSeg={false} />}
        {tier === 'deep' && <AgentPanel key="deep" initialMode="research" showModeSeg={false} />}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px 6px 10px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerIcon: { fontSize: 13 },
  headerTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  seg: { display: 'flex', gap: 4 },
  tierIcon: { fontSize: 11, marginRight: 2 },
  reportsBtn: { fontSize: 11, padding: '3px 8px' },
  backBtn: { width: 24, height: 24 },
  closeBtn: { width: 24, height: 24 },
  body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
}
