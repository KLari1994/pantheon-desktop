import { type PluginLocaleBundles, type PluginTranslate, usePluginI18n } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

type ProjectMessages = {
  nav: string
  title: string
  loading: string
  empty: string
  invalidBinding: string
  unavailableMachine: string
  checkingWorktree: string
  conversation: string
  review: string
  preview: string
  files: string
  terminal: string
  artifacts: string
  mergePacket: string
  noMergeAuthority: string
  openPreview: string
  openFiles: string
  openTerminal: string
  openReview: string
  artifactUnavailable: string
  linear: string
}

const en: ProjectMessages = {
  nav: 'Projects',
  title: 'Projects',
  loading: 'Loading projects',
  empty: 'No project rooms',
  invalidBinding: 'This project room binding is invalid',
  unavailableMachine: 'The bound machine is unavailable',
  checkingWorktree: 'Checking bound worktree',
  conversation: 'Conversation',
  review: 'Diff/Review',
  preview: 'Preview',
  files: 'Files',
  terminal: 'Terminal',
  artifacts: 'Artifacts',
  mergePacket: 'Merge Packet',
  noMergeAuthority: 'No merge authority',
  openPreview: 'Open preview',
  openFiles: 'Reveal files',
  openTerminal: 'Open terminal',
  openReview: 'Load review',
  artifactUnavailable: 'Artifact unavailable',
  linear: 'Linear ticket'
}

const ja: ProjectMessages = {
  ...en,
  nav: 'プロジェクト',
  title: 'プロジェクト',
  loading: 'プロジェクトを読み込み中',
  empty: 'プロジェクトルームがありません',
  invalidBinding: 'このプロジェクトルームのバインドは無効です',
  unavailableMachine: 'バインドされたマシンは利用できません',
  checkingWorktree: 'バインドされたワークツリーを確認中',
  conversation: '会話',
  review: '差分/レビュー',
  preview: 'プレビュー',
  files: 'ファイル',
  terminal: 'ターミナル',
  artifacts: '成果物',
  mergePacket: 'マージパケット',
  noMergeAuthority: 'マージ権限なし',
  openPreview: 'プレビューを開く',
  openFiles: 'ファイルを表示',
  openTerminal: 'ターミナルを開く',
  openReview: 'レビューを読み込む',
  artifactUnavailable: '成果物は利用できません',
  linear: 'Linear チケット'
}

const zh: ProjectMessages = {
  ...en,
  nav: '项目',
  title: '项目',
  loading: '正在加载项目',
  empty: '没有项目房间',
  invalidBinding: '此项目房间绑定无效',
  unavailableMachine: '绑定的机器不可用',
  checkingWorktree: '正在检查绑定的工作树',
  conversation: '会话',
  review: '差异/审查',
  preview: '预览',
  files: '文件',
  terminal: '终端',
  artifacts: '产物',
  mergePacket: '合并包',
  noMergeAuthority: '无合并权限',
  openPreview: '打开预览',
  openFiles: '显示文件',
  openTerminal: '打开终端',
  openReview: '加载审查',
  artifactUnavailable: '产物不可用',
  linear: 'Linear 工单'
}

const zhHant: ProjectMessages = {
  ...zh,
  nav: '專案',
  title: '專案',
  loading: '正在載入專案',
  empty: '沒有專案房間',
  invalidBinding: '此專案房間綁定無效',
  unavailableMachine: '綁定的機器無法使用',
  checkingWorktree: '正在檢查綁定的工作樹',
  conversation: '會話',
  review: '差異/審查',
  preview: '預覽',
  files: '檔案',
  terminal: '終端',
  artifacts: '產物',
  mergePacket: '合併封包',
  noMergeAuthority: '無合併權限',
  openPreview: '開啟預覽',
  openFiles: '顯示檔案',
  openTerminal: '開啟終端',
  openReview: '載入審查',
  artifactUnavailable: '產物無法使用',
  linear: 'Linear 工單'
}

export const PROJECT_LOCALES: PluginLocaleBundles = { en, ja, zh, 'zh-hant': zhHant }

type Bound<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : T[K] extends object
      ? Bound<T[K]>
      : string
}

function bind<T extends object>(t: PluginTranslate, template: T, prefix = ''): Bound<T> {
  const out = {} as Record<string, unknown>

  for (const [key, value] of Object.entries(template)) {
    const path = prefix ? `${prefix}.${key}` : key
    out[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => t(path, ...args)
        : value && typeof value === 'object'
          ? bind(t, value as object, path)
          : t(path)
  }

  return out as Bound<T>
}

export type ProjectText = Bound<ProjectMessages>

export function useProjectText(): ProjectText {
  const t = usePluginI18n('pantheon-workspace')

  return useMemo(() => bind(t, en), [t])
}

export const projectEnglish = en
