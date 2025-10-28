"use client"

import { useState } from "react"
import { IconAlertTriangle, IconUserOff, IconTrash } from "@tabler/icons-react"
import { toast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { t } from "./delete-actions-translations"

export function DeleteActions() {
  const [opened, setOpened] = useState(false)

  const [value, setValue] = useState("")
  const [type, setType] = useState<"delete" | "deactivate">("delete")

  const handleAction = () => {
    setOpened(false)
    toast({
      title: type === "delete" ? t("accountDeleted") : t("accountDeactivated"),
      description: type === "delete"
        ? t("deletedDescription")
        : t("deactivatedDescription"),
      variant: "default",
    })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
        <div className="flex items-start gap-3">
          <IconAlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
              {t("dangerZone")}
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-200 mb-3">
              {t("dangerZoneDescription")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setOpened(true)
                  setType("deactivate")
                }}
                variant="outline"
                type="button"
                size="sm"
                className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-950"
              >
                <IconUserOff className="h-4 w-4 mr-2" />
                {t("deactivateAccount")}
              </Button>

              <Button
                onClick={() => {
                  setOpened(true)
                  setType("delete")
                }}
                type="button"
                size="sm"
                variant="destructive"
              >
                <IconTrash className="h-4 w-4 mr-2" />
                {t("deleteAccount")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={opened}
        onOpenChange={() => setOpened((prev) => !prev)}
        handleConfirm={handleAction}
        title={
          <span className="text-destructive flex items-center gap-2">
            <IconAlertTriangle className="h-5 w-5" />
            {type === "delete" ? t("deleteTitle") : t("deactivateTitle")}
          </span>
        }
        desc={
          <div className="space-y-4">
            <p className="text-sm">
              {type === "delete"
                ? t("deleteConfirm")
                : t("deactivateConfirm")}
            </p>

            {type === "delete" && (
              <p className="text-sm text-muted-foreground">
                {t("deleteDetails")}
              </p>
            )}

            {type === "deactivate" && (
              <p className="text-sm text-muted-foreground">
                {t("deactivateDetails")}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="email-confirm" className="text-sm font-medium">
                {t("emailConfirmLabel")}
              </Label>
              <Input
                id="email-confirm"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t("emailPlaceholder")}
                type="email"
              />
            </div>

            <Alert variant="destructive">
              <IconAlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("warningTitle")}</AlertTitle>
              <AlertDescription>
                {t("warningDescription")}
              </AlertDescription>
            </Alert>
          </div>
        }
        confirmText={
          <span className="capitalize">
            {type === "delete" ? t("deleteButton") : t("deactivateButton")}
          </span>
        }
        destructive
      />
    </div>
  )
}
