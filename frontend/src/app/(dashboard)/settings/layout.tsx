import {
  IconApps,
  IconChecklist,
  IconCoin,
  IconNotification,
  IconPuzzle,
  IconTool,
  IconUser,
  IconDatabase,
  IconFiles,
  IconPlayerPlay,
  IconChartBar,
} from "@tabler/icons-react"
import { Header } from "@/components/layout/header"
import SidebarNav from "./components/sidebar-nav"

const sidebarNavItems = [
  {
    title: "Général",
    icon: <IconTool />,
    href: "/settings",
  },
  {
    title: "Profil",
    icon: <IconUser />,
    href: "/settings/profile",
  },
  {
    title: "Modules",
    icon: <IconPuzzle />,
    href: "/settings/modules",
  },
  {
    title: "Facturation",
    icon: <IconCoin />,
    href: "/settings/billing",
  },
  {
    title: "Plans",
    icon: <IconChecklist />,
    href: "/settings/plans",
  },
  {
    title: "Applications connectées",
    icon: <IconApps />,
    href: "/settings/connected-apps",
  },
  {
    title: "Notifications",
    icon: <IconNotification />,
    href: "/settings/notifications",
  },
  {
    title: "Cache",
    icon: <IconDatabase />,
    href: "/settings/cache",
  },
  {
    title: "Fichiers",
    icon: <IconFiles />,
    href: "/settings/storage",
  },
  {
    title: "Files d'attente",
    icon: <IconPlayerPlay />,
    href: "/settings/queue",
  },
  {
    title: "Métriques",
    icon: <IconChartBar />,
    href: "/settings/metrics",
  },
]

interface Props {
  children: React.ReactNode
}

export default function SettingsLayout({ children }: Props) {
  return (
    <>
      <Header />

      <div
        data-layout="fixed"
        className="flex flex-1 flex-col gap-4 overflow-hidden p-4"
      >
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            Paramètres
          </h1>
          <p className="text-muted-foreground">
            Gérez vos préférences de compte et vos intégrations.
          </p>
        </div>
        <div className="flex flex-1 flex-col space-y-8 overflow-auto md:space-y-2 md:overflow-hidden lg:flex-row lg:space-y-0 lg:space-x-12">
          <aside className="lg:sticky lg:w-1/5">
            <SidebarNav items={sidebarNavItems} />
          </aside>
          <div className="flex w-full overflow-y-scroll p-1 pr-4 md:overflow-y-hidden">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
