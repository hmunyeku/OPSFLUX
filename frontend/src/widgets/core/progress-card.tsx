"use client"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ProgressCardProps {
  config: {
    title?: string
    value?: number
    max?: number
    label?: string
    description?: string
    showPercentage?: boolean
    color?: "default" | "success" | "warning" | "danger" | "blue" | "purple" | "pink"
  }
}

export default function ProgressCard({ config }: ProgressCardProps) {
  const {
    title = "Progression",
    value = 0,
    max = 100,
    label,
    description,
    showPercentage = true,
    color = "default",
  } = config

  const percentage = Math.round((value / max) * 100)

  const getColorClasses = () => {
    switch (color) {
      case "success":
        return {
          bg: "bg-emerald-500 dark:bg-emerald-600",
          text: "text-emerald-600 dark:text-emerald-400",
          badge: "bg-emerald-50 dark:bg-emerald-950/20"
        }
      case "warning":
        return {
          bg: "bg-amber-500 dark:bg-amber-600",
          text: "text-amber-600 dark:text-amber-400",
          badge: "bg-amber-50 dark:bg-amber-950/20"
        }
      case "danger":
        return {
          bg: "bg-red-500 dark:bg-red-600",
          text: "text-red-600 dark:text-red-400",
          badge: "bg-red-50 dark:bg-red-950/20"
        }
      case "purple":
        return {
          bg: "bg-purple-500 dark:bg-purple-600",
          text: "text-purple-600 dark:text-purple-400",
          badge: "bg-purple-50 dark:bg-purple-950/20"
        }
      case "pink":
        return {
          bg: "bg-pink-500 dark:bg-pink-600",
          text: "text-pink-600 dark:text-pink-400",
          badge: "bg-pink-50 dark:bg-pink-950/20"
        }
      default:
        return {
          bg: "bg-primary",
          text: "text-primary",
          badge: "bg-primary/10"
        }
    }
  }

  const colors = getColorClasses()

  return (
    <div className="h-full flex flex-col justify-between p-4 sm:p-6">
      {/* Value & Percentage */}
      <div className="flex items-end justify-between gap-4 mb-4 sm:mb-6">
        <div className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums">
          {value}
          <span className="text-base sm:text-lg text-muted-foreground ml-1 font-normal">/ {max}</span>
        </div>
        {showPercentage && (
          <div className={cn(
            "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-sm sm:text-base font-bold tabular-nums",
            colors.text,
            colors.badge
          )}>
            {percentage}%
          </div>
        )}
      </div>

      {/* Progress Bar - Modern Style */}
      <div className="space-y-2 sm:space-y-3">
        <div className="relative h-2.5 sm:h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 ease-out rounded-full",
              colors.bg
            )}
            style={{ width: `${percentage}%` }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>

        {/* Label & Description */}
        <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
          {label && <span className="font-medium">{label}</span>}
          {description && (
            <span className="text-right line-clamp-1">{description}</span>
          )}
        </div>
      </div>

      {/* Shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  )
}
