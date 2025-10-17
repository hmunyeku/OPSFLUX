"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IconPlus } from "@tabler/icons-react"
import EmailTemplatesTable from "./email-templates-table"
import EmailTemplateDialog from "./email-template-dialog"

export default function EmailTemplatesClient() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates d&apos;Email</h1>
          <p className="text-muted-foreground">
            Gérez vos templates d&apos;email réutilisables avec variables dynamiques
          </p>
        </div>
        <Button onClick={handleCreate}>
          <IconPlus className="mr-2 h-4 w-4" />
          Nouveau Template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des Templates</CardTitle>
          <CardDescription>
            Templates d&apos;email pour notifications, alertes, et communications système
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmailTemplatesTable key={refreshKey} onEdit={handleEdit} />
        </CardContent>
      </Card>

      <EmailTemplateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        templateId={selectedTemplateId}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
