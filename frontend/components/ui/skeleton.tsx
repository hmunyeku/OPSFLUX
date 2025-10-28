import { cn } from "@/lib/utils"

/**
 * Skeleton - Composant de chargement
 * Conforme FRONTEND_RULES.md: UNIQUEMENT des skeletons, JAMAIS de spinners
 *
 * Utilisation:
 * - États de chargement de contenu
 * - Feedback visuel pendant les requêtes
 * - Indication de la structure future du contenu
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
