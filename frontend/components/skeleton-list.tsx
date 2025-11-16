"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function SkeletonList() {
  return (
    <div className="border rounded-lg bg-card">
      {/* Table Header */}
      <div className="grid grid-cols-[40px_100px_1fr_150px_150px_120px_150px_40px] gap-4 px-4 py-3 border-b bg-muted/50">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
      </div>

      {/* Table Body */}
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`grid grid-cols-[40px_100px_1fr_150px_150px_120px_150px_40px] gap-4 px-4 py-3 ${
              i % 2 === 0 ? "bg-background" : "bg-muted/20"
            }`}
          >
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <div className="flex gap-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="h-4 w-4" />
          </div>
        ))}
      </div>
    </div>
  )
}
