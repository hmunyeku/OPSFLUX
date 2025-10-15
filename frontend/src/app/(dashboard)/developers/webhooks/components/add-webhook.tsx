"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MutateWebhook } from "./mutate-webhook"

interface AddWebhookProps {
  onWebhookAdded?: () => void
}

export function AddWebhook({ onWebhookAdded }: AddWebhookProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="default" onClick={() => setOpen(true)}>
        <Plus /> Ajouter un webhook
      </Button>

      <MutateWebhook open={open} setOpen={setOpen} onWebhookMutated={onWebhookAdded} />
    </>
  )
}
