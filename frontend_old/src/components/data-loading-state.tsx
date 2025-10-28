import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/error-state"
import { EmptyState } from "@/components/empty-state"
import { IconInbox } from "@tabler/icons-react"

interface DataLoadingStateProps {
  loading: boolean
  error?: string | null
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  emptyIcon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  skeletonCount?: number
  skeletonClassName?: string
  onRetry?: () => void
}

export function DataLoadingState({
  loading,
  error,
  empty,
  emptyTitle = "Aucune donnée",
  emptyDescription = "Il n'y a aucune donnée à afficher pour le moment",
  emptyAction,
  emptyIcon = IconInbox,
  children,
  skeletonCount = 3,
  skeletonClassName = "h-12 w-full",
  onRetry,
}: DataLoadingStateProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton key={i} className={skeletonClassName} />
        ))}
      </div>
    )
  }

  if (error) {
    return <ErrorState message={error} retry={onRetry} />
  }

  if (empty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return <>{children}</>
}
