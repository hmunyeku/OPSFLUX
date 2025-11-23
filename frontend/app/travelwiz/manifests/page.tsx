import { Suspense } from "react"
import { ManifestsContent } from "@/components/travelwiz/manifests-content"
import { Skeleton } from "@/components/ui/skeleton"

// Force dynamic rendering to avoid static prerendering issues
export const dynamic = "force-dynamic"

function LoadingFallback() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  )
}

export default function ManifestsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ManifestsContent />
    </Suspense>
  )
}
