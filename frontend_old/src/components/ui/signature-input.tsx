"use client"

import { useRef, useState, useEffect } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { IconTrash, IconUpload, IconPencil, IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

interface SignatureInputProps {
  value?: string | null
  onChange?: (signature: string | null) => void
  label?: string
  description?: string
  className?: string
}

export function SignatureInput({
  value,
  onChange,
  label = "Signature",
  description,
  className,
}: SignatureInputProps) {
  const canvasRef = useRef<SignatureCanvas>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  // Initialize canvas with existing signature
  useEffect(() => {
    if (value && canvasRef.current && !isDrawing) {
      try {
        canvasRef.current.fromDataURL(value)
        setHasSignature(true)
      } catch (error) {
        console.error("Error loading signature:", error)
      }
    }
  }, [value, isDrawing])

  const handleClear = () => {
    if (canvasRef.current) {
      canvasRef.current.clear()
      setHasSignature(false)
      setIsDrawing(false)
      onChange?.(null)
    }
  }

  const handleSave = () => {
    if (canvasRef.current && !canvasRef.current.isEmpty()) {
      const dataURL = canvasRef.current.toDataURL("image/png")
      setHasSignature(true)
      setIsDrawing(false)
      onChange?.(dataURL)
    }
  }

  const handleBegin = () => {
    setIsDrawing(true)
  }

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      alert("Veuillez sélectionner une image")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataURL = e.target?.result as string
      if (canvasRef.current) {
        canvasRef.current.fromDataURL(dataURL)
        setHasSignature(true)
        setIsDrawing(false)
        onChange?.(dataURL)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label}
        </label>
      )}
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      <Card className="p-4 space-y-3">
        <div className="border rounded-md overflow-hidden bg-white" style={{ touchAction: "none" }}>
          <SignatureCanvas
            ref={canvasRef}
            canvasProps={{
              width: 500,
              height: 200,
              className: "w-full h-[200px]",
            }}
            backgroundColor="rgb(255, 255, 255)"
            onBegin={handleBegin}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="gap-2"
          >
            <IconTrash className="h-4 w-4" />
            Effacer
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            className="gap-2"
          >
            <IconUpload className="h-4 w-4" />
            Importer
          </Button>

          {isDrawing && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              className="gap-2"
            >
              <IconCheck className="h-4 w-4" />
              Valider
            </Button>
          )}

          {hasSignature && !isDrawing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDrawing(true)}
              className="gap-2"
            >
              <IconPencil className="h-4 w-4" />
              Modifier
            </Button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />

        {hasSignature && !isDrawing && (
          <p className="text-xs text-muted-foreground">
            ✓ Signature enregistrée
          </p>
        )}
      </Card>
    </div>
  )
}
