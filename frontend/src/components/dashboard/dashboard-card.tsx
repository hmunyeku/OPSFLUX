"use client"

import { Dashboard } from "@/types/dashboard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  IconChartBar,
  IconLock,
  IconWorld,
  IconLayoutGrid,
  IconClock,
  IconStar,
  IconUsers,
  IconEdit,
  IconTrash,
  IconCopy,
  IconEye,
  IconSparkles,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconDots } from "@tabler/icons-react"

interface DashboardCardProps {
  dashboard: Dashboard
  onEdit?: (dashboard: Dashboard) => void
  onDelete?: (dashboard: Dashboard) => void
  onClone?: (dashboard: Dashboard) => void
  variant?: "default" | "compact" | "featured"
}

export function DashboardCard({
  dashboard,
  onEdit,
  onDelete,
  onClone,
  variant = "default"
}: DashboardCardProps) {
  const widgetCount = (dashboard.widgets || []).length
  const canEdit = !dashboard.is_mandatory

  if (variant === "compact") {
    return (
      <Link href={`/dashboards/${dashboard.id}`}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <Card className="group hover:shadow-xl hover:border-primary/50 transition-all duration-300 cursor-pointer overflow-hidden relative">
            {/* Gradient background effet */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <CardHeader className="relative pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 group-hover:text-primary transition-colors line-clamp-1">
                    <IconChartBar className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{dashboard.name}</span>
                  </CardTitle>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant="secondary" className="text-xs">
                    {widgetCount}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>
        </motion.div>
      </Link>
    )
  }

  if (variant === "featured") {
    return (
      <Link href={`/dashboards/${dashboard.id}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          whileHover={{ y: -5 }}
        >
          <Card className="group hover:shadow-2xl transition-all duration-500 cursor-pointer overflow-hidden relative border-2 border-primary/20 hover:border-primary/50">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <CardHeader className="relative pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <IconSparkles className="h-5 w-5 text-primary" />
                    </div>
                    {dashboard.is_default_in_menu && (
                      <IconStar className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                  <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                    {dashboard.name}
                  </CardTitle>
                  {dashboard.description && (
                    <CardDescription className="line-clamp-2">
                      {dashboard.description}
                    </CardDescription>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <IconLayoutGrid className="h-4 w-4" />
                    <span className="font-medium">{widgetCount}</span>
                  </span>
                  {dashboard.created_at && (
                    <span className="flex items-center gap-1.5">
                      <IconClock className="h-4 w-4" />
                      {new Date(dashboard.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short"
                      })}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  {dashboard.is_mandatory && (
                    <Badge variant="secondary" className="text-xs">
                      <IconLock className="h-3 w-3 mr-1" />
                      Requis
                    </Badge>
                  )}
                  {dashboard.is_public && (
                    <Badge variant="outline" className="text-xs">
                      <IconWorld className="h-3 w-3 mr-1" />
                      Public
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </Link>
    )
  }

  // Default variant
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card className="group hover:shadow-lg hover:border-primary/50 transition-all duration-300 cursor-pointer h-full overflow-hidden relative">
        {/* Subtle gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        <CardHeader className="relative pb-3">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/dashboards/${dashboard.id}`} className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <IconChartBar className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg flex items-center gap-2 group-hover:text-primary transition-colors mb-1">
                    <span className="truncate">{dashboard.name}</span>
                    {dashboard.is_default_in_menu && (
                      <IconStar className="h-4 w-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                    )}
                  </CardTitle>
                  {dashboard.description && (
                    <CardDescription className="line-clamp-2 text-sm">
                      {dashboard.description}
                    </CardDescription>
                  )}
                </div>
              </div>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <IconDots className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboards/${dashboard.id}`} className="flex items-center">
                    <IconEye className="h-4 w-4 mr-2" />
                    Voir
                  </Link>
                </DropdownMenuItem>
                {canEdit && onEdit && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(dashboard); }}>
                    <IconEdit className="h-4 w-4 mr-2" />
                    Éditer
                  </DropdownMenuItem>
                )}
                {onClone && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClone(dashboard); }}>
                    <IconCopy className="h-4 w-4 mr-2" />
                    Dupliquer
                  </DropdownMenuItem>
                )}
                {canEdit && onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onDelete(dashboard); }}
                      className="text-destructive focus:text-destructive"
                    >
                      <IconTrash className="h-4 w-4 mr-2" />
                      Supprimer
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="relative pt-0">
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <IconLayoutGrid className="h-4 w-4" />
                {widgetCount} {widgetCount > 1 ? "widgets" : "widget"}
              </span>
              {dashboard.created_at && (
                <span className="flex items-center gap-1.5">
                  <IconClock className="h-4 w-4" />
                  {new Date(dashboard.created_at).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {dashboard.is_mandatory && (
                <Badge variant="secondary" className="text-xs">
                  <IconLock className="h-3 w-3 mr-1" />
                  Obligatoire
                </Badge>
              )}
              {dashboard.is_public && (
                <Badge variant="outline" className="text-xs">
                  <IconWorld className="h-3 w-3 mr-1" />
                  Public
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
