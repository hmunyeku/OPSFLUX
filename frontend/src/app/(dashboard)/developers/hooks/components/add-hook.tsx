"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MutateHook } from "./mutate-hook"

interface AddHookProps {
  onHookAdded?: () => void
  disabled?: boolean
}

export function AddHook({ onHookAdded, disabled }: AddHookProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="default" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus /> Ajouter un hook
      </Button>

      <MutateHook open={open} setOpen={setOpen} onHookMutated={onHookAdded} />
    </>
  )
}
