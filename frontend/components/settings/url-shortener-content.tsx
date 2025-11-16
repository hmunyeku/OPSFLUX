"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Link2, Copy, Trash2, Plus, ExternalLink, BarChart3, Search } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ShortUrl {
  id: string
  shortCode: string
  originalUrl: string
  clicks: number
  createdBy: string
  createdAt: string
  expiresAt?: string
  status: "active" | "expired" | "disabled"
}

const mockShortUrls: ShortUrl[] = [
  {
    id: "1",
    shortCode: "proj-2024",
    originalUrl: "https://opsflux.com/projects/platform-upgrade-2024/details",
    clicks: 1247,
    createdBy: "Jean Dupont",
    createdAt: "2024-01-15",
    status: "active",
  },
  {
    id: "2",
    shortCode: "doc-safety",
    originalUrl: "https://opsflux.com/redacteur/documents/safety-procedures-offshore",
    clicks: 856,
    createdBy: "Marie Martin",
    createdAt: "2024-02-20",
    status: "active",
  },
  {
    id: "3",
    shortCode: "report-q1",
    originalUrl: "https://opsflux.com/reports/quarterly/2024-q1/financial-summary",
    clicks: 432,
    createdBy: "Pierre Dubois",
    createdAt: "2024-03-01",
    expiresAt: "2024-12-31",
    status: "active",
  },
  {
    id: "4",
    shortCode: "training",
    originalUrl: "https://opsflux.com/pobvue/training/offshore-safety-certification",
    clicks: 2103,
    createdBy: "Sophie Bernard",
    createdAt: "2023-11-10",
    status: "active",
  },
  {
    id: "5",
    shortCode: "old-link",
    originalUrl: "https://opsflux.com/old-system/legacy-page",
    clicks: 89,
    createdBy: "Admin",
    createdAt: "2023-06-15",
    expiresAt: "2024-01-01",
    status: "expired",
  },
]

export function UrlShortenerContent() {
  const [searchTerm, setSearchTerm] = useState("")
  const [urls, setUrls] = useState(mockShortUrls)

  const filteredUrls = urls.filter(
    (url) =>
      url.shortCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      url.originalUrl.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const activeUrls = filteredUrls.filter((u) => u.status === "active")
  const expiredUrls = filteredUrls.filter((u) => u.status === "expired")
  const totalClicks = urls.reduce((sum, url) => sum + url.clicks, 0)

  const copyToClipboard = (shortCode: string) => {
    navigator.clipboard.writeText(`https://ops.flux/${shortCode}`)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">URL Shortener</h1>
          <p className="text-[11px] text-muted-foreground">Gérez vos liens courts et suivez les statistiques</p>
        </div>
        <Button size="sm" className="h-7 text-[11px]">
          <Plus className="h-3 w-3 mr-1" />
          Créer un lien court
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-blue-500/10 flex items-center justify-center">
              <Link2 className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Total Liens</p>
              <p className="text-sm font-semibold">{urls.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-green-500/10 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Total Clics</p>
              <p className="text-sm font-semibold">{totalClicks.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-emerald-500/10 flex items-center justify-center">
              <Link2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Actifs</p>
              <p className="text-sm font-semibold">{activeUrls.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-orange-500/10 flex items-center justify-center">
              <Link2 className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Expirés</p>
              <p className="text-sm font-semibold">{expiredUrls.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Rechercher par code court ou URL..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-7 pl-7 text-[11px]"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="flex-1">
        <TabsList className="h-7">
          <TabsTrigger value="all" className="text-[11px] h-6">
            Tous ({filteredUrls.length})
          </TabsTrigger>
          <TabsTrigger value="active" className="text-[11px] h-6">
            Actifs ({activeUrls.length})
          </TabsTrigger>
          <TabsTrigger value="expired" className="text-[11px] h-6">
            Expirés ({expiredUrls.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-2">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-1.5 text-[10px] font-medium">Code Court</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">URL Originale</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Clics</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Créé par</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Date création</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Expiration</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Statut</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUrls.map((url) => (
                    <tr key={url.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <code className="text-[11px] font-mono bg-muted px-1 rounded">ops.flux/{url.shortCode}</code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => copyToClipboard(url.shortCode)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1 max-w-md">
                          <span className="text-[11px] truncate">{url.originalUrl}</span>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 flex-shrink-0" asChild>
                            <a href={url.originalUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        </div>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px] font-medium">{url.clicks.toLocaleString()}</span>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px]">{url.createdBy}</span>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px]">{url.createdAt}</span>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px]">{url.expiresAt || "—"}</span>
                      </td>
                      <td className="p-1.5">
                        <Badge
                          variant={url.status === "active" ? "default" : "secondary"}
                          className="text-[9px] h-4 px-1"
                        >
                          {url.status === "active" ? "Actif" : "Expiré"}
                        </Badge>
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <BarChart3 className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="mt-2">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-1.5 text-[10px] font-medium">Code Court</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">URL Originale</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Clics</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Créé par</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeUrls.map((url) => (
                    <tr key={url.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-1.5">
                        <code className="text-[11px] font-mono bg-muted px-1 rounded">ops.flux/{url.shortCode}</code>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px] truncate max-w-md block">{url.originalUrl}</span>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px] font-medium">{url.clicks.toLocaleString()}</span>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px]">{url.createdBy}</span>
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <BarChart3 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="expired" className="mt-2">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-1.5 text-[10px] font-medium">Code Court</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">URL Originale</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Expiré le</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredUrls.map((url) => (
                    <tr key={url.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-1.5">
                        <code className="text-[11px] font-mono bg-muted px-1 rounded opacity-50">
                          ops.flux/{url.shortCode}
                        </code>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px] truncate max-w-md block opacity-50">{url.originalUrl}</span>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px]">{url.expiresAt}</span>
                      </td>
                      <td className="p-1.5">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                          Réactiver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
