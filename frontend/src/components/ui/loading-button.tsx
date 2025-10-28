import * as React from "react"
import { Button, ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
  loadingText?: string
}

/**
 * LoadingButton - Bouton avec état de chargement
 * Conforme FRONTEND_RULES.md: Pas de spinner, seulement l'état disabled
 * L'état de chargement est indiqué par:
 * - Le bouton désactivé (loading || disabled)
 * - Optionnel: texte différent via loadingText
 * - Optionnel: opacity réduite via Tailwind
 */
const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ className, children, loading, loadingText, disabled, ...props }, ref) => {
    return (
      <Button
        className={cn(loading && "opacity-70", className)}
        disabled={loading || disabled}
        ref={ref}
        {...props}
      >
        {loading ? loadingText || children : children}
      </Button>
    )
  }
)

LoadingButton.displayName = "LoadingButton"

export { LoadingButton }
