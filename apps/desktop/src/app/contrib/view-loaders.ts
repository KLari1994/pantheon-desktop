export const viewLoaders = {
  '/skills': () => import('../skills'),
  '/messaging': () => import('../messaging'),
  '/artifacts': () => import('../artifacts'),
  '/settings': () => import('../settings'),
  '/command-center': () => import('../command-center'),
  '/agents': () => import('../agents'),
  '/cron': () => import('../cron'),
  '/webhooks': () => import('../webhooks'),
  '/profiles': () => import('../profiles'),
  '/starmap': () => import('../starmap')
} as const
