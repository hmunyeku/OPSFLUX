/**
 * Simple toast hook for notifications
 * This is a temporary implementation until a proper toast library is integrated
 */

export interface ToastProps {
  title: string
  description?: string
  variant?: "default" | "destructive"
}

export function useToast() {
  const toast = ({ title, description, variant }: ToastProps) => {
    const prefix = variant === "destructive" ? "❌ ERREUR" : "✓ INFO"
    const message = `${prefix}: ${title}${description ? '\n' + description : ''}`

    console.log(`[${variant || 'default'}] ${title}${description ? ': ' + description : ''}`)

    // Simple alert for now - in production, this should use a proper toast library
    if (typeof window !== "undefined") {
      alert(message)
    }
  }

  return { toast }
}
