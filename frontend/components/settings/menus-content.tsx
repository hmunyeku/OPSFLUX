"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Menu, Plus, Edit, Trash2, GripVertical, Eye, EyeOff } from "lucide-react"

type MenuItem = {
  id: string
  label: string
  icon: string
  url: string
  position: number
  visible: boolean
  parent?: string
  children?: MenuItem[]
}

const mockMenuItems: MenuItem[] = [
  { id: "1", label: "Dashboard", icon: "LayoutDashboard", url: "/", position: 1, visible: true },
  { id: "2", label: "Tiers", icon: "Building2", url: "/tiers", position: 2, visible: true },
  { id: "3", label: "Projects", icon: "FolderKanban", url: "/projects", position: 3, visible: true },
  { id: "4", label: "Organizer", icon: "Calendar", url: "/organizer", position: 4, visible: true },
  { id: "5", label: "Rédacteur", icon: "FileText", url: "/redacteur", position: 5, visible: true },
  { id: "6", label: "POBVue", icon: "Users", url: "/pobvue", position: 6, visible: true },
  { id: "7", label: "TravelWiz", icon: "Plane", url: "/travelwiz", position: 7, visible: true },
  { id: "8", label: "MOCVue", icon: "GitBranch", url: "/mocvue", position: 8, visible: false },
  { id: "9", label: "CleanVue", icon: "Sparkles", url: "/cleanvue", position: 9, visible: true },
  { id: "10", label: "PowerTrace", icon: "Zap", url: "/powertrace", position: 10, visible: true },
]

export function SettingsMenusContent() {
  const [menuItems] = useState<MenuItem[]>(mockMenuItems)

  const stats = {
    total: menuItems.length,
    visible: menuItems.filter((m) => m.visible).length,
    hidden: menuItems.filter((m) => !m.visible).length,
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des Menus</h1>
          <p className="text-sm text-muted-foreground">Configurer la navigation et les menus</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un Menu
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 p-1.5 dark:bg-blue-900">
              <Menu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Menus</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-green-100 p-1.5 dark:bg-green-900">
              <Eye className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Visibles</p>
              <p className="text-xl font-bold">{stats.visible}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-orange-100 p-1.5 dark:bg-orange-900">
              <EyeOff className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cachés</p>
              <p className="text-xl font-bold">{stats.hidden}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead className="w-12">Position</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Icône</TableHead>
              <TableHead>URL</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menuItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <GripVertical className="h-4 w-4 cursor-move text-muted-foreground" />
                </TableCell>
                <TableCell className="font-mono text-sm">{item.position}</TableCell>
                <TableCell className="font-medium">{item.label}</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-2 py-1 text-xs">{item.icon}</code>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.url}</TableCell>
                <TableCell>
                  {item.visible ? (
                    <Badge variant="default" className="gap-1">
                      <Eye className="h-3 w-3" />
                      Visible
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <EyeOff className="h-3 w-3" />
                      Caché
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                      {item.visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0 bg-transparent">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
