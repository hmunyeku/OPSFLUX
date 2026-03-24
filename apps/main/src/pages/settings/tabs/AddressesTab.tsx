/**
 * Addresses tab — uses shared AddressManager component.
 * Displays addresses for the current user (owner_type='user').
 */
import { useRef } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { AddressManager } from '@/components/shared/AddressManager'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { Plus } from 'lucide-react'

export function AddressesTab() {
  const userId = useAuthStore((s) => s.user?.id)
  const addRef = useRef<(() => void) | null>(null)

  return (
    <CollapsibleSection
      id="user-addresses"
      title="Adresses"
      description="Gérez vos adresses personnelles : domicile, lieu de travail, points de ramassage et autres lieux fréquents."
      storageKey="settings.addresses.collapse"
      showSeparator={false}
      headerAction={
        <button onClick={() => addRef.current?.()} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Ajouter">
          <Plus size={14} />
        </button>
      }
    >
      <div className="mt-2">
        <AddressManager ownerType="user" ownerId={userId} compact hideAddButton onAddRef={(fn) => { addRef.current = fn }} />
      </div>
    </CollapsibleSection>
  )
}
