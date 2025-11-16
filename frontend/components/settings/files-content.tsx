"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { HardDrive, FileText, ImageIcon, Video, Archive, Trash2, Download } from "lucide-react"

interface StorageStats {
  total: number
  used: number
  files: number
  byType: {
    documents: number
    images: number
    videos: number
    archives: number
    other: number
  }
}

const mockStats: StorageStats = {
  total: 1000, // GB
  used: 347.5,
  files: 12847,
  byType: {
    documents: 125.3,
    images: 89.7,
    videos: 98.2,
    archives: 28.1,
    other: 6.2,
  },
}

const recentFiles = [
  {
    name: "Platform_Inspection_Report_2024.pdf",
    size: "2.4 MB",
    type: "document",
    date: "2024-03-15 14:32",
    user: "Jean Dupont",
  },
  {
    name: "Offshore_Safety_Training.mp4",
    size: "156 MB",
    type: "video",
    date: "2024-03-15 11:20",
    user: "Marie Martin",
  },
  {
    name: "Site_Photos_March_2024.zip",
    size: "89 MB",
    type: "archive",
    date: "2024-03-14 16:45",
    user: "Pierre Dubois",
  },
  { name: "Equipment_Diagram.png", size: "4.7 MB", type: "image", date: "2024-03-14 09:15", user: "Sophie Bernard" },
  { name: "Project_Documentation.docx", size: "1.2 MB", type: "document", date: "2024-03-13 15:30", user: "Luc Petit" },
]

export function FilesContent() {
  const usagePercent = (mockStats.used / mockStats.total) * 100

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Gestion des Fichiers</h1>
        <p className="text-[11px] text-muted-foreground">Gérez le stockage et les fichiers du système</p>
      </div>

      {/* Storage Overview */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-medium">Utilisation du Stockage</h3>
          <span className="text-[11px] text-muted-foreground">
            {mockStats.used} GB / {mockStats.total} GB
          </span>
        </div>
        <Progress value={usagePercent} className="h-2 mb-2" />
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">{mockStats.files.toLocaleString()} fichiers</span>
          <span className="font-medium">{usagePercent.toFixed(1)}% utilisé</span>
        </div>
      </Card>

      {/* Storage by Type */}
      <div className="grid grid-cols-5 gap-2">
        <Card className="p-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded bg-blue-500/10 flex items-center justify-center">
              <FileText className="h-3 w-3 text-blue-500" />
            </div>
            <span className="text-[10px] font-medium">Documents</span>
          </div>
          <p className="text-sm font-semibold">{mockStats.byType.documents} GB</p>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded bg-green-500/10 flex items-center justify-center">
              <ImageIcon className="h-3 w-3 text-green-500" />
            </div>
            <span className="text-[10px] font-medium">Images</span>
          </div>
          <p className="text-sm font-semibold">{mockStats.byType.images} GB</p>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded bg-purple-500/10 flex items-center justify-center">
              <Video className="h-3 w-3 text-purple-500" />
            </div>
            <span className="text-[10px] font-medium">Vidéos</span>
          </div>
          <p className="text-sm font-semibold">{mockStats.byType.videos} GB</p>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded bg-orange-500/10 flex items-center justify-center">
              <Archive className="h-3 w-3 text-orange-500" />
            </div>
            <span className="text-[10px] font-medium">Archives</span>
          </div>
          <p className="text-sm font-semibold">{mockStats.byType.archives} GB</p>
        </Card>
        <Card className="p-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-6 w-6 rounded bg-gray-500/10 flex items-center justify-center">
              <HardDrive className="h-3 w-3 text-gray-500" />
            </div>
            <span className="text-[10px] font-medium">Autres</span>
          </div>
          <p className="text-sm font-semibold">{mockStats.byType.other} GB</p>
        </Card>
      </div>

      {/* Recent Files */}
      <Card className="p-0">
        <div className="p-2 border-b">
          <h3 className="text-[11px] font-medium">Fichiers Récents</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-1.5 text-[10px] font-medium">Nom</th>
                <th className="text-left p-1.5 text-[10px] font-medium">Taille</th>
                <th className="text-left p-1.5 text-[10px] font-medium">Type</th>
                <th className="text-left p-1.5 text-[10px] font-medium">Date</th>
                <th className="text-left p-1.5 text-[10px] font-medium">Utilisateur</th>
                <th className="text-left p-1.5 text-[10px] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentFiles.map((file, idx) => (
                <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-1.5">
                    <span className="text-[11px]">{file.name}</span>
                  </td>
                  <td className="p-1.5">
                    <span className="text-[11px]">{file.size}</span>
                  </td>
                  <td className="p-1.5">
                    <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">
                      {file.type}
                    </Badge>
                  </td>
                  <td className="p-1.5">
                    <span className="text-[11px]">{file.date}</span>
                  </td>
                  <td className="p-1.5">
                    <span className="text-[11px]">{file.user}</span>
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <Download className="h-3 w-3" />
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
    </div>
  )
}
