import { Codicon } from '@/components/ui/codicon'

import { ARTIFACTS_ROUTE, MESSAGING_ROUTE, type SidebarNavContribution, SKILLS_ROUTE } from '../../routes'
import type { SidebarNavItem } from '../../types'

export const SIDEBAR_NAV: SidebarNavItem[] = [
  {
    id: 'new-session',
    label: '',
    icon: props => <Codicon name="robot" {...props} />,
    action: 'new-session',
    keybindActionId: 'session.new'
  },
  {
    id: 'skills',
    label: '',
    icon: props => <Codicon name="symbol-misc" {...props} />,
    route: SKILLS_ROUTE,
    keybindActionId: 'nav.skills'
  },
  {
    id: 'messaging',
    label: '',
    icon: props => <Codicon name="comment" {...props} />,
    route: MESSAGING_ROUTE,
    keybindActionId: 'nav.messaging'
  },
  {
    id: 'artifacts',
    label: '',
    icon: props => <Codicon name="files" {...props} />,
    route: ARTIFACTS_ROUTE,
    keybindActionId: 'nav.artifacts'
  }
]

export function contributedNavItems(contributions: readonly { id: string; data?: unknown }[]): SidebarNavItem[] {
  return contributions.flatMap(c => {
    const data = c.data as Partial<SidebarNavContribution> | undefined

    if (!data?.path?.startsWith('/') || !data.label) {
      return []
    }

    const codicon = data.codicon || 'plug'

    return [
      {
        id: c.id,
        label: data.label,
        icon: (props: { className?: string }) => <Codicon name={codicon} {...props} />,
        route: data.path
      }
    ]
  })
}
