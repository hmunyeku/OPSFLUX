import { BackupsContent } from "@/components/settings/backups-content"

export default function BackupsPage() {
  return (
    <div className="flex-1 space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sauvegardes</h2>
      </div>
      <BackupsContent />
    </div>
  )
}
