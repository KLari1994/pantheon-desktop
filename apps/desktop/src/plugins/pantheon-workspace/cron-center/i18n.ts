import { type PluginLocaleBundles, type PluginTranslate, usePluginI18n } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

type CronCenterMessages = {
  nav: string
  title: string
  loading: string
  empty: string
  error: string
  degraded: string
  runNow: string
  running: string
  edit: string
  pause: string
  resume: string
  openOwnerChat: string
  more: string
  delete: string
  deleteTitle: (name: string) => string
  deleteBody: string
  owner: string
  schedule: string
  agent: string
  noAgent: string
  nextRun: string
  lastRun: string
  result: string
  delivery: string
  failureStreak: string
  source: string
  receipt: string
  history: string
  unavailable: string
  save: string
  cancel: string
  name: string
  prompt: string
  script: string
}

const en: CronCenterMessages = {
  nav: 'Cron Center',
  title: 'Cron Center',
  loading: 'Loading cron jobs',
  empty: 'No scheduled jobs',
  error: 'Unable to load cron jobs',
  degraded: 'Some owners are degraded',
  runNow: 'Run now',
  running: 'Running',
  edit: 'Edit',
  pause: 'Pause',
  resume: 'Resume',
  openOwnerChat: 'Open owner chat',
  more: 'More',
  delete: 'Delete',
  deleteTitle: name => `Delete ${name}?`,
  deleteBody: 'This removes the job from the existing Hermes scheduler after confirmation.',
  owner: 'Owner',
  schedule: 'Schedule',
  agent: 'Agent',
  noAgent: 'No agent',
  nextRun: 'Next run',
  lastRun: 'Last run',
  result: 'Last result',
  delivery: 'Delivery',
  failureStreak: 'Failure streak',
  source: 'Source',
  receipt: 'Latest execution',
  history: 'Recent runs',
  unavailable: 'unavailable',
  save: 'Save',
  cancel: 'Cancel',
  name: 'Name',
  prompt: 'Prompt',
  script: 'Script'
}

const ja: CronCenterMessages = {
  ...en,
  nav: 'Cronセンター',
  title: 'Cronセンター',
  loading: 'Cronジョブを読み込み中',
  empty: 'スケジュールされたジョブはありません',
  error: 'Cronジョブを読み込めません',
  degraded: '一部のオーナーが劣化しています',
  runNow: '今すぐ実行',
  running: '実行中',
  edit: '編集',
  pause: '一時停止',
  resume: '再開',
  openOwnerChat: 'オーナーチャットを開く',
  more: 'その他',
  delete: '削除',
  deleteTitle: name => `${name} を削除しますか？`,
  deleteBody: '確認後、既存の Hermes スケジューラからジョブを削除します。',
  owner: 'オーナー',
  schedule: 'スケジュール',
  agent: 'エージェント',
  noAgent: 'エージェントなし',
  nextRun: '次回実行',
  lastRun: '前回実行',
  result: '前回の結果',
  delivery: '配信',
  failureStreak: '連続失敗',
  source: 'ソース',
  receipt: '最新の実行',
  history: '最近の実行',
  unavailable: '利用不可',
  save: '保存',
  cancel: 'キャンセル',
  name: '名前',
  prompt: 'プロンプト',
  script: 'スクリプト'
}

const zh: CronCenterMessages = {
  ...en,
  nav: '定时任务中心',
  title: '定时任务中心',
  loading: '正在加载定时任务',
  empty: '没有计划任务',
  error: '无法加载定时任务',
  degraded: '部分所有者已降级',
  runNow: '立即运行',
  running: '运行中',
  edit: '编辑',
  pause: '暂停',
  resume: '恢复',
  openOwnerChat: '打开所有者聊天',
  more: '更多',
  delete: '删除',
  deleteTitle: name => `删除 ${name}？`,
  deleteBody: '确认后将从现有 Hermes 调度器删除该任务。',
  owner: '所有者',
  schedule: '计划',
  agent: '代理',
  noAgent: '无代理',
  nextRun: '下次运行',
  lastRun: '上次运行',
  result: '上次结果',
  delivery: '投递',
  failureStreak: '连续失败',
  source: '来源',
  receipt: '最近一次执行',
  history: '最近运行',
  unavailable: '不可用',
  save: '保存',
  cancel: '取消',
  name: '名称',
  prompt: '提示词',
  script: '脚本'
}

const zhHant: CronCenterMessages = {
  ...zh,
  nav: '定時任務中心',
  title: '定時任務中心',
  loading: '正在載入定時任務',
  empty: '沒有排程任務',
  error: '無法載入定時任務',
  degraded: '部分擁有者已降級',
  runNow: '立即執行',
  running: '執行中',
  edit: '編輯',
  pause: '暫停',
  resume: '恢復',
  openOwnerChat: '開啟擁有者聊天',
  more: '更多',
  delete: '刪除',
  deleteTitle: name => `刪除 ${name}？`,
  deleteBody: '確認後將從既有 Hermes 排程器刪除此任務。',
  owner: '擁有者',
  schedule: '排程',
  agent: '代理',
  noAgent: '無代理',
  nextRun: '下次執行',
  lastRun: '上次執行',
  result: '上次結果',
  delivery: '投遞',
  failureStreak: '連續失敗',
  source: '來源',
  receipt: '最近一次執行',
  history: '最近執行',
  unavailable: '無法使用',
  save: '儲存',
  cancel: '取消',
  name: '名稱',
  prompt: '提示詞',
  script: '指令碼'
}

export const CRON_CENTER_LOCALES: PluginLocaleBundles = { en, ja, zh, 'zh-hant': zhHant }

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

export type CronCenterText = Bound<CronCenterMessages>

export function useCronCenterText(): CronCenterText {
  const t = usePluginI18n('pantheon-workspace')

  return useMemo(() => bind(t, en), [t])
}

export const cronCenterEnglish = en
