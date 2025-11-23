import { Suspense } from "react"
import { TaskCreateContent } from "@/components/projects/task-create-content"
import { Skeleton } from "@/components/ui/skeleton"

// Force dynamic rendering for useSearchParams
export const dynamic = "force-dynamic"

function LoadingFallback() {
  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <TaskCreateContent />
    </Suspense>
  )
}
