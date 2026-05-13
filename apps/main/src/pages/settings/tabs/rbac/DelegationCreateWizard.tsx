interface Props {
  onClose: () => void
  onCreated: () => void
}

export function DelegationCreateWizard({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-4 dark:bg-slate-800">
        <h3 className="text-lg font-semibold">Wizard en cours de développement</h3>
        <button type="button" onClick={onClose} className="mt-3 rounded-md border px-3 py-1.5 text-sm">
          Fermer
        </button>
      </div>
    </div>
  )
}
