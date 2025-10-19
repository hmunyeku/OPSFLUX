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
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-3 sm:gap-4 px-4 sm:px-6 md:px-8 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Templates d&apos;Email
            </h1>
            <p className="text-sm text-muted-foreground">
              Créez et gérez vos templates d&apos;email réutilisables
            </p>
          </div>
          <Button onClick={handleCreate} size="default" className="w-full sm:w-auto">
            <IconPlus className="mr-2 h-4 w-4" />
            Nouveau Template
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 sm:px-6 md:px-8 pb-4 sm:pb-6">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 flex-shrink-0">
            <CardTitle className="text-lg sm:text-xl">Templates Disponibles</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Gérez vos templates pour emails transactionnels, notifications et communications
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 px-0 sm:px-6 overflow-hidden">
            <EmailTemplatesTable key={refreshKey} onEdit={handleEdit} />
          </CardContent>
        </Card>
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
