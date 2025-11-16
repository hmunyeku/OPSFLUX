import { CacheContent } from "@/components/settings/cache-content"

export default function CachePage() {
  return (
    <div className="flex-1 space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Gestion du Cache</h2>
      </div>
      <CacheContent />
    </div>
  )
}
