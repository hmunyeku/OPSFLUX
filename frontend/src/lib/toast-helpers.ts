import { toast } from "@/hooks/use-toast"

/**
 * Helper functions for showing toast notifications with consistent styling
 */

export function showSuccessToast(message: string, description?: string) {
  toast({
    title: message,
    description,
    variant: "default",
  })
}

export function showErrorToast(message: string, description?: string) {
  toast({
    title: message,
    description,
    variant: "destructive",
  })
}

export function showInfoToast(message: string, description?: string) {
  toast({
    title: message,
    description,
    variant: "default",
  })
}

export function showWarningToast(message: string, description?: string) {
  toast({
    title: message,
    description,
    variant: "destructive",
  })
}

export function showDeleteSuccess(itemName?: string) {
  toast({
    title: "Suppression réussie",
    description: itemName
      ? `${itemName} a été supprimé avec succès.`
      : "L'élément a été supprimé avec succès.",
    variant: "default",
  })
}

export function showCreateSuccess(itemName?: string) {
  toast({
    title: "Création réussie",
    description: itemName
      ? `${itemName} a été créé avec succès.`
      : "L'élément a été créé avec succès.",
    variant: "default",
  })
}

export function showUpdateSuccess(itemName?: string) {
  toast({
    title: "Mise à jour réussie",
    description: itemName
      ? `${itemName} a été mis à jour avec succès.`
      : "L'élément a été mis à jour avec succès.",
    variant: "default",
  })
}

export function showLoadingToast(message: string) {
  return toast({
    title: message,
    variant: "default",
  })
}

export function showLoadError(message?: string) {
  toast({
    title: "Erreur de chargement",
    description: message || "Une erreur est survenue lors du chargement des données.",
    variant: "destructive",
  })
}

export function dismissToast(toastId: string | number) {
  // Toast dismiss functionality is handled automatically by the toast component
  // This is here for API compatibility
  console.log("Dismissing toast:", toastId)
}
