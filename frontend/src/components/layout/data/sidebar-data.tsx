import {
  IconLayoutDashboard,
  IconChartBar,
  IconCalendar,
  IconAlertTriangle,
  IconUsers,
  IconPackage,
  IconShip,
  IconBriefcase,
  IconFileText,
  IconShield,
  IconSettings,
  IconUser,
  IconCoin,
  IconBell,
  IconCode,
} from "@tabler/icons-react"
import { Ship } from "lucide-react"
import { cn } from "@/lib/utils"
import { type SidebarData } from "../types"

export const sidebarData: SidebarData = {
  user: {
    name: "User",
    email: "user@opsflux.io",
    avatar: "/avatars/default-avatar.png",
  },
  teams: [
    {
      name: "OpsFlux",
      logo: ({ className }: { className: string }) => (
        <Ship className={cn("h-5 w-5", className)} />
      ),
      plan: "Oil & Gas Operations",
    },
  ],
  navGroups: [
    {
      title: "Principal",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: IconLayoutDashboard,
        },
        {
          title: "Analytics",
          url: "/analytics",
          icon: IconChartBar,
        },
        {
          title: "Calendar",
          url: "/calendar",
          icon: IconCalendar,
        },
      ],
    },
    {
      title: "Operations",
      items: [
        {
          title: "HSE Reports",
          url: "/hse-reports",
          icon: IconAlertTriangle,
          badge: "3",
        },
        {
          title: "POB Management",
          url: "/pob",
          icon: IconUsers,
        },
        {
          title: "Logistics",
          url: "/logistics",
          icon: IconPackage,
        },
        {
          title: "Offshore Booking",
          url: "/booking",
          icon: IconShip,
        },
      ],
    },
    {
      title: "Management",
      items: [
        {
          title: "Assets",
          url: "/assets",
          icon: IconBriefcase,
        },
        {
          title: "Documents",
          url: "/documents",
          icon: IconFileText,
        },
        {
          title: "Users",
          url: "/users",
          icon: IconUsers,
        },
        {
          title: "Roles",
          url: "/roles",
          icon: IconShield,
        },
      ],
    },
    {
      title: "Settings",
      items: [
        {
          title: "Settings",
          icon: IconSettings,
          items: [
            {
              title: "General",
              url: "/settings",
              icon: IconSettings,
            },
            {
              title: "Profile",
              url: "/settings/profile",
              icon: IconUser,
            },
            {
              title: "Billing",
              url: "/settings/billing",
              icon: IconCoin,
            },
            {
              title: "Notifications",
              url: "/settings/notifications",
              icon: IconBell,
            },
          ],
        },
        {
          title: "Developers",
          icon: IconCode,
          items: [
            {
              title: "API Keys",
              url: "/developers/api-keys",
            },
            {
              title: "Webhooks",
              url: "/developers/webhooks",
            },
            {
              title: "Events & Logs",
              url: "/developers/logs",
            },
          ],
        },
      ],
    },
  ],
}
