"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { IconPlus, IconMail, IconMailCheck, IconMailOff, IconSearch, IconX } from "@tabler/icons-react"
import EmailTemplatesTable from "./email-templates-table"
import EmailTemplateDialog from "./email-template-dialog"
import { apiClient } from "@/lib/api-client"

interface TemplateStats {
  total: number
  active: number
  inactive: number
  totalSent: number
}

export default function EmailTemplatesClient() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [stats, setStats] = useState<TemplateStats>({
    total: 0,
    active: 0,
    inactive: 0,
    totalSent: 0,
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  const handleCreate = () => {
    setSelectedTemplateId(null)
    setIsDialogOpen(true)
  }

  const handleEdit = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setIsDialogOpen(true)
  }

  const handleSuccess = () => {
    setIsDialogOpen(false)
    setSelectedTemplateId(null)
    setRefreshKey((prev) => prev + 1)
    loadStats()
  }

  const loadStats = async () => {
    try {
      const response = await apiClient.get("/api/v1/email-templates/", {
        params: { skip: 0, limit: 1000 },
      })
      const data = response.data as { data: Array<{ is_active: boolean; sent_count: number }> }
      const templates = data.data

      setStats({
        total: templates.length,
        active: templates.filter(t => t.is_active).length,
        inactive: templates.filter(t => !t.is_active).length,
        totalSent: templates.reduce((sum, t) => sum + t.sent_count, 0),
      })
    } catch (_error) {
      // Silent fail for stats
    }
  }

  useEffect(() => {
    loadStats()
  }, [refreshKey])

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header - Compact */}
      <div className="flex flex-col gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="space-y-0.5">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">
              Templates d&apos;Email
            </h1>
            <p className="text-xs text-muted-foreground">
              Créez et gérez vos templates d&apos;email
            </p>
          </div>
          <Button onClick={handleCreate} size="sm" className="w-full sm:w-auto flex-shrink-0 h-8 text-xs">
            <IconPlus className="mr-1.5 h-3.5 w-3.5" />
            Nouveau
          </Button>
        </div>

        {/* Statistics Cards - Compact */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                  <IconMail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="text-lg font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                  <IconMailCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Actifs</p>
                  <p className="text-lg font-bold">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center">
                  <IconMailOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Inactifs</p>
                  <p className="text-lg font-bold">{stats.inactive}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
            <CardContent className="p-2.5">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center">
                  <IconMail className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">Envoyés</p>
                  <p className="text-lg font-bold">{stats.totalSent.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <IconSearch className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, slug ou description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-9 h-8 text-xs"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery("")}
              >
                <IconX className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex gap-1.5 flex-wrap md:flex-shrink-0">
            <Button
              variant={categoryFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("all")}
              className="flex-1 xs:flex-none h-8 text-xs px-2.5"
            >
              Tous
            </Button>
            <Button
              variant={categoryFilter === "transactional" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("transactional")}
              className="flex-1 xs:flex-none h-8 text-xs px-2.5"
            >
              Transactionnel
            </Button>
            <Button
              variant={categoryFilter === "notification" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("notification")}
              className="flex-1 xs:flex-none h-8 text-xs px-2.5"
            >
              Notification
            </Button>
            <Button
              variant={categoryFilter === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter("custom")}
              className="flex-1 xs:flex-none h-8 text-xs px-2.5"
            >
              Personnalisé
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 px-3 sm:px-4 md:px-6 pb-4 sm:pb-6 w-full">
        <EmailTemplatesTable
          key={refreshKey}
          onEdit={handleEdit}
          searchQuery={searchQuery}
          categoryFilter={categoryFilter}
        />
      </div>

      <EmailTemplateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        templateId={selectedTemplateId}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
