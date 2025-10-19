"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { IconMapPin, IconPlus, IconPencil, IconTrash, IconStar } from "@tabler/icons-react"
import { useTranslation } from "@/hooks/use-translation"
import { useAuth } from "@/hooks/use-auth"
import { auth } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"
import { AddressInput, type AddressData } from "@/components/ui/address-input"
import { getUserAddresses, getAddressTypes, createAddress, updateAddress, deleteAddress, type Address, type AddressType } from "../../../users/data/addresses-api"
import { showLoadError, showCreateSuccess, showUpdateSuccess, showDeleteSuccess, showErrorToast } from "@/lib/toast-helpers"

export function UserAddressesCard() {
  const { t } = useTranslation("core.profile")
  const { user } = useAuth()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressTypes, setAddressTypes] = useState<AddressType[]>([])
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Sheet states
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [currentAddress, setCurrentAddress] = useState<Address | null>(null)
  const [addressData, setAddressData] = useState<AddressData | undefined>(undefined)

  useEffect(() => {
    loadData()
  }, [user])

  async function loadData() {
    if (!user) return

    try {
      setLoading(true)
      const [addressesData, typesData] = await Promise.all([
        getUserAddresses(user.id),
        getAddressTypes(),
      ])
      setAddresses(addressesData)
      setAddressTypes(typesData)
    } catch (error) {
      console.error("Failed to load addresses:", error)
      showLoadError(t("addresses.title", "les adresses"), loadData)
    } finally {
      setLoading(false)
    }
  }

  function handleAddClick() {
    setAddressData(undefined)
    setAddSheetOpen(true)
  }

  function handleEditClick(address: Address) {
    setCurrentAddress(address)
    setAddressData({
      address_type_id: address.address_type_id,
      label: address.label || "",
      street_line1: address.street_line1,
      street_line2: address.street_line2 || "",
      city: address.city,
      state: address.state || "",
      postal_code: address.postal_code,
      country: address.country,
      latitude: address.latitude,
      longitude: address.longitude,
      place_id: address.place_id,
      formatted_address: address.formatted_address,
      phone: address.phone || "",
      email: address.email || "",
      notes: address.notes || "",
      is_default: address.is_default,
    })
    setEditSheetOpen(true)
  }

  function handleDeleteClick(address: Address) {
    setCurrentAddress(address)
    setDeleteDialogOpen(true)
  }

  async function handleAddAddress() {
    if (!addressData || !user) return

    try {
      setIsSubmitting(true)
      await createAddress({
        ...addressData,
        entity_type: "user",
        entity_id: user.id,
      })

      showCreateSuccess(t("entity.address", "L'adresse"))

      setAddSheetOpen(false)
      setAddressData(undefined)
      await loadData()
    } catch (error) {
      showErrorToast(
        t("toast.error_adding", "Échec de l'ajout"),
        error,
        handleAddAddress
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleUpdateAddress() {
    if (!addressData || !currentAddress) return

    try {
      setIsSubmitting(true)
      await updateAddress(currentAddress.id, addressData)

      showUpdateSuccess(t("entity.address", "L'adresse"))

      setEditSheetOpen(false)
      setCurrentAddress(null)
      setAddressData(undefined)
      await loadData()
    } catch (error) {
      showErrorToast(
        t("toast.error_updating", "Échec de la mise à jour"),
        error,
        handleUpdateAddress
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function confirmDelete() {
    if (!currentAddress) return

    try {
      await deleteAddress(currentAddress.id)

      showDeleteSuccess(t("entity.address", "L'adresse"))

      setDeleteDialogOpen(false)
      setCurrentAddress(null)
      await loadData()
    } catch (error) {
      showErrorToast(
        t("toast.error_deleting", "Échec de la suppression"),
        error,
        confirmDelete
      )
    }
  }

  const getAddressTypeName = (typeId: string) => {
    const type = addressTypes.find((t) => t.id === typeId)
    return type?.name || typeId
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <IconMapPin className="h-5 w-5" />
                {t("addresses.title", "Mes Adresses")}
              </CardTitle>
              <CardDescription>
                {t("addresses.description", "Gérez vos adresses personnelles et professionnelles")}
              </CardDescription>
            </div>
            <Button onClick={handleAddClick} size="sm" className="gap-2">
              <IconPlus className="h-4 w-4" />
              {t("addresses.add", "Ajouter")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : addresses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <IconMapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>{t("addresses.empty", "Aucune adresse enregistrée")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map((address) => (
                <div
                  key={address.id}
                  className="rounded-lg border p-4 space-y-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{getAddressTypeName(address.address_type_id)}</Badge>
                        {address.label && (
                          <span className="text-sm font-medium">{address.label}</span>
                        )}
                        {address.is_default && (
                          <Badge variant="default" className="gap-1">
                            <IconStar className="h-3 w-3" />
                            {t("addresses.default", "Par défaut")}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>{address.street_line1}</p>
                        {address.street_line2 && <p>{address.street_line2}</p>}
                        <p>
                          {address.postal_code} {address.city}
                          {address.state && `, ${address.state}`}
                        </p>
                        <p>{address.country}</p>
                        {address.phone && (
                          <p className="text-xs">
                            📞 {address.phone}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="inline-flex rounded-md border border-input shrink-0" role="group">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(address)}
                        className="h-8 w-8 p-0 rounded-none rounded-l-md border-r"
                      >
                        <IconPencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(address)}
                        className="h-8 w-8 p-0 rounded-none rounded-r-md text-destructive hover:text-destructive"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sheet Ajouter */}
      <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("addresses.add_title", "Ajouter une adresse")}</SheetTitle>
            <SheetDescription>
              {t("addresses.add_desc", "Remplissez les informations de votre nouvelle adresse")}
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <AddressInput
              value={addressData}
              onChange={setAddressData}
              addressTypes={addressTypes}
              required
            />
          </div>
          <SheetFooter className="gap-2">
            <SheetClose asChild>
              <Button variant="outline">
                {t("actions.cancel", "Annuler")}
              </Button>
            </SheetClose>
            <Button onClick={handleAddAddress} disabled={isSubmitting}>
              {isSubmitting ? t("actions.adding", "Ajout...") : t("actions.add", "Ajouter")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sheet Modifier */}
      <Sheet open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("addresses.edit_title", "Modifier l'adresse")}</SheetTitle>
            <SheetDescription>
              {t("addresses.edit_desc", "Modifiez les informations de cette adresse")}
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <AddressInput
              value={addressData}
              onChange={setAddressData}
              addressTypes={addressTypes}
              required
            />
          </div>
          <SheetFooter className="gap-2">
            <SheetClose asChild>
              <Button variant="outline">
                {t("actions.cancel", "Annuler")}
              </Button>
            </SheetClose>
            <Button onClick={handleUpdateAddress} disabled={isSubmitting}>
              {isSubmitting ? t("actions.updating", "Mise à jour...") : t("actions.update", "Modifier")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* AlertDialog Supprimer */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("addresses.delete_title", "Supprimer cette adresse ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("addresses.delete_desc", "Cette action est irréversible. L'adresse sera définitivement supprimée.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("actions.delete", "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
