"use client"

import { useState, useRef } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Camera, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProfileAvatarProps {
  currentAvatarUrl?: string | null
  fullName?: string
  email?: string
  onAvatarChange: (url: string | null) => void
  size?: "sm" | "md" | "lg" | "xl"
  editable?: boolean
  className?: string
}

const sizeMap = {
  sm: "h-12 w-12",
  md: "h-20 w-20",
  lg: "h-32 w-32",
  xl: "h-40 w-40",
}

export function ProfileAvatar({
  currentAvatarUrl,
  fullName = "",
  email = "",
  onAvatarChange,
  size = "lg",
  editable = true,
  className,
}: ProfileAvatarProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null)
  const [isHovering, setIsHovering] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Generate initials from full name or email
  const getInitials = () => {
    if (fullName) {
      const names = fullName.trim().split(" ")
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
      }
      return fullName.substring(0, 2).toUpperCase()
    }
    if (email) {
      return email.substring(0, 2).toUpperCase()
    }
    return "?"
  }

  // Generate a consistent color based on name/email
  const getAvatarColor = () => {
    const str = fullName || email || "default"
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-orange-500",
      "bg-teal-500",
      "bg-cyan-500",
    ]
    return colors[Math.abs(hash) % colors.length]
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Veuillez sélectionner une image")
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("L'image est trop grande (max 5MB)")
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      setPreviewUrl(result)
      onAvatarChange(result)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAvatar = () => {
    setPreviewUrl(null)
    onAvatarChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className="relative"
        onMouseEnter={() => editable && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <Avatar className={cn(sizeMap[size], "border-4 border-background shadow-lg")}>
          <AvatarImage src={previewUrl || undefined} alt={fullName || email} />
          <AvatarFallback className={cn("text-white font-semibold", getAvatarColor())}>
            {getInitials()}
          </AvatarFallback>
        </Avatar>

        {editable && isHovering && (
          <div
            className={cn(
              "absolute inset-0 rounded-full bg-black/50 flex items-center justify-center cursor-pointer transition-opacity",
              sizeMap[size]
            )}
            onClick={handleClickUpload}
          >
            <Camera className="h-8 w-8 text-white" />
          </div>
        )}

        {editable && previewUrl && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-8 w-8 rounded-full shadow-lg"
            onClick={handleRemoveAvatar}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {editable && (
        <div className="flex flex-col items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id="avatar-upload"
          />
          <Label htmlFor="avatar-upload" className="cursor-pointer">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClickUpload}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {previewUrl ? "Changer la photo" : "Ajouter une photo"}
            </Button>
          </Label>
          <p className="text-xs text-muted-foreground text-center">
            JPG, PNG ou GIF (max 5MB)
          </p>
        </div>
      )}
    </div>
  )
}
