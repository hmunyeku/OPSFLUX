import { Upload } from 'lucide-react'

export function FileDropZone({ active }: { active: boolean }) {
  if (!active) return null

  return (
    <div className="absolute inset-0 z-10 bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg flex flex-col items-center justify-center pointer-events-none">
      <div className="bg-primary/10 rounded-full p-4 mb-3">
        <Upload size={32} className="text-primary/60" />
      </div>
      <p className="text-sm font-medium text-primary/80">Déposer les fichiers ici</p>
      <p className="text-xs text-muted-foreground mt-1">Les fichiers seront uploadés dans le dossier courant</p>
    </div>
  )
}
