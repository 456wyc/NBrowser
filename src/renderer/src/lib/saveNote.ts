import { IPC_CHANNELS } from '@shared/ipc'

/**
 * 保存一条笔记并统一提示。
 * 走 notes:save 通道，主进程会一并完成 md 镜像同步、向量更新与广播，
 * 与手动建笔记的行为完全一致（DB 是唯一事实源）。
 */
export async function saveNoteWithToast(
  title: string,
  content: string,
  showToast: (text: string, ok?: boolean) => void
): Promise<void> {
  try {
    await window.electronAPI.invoke(IPC_CHANNELS.NOTES_SAVE, { title, content })
    showToast('已存为笔记 📒')
  } catch (err) {
    showToast('保存笔记失败：' + (err instanceof Error ? err.message : String(err)), false)
  }
}
