import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const sizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
}

export default function Spinner({ className, size = 'md', label }: SpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <Loader2 className={cn('animate-spinner text-brand-500', sizes[size])} />
      {label && <span className="text-sm text-[var(--text-secondary)]">{label}</span>}
    </div>
  )
}
