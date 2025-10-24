import {
  IconApps,
  IconBarrierBlock,
  IconBug,
  IconChecklist,
  IconCode,
  IconCoin,
  IconError404,
  IconLayoutDashboard,
  IconLock,
  IconLockAccess,
  IconNotification,
  IconServerOff,
  IconSettings,
  IconTool,
  IconUser,
  IconUserOff,
  IconUsers,
  IconUsersGroup,
  IconShield,
  IconKey,
  IconEye,
  IconListDetails,
  IconBolt,
  IconPuzzle,
  IconMail,
  IconLanguage,
  IconChartBar,
  IconPlus,
} from "@tabler/icons-react"
import { AudioWaveform, GalleryVerticalEnd } from "lucide-react"
import { Logo } from "@/components/logo"
import { type SidebarData } from "../types"

export const sidebarData: SidebarData = {
  user: {
    name: "Admin User",
    email: "admin@opsflux.io",
    avatar: "/avatars/avatar-1.png",
  },
  teams: [
    {
      name: "OpsFlux",
      logo: ({ className }: { className: string }) => (
        <Logo className={className} />
      ),
      plan: "Oil & Gas Operations",
    },
    {
      name: "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
    },
  ],
  navGroups: [
    {
      title: "Général",
      items: [
        {
          title: "Dashboards",
          icon: IconChartBar,
          permission: "dashboards.read",
          items: [
            {
              title: "Mes dashboards",
              url: "/dashboards",
              icon: IconLayoutDashboard,
            },
            {
              title: "Nouveau dashboard",
              url: "/dashboards/new",
              icon: IconPlus,
              permission: "dashboards.create",
            },
          ],
        },
        {
          title: "Tâches",
          url: "/tasks",
          icon: IconChecklist,
          permission: "tasks.read",
        },
      ],
    },
    {
      title: "Pages",
      items: [
        {
          title: "Authentification",
          icon: IconLockAccess,
          items: [
            {
              title: "Connexion",
              url: "/login",
            },
            {
              title: "Inscription",
              url: "/register",
            },
            {
              title: "Mot de passe oublié",
              url: "/forgot-password",
            },
          ],
        },
      ],
    },
    {
      title: "Autre",
      items: [
        {
          title: "Paramètres",
          url: "/settings",
          icon: IconSettings,
          permission: "settings.read",
        },
        {
          title: "Développeurs",
          icon: IconCode,
          permission: "developers.read",
          items: [
            {
              title: "Vue d'ensemble",
              icon: IconEye,
              url: "/developers/overview",
              permission: "developers.read",
            },
            {
              title: "Clés API",
              icon: IconKey,
              url: "/developers/api-keys",
              permission: "api_keys.read",
            },
            {
              title: "Hooks & Triggers",
              icon: IconBolt,
              url: "/developers/hooks",
              permission: "hooks.read",
            },
            {
              title: "Événements/Logs",
              icon: IconListDetails,
              url: "/developers/events-&-logs",
              permission: "logs.read",
            },
            {
              title: "Traductions i18n",
              icon: IconLanguage,
              url: "/developers/translations",
              permission: "core.translations.read",
            },
          ],
        },
        {
          title: "Utilisateurs",
          icon: IconUsers,
          permission: "users.read",
          items: [
            {
              title: "Comptes",
              icon: IconUser,
              url: "/users",
              permission: "users.read",
            },
            {
              title: "Groupes",
              icon: IconUsersGroup,
              url: "/users/groups",
              permission: "groups.read",
            },
            {
              title: "Rôles & Permissions",
              icon: IconShield,
              url: "/users/rbac",
              permission: "roles.read",
            },
          ],
        },
      ],
    },
  ],
}
