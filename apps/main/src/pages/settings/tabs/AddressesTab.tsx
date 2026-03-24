/**
 * Addresses tab — uses shared AddressManager component.
 * Displays addresses for the current user (owner_type='user').
 */
import { useAuthStore } from '@/stores/authStore'
import { AddressManager } from '@/components/shared/AddressManager'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'

export function AddressesTab() {
  const userId = useAuthStore((s) => s.user?.id)

  return (
    <CollapsibleSection
      id="user-addresses"
      title="Adresses"
      description="Gérez vos adresses personnelles : domicile, lieu de travail, points de ramassage et autres lieux fréquents."
      storageKey="settings.addresses.collapse"
      showSeparator={false}
    >
      <div className="mt-2">
        <AddressManager ownerType="user" ownerId={userId} compact />
      </div>
    </CollapsibleSection>
  )
}
