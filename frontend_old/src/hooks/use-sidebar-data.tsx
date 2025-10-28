"use client"

import { useMemo } from "react"
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
} from "@tabler/icons-react"
import { AudioWaveform, GalleryVerticalEnd } from "lucide-react"
import { Logo } from "@/components/logo"
import { type SidebarData } from "@/components/layout/types"
import { useTranslation } from "./use-translation"

/**
 * Hook pour obtenir les données de la sidebar avec traductions
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation("core.sidebar")

  const sidebarData = useMemo((): SidebarData => ({
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
        title: t("navgroup.general", "Général"),
        items: [
          {
            title: t("dashboard", "Tableau de bord"),
            icon: IconLayoutDashboard,
            permission: "dashboard.read",
            items: [
              {
                title: t("dashboard.1", "Tableau de bord 1"),
                url: "/",
              },
              {
                title: t("dashboard.2", "Tableau de bord 2"),
                url: "/dashboard-2",
              },
              {
                title: t("dashboard.3", "Tableau de bord 3"),
                url: "/dashboard-3",
              },
            ],
          },
          {
            title: t("tasks", "Tâches"),
            url: "/tasks",
            icon: IconChecklist,
            permission: "tasks.read",
          },
        ],
      },
      {
        title: t("navgroup.other", "Autre"),
        items: [
          {
            title: t("settings", "Paramètres"),
            icon: IconSettings,
            url: "/settings",
            permission: "settings.read",
          },
          {
            title: t("developers", "Développeurs"),
            icon: IconCode,
            permission: "developers.read",
            items: [
              {
                title: t("developers.overview", "Vue d'ensemble"),
                icon: IconEye,
                url: "/developers/overview",
                permission: "developers.read",
              },
              {
                title: t("developers.api_keys", "Clés API"),
                icon: IconKey,
                url: "/developers/api-keys",
                permission: "api_keys.read",
              },
              {
                title: t("developers.hooks", "Hooks & Triggers"),
                icon: IconBolt,
                url: "/developers/hooks",
                permission: "hooks.read",
              },
              {
                title: t("developers.events_logs", "Événements/Logs"),
                icon: IconListDetails,
                url: "/developers/events-&-logs",
                permission: "logs.read",
              },
            ],
          },
          {
            title: t("users", "Utilisateurs"),
            icon: IconUsers,
            permission: "users.read",
            items: [
              {
                title: t("users.accounts", "Comptes"),
                icon: IconUser,
                url: "/users",
                permission: "users.read",
              },
              {
                title: t("users.groups", "Groupes"),
                icon: IconUsersGroup,
                url: "/users/groups",
                permission: "groups.read",
              },
              {
                title: t("users.rbac", "Rôles & Permissions"),
                icon: IconShield,
                url: "/users/rbac",
                permission: "roles.read",
              },
            ],
          },
        ],
      },
    ],
  }), [t])

  return sidebarData
}
