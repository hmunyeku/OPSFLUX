"use client"

import * as React from "react"
import { TravelWizDashboard } from "@/components/travelwiz/dashboard/travelwiz-dashboard"
import { CreateLoadingManifestDrawer } from "@/components/travelwiz/manifests/create-loading-manifest-drawer"
import { CreateBackCargoDrawer } from "@/components/travelwiz/back-cargo-new/create-back-cargo-drawer"
import { ArrivalControlInterface } from "@/components/travelwiz/vessel-arrivals/arrival-control-interface"
import { YardDispatchInterface } from "@/components/travelwiz/yard-dispatch/yard-dispatch-interface"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type {
  LoadingManifest,
  BackCargoManifest,
  VesselArrival,
  YardDispatch,
} from "@/lib/travelwiz-back-cargo-types"

export default function TravelWizPage() {
  // États pour les dialogues
  const [showManifestDrawer, setShowManifestDrawer] = React.useState(false)
  const [showBackCargoDrawer, setShowBackCargoDrawer] = React.useState(false)
  const [showArrivalDialog, setShowArrivalDialog] = React.useState(false)
  const [showDispatchDialog, setShowDispatchDialog] = React.useState(false)

  // États pour les données (à remplacer par des appels API)
  const [manifests, setManifests] = React.useState<LoadingManifest[]>([])
  const [backCargos, setBackCargos] = React.useState<BackCargoManifest[]>([])
  const [arrivals, setArrivals] = React.useState<VesselArrival[]>([])
  const [dispatches, setDispatches] = React.useState<YardDispatch[]>([])

  // Handlers
  const handleSaveManifest = (manifest: LoadingManifest) => {
    console.log("Manifeste sauvegardé:", manifest)
    setManifests([...manifests, manifest])
    setShowManifestDrawer(false)

    // TODO: Appel API pour sauvegarder en base
    // await api.createLoadingManifest(manifest)
  }

  const handleSaveBackCargo = (backCargo: BackCargoManifest) => {
    console.log("Retour site sauvegardé:", backCargo)
    setBackCargos([...backCargos, backCargo])
    setShowBackCargoDrawer(false)

    // TODO: Appel API
    // await api.createBackCargo(backCargo)
  }

  const handleSaveArrival = (arrival: VesselArrival) => {
    console.log("Arrivée navire sauvegardée:", arrival)
    setArrivals([...arrivals, arrival])

    // TODO: Appel API
    // await api.saveVesselArrival(arrival)
  }

  const handleGenerateArrivalReport = () => {
    console.log("Génération du rapport d'arrivée")
    setShowArrivalDialog(false)

    // TODO: Appel API pour générer et envoyer le rapport
    // await api.generateArrivalReport(arrivalId)
  }

  const handleSaveDispatch = (dispatch: YardDispatch) => {
    console.log("Dispatch sauvegardé:", dispatch)
    setDispatches([...dispatches, dispatch])

    // TODO: Appel API
    // await api.saveYardDispatch(dispatch)
  }

  const handleGenerateExitPass = (backCargoId: string) => {
    console.log("Génération du laissez-passer pour:", backCargoId)

    // TODO: Appel API pour générer le laissez-passer
    // await api.generateExitPass(backCargoId)
  }

  const handleNotifyRecipient = (backCargoId: string) => {
    console.log("Notification du destinataire pour:", backCargoId)

    // TODO: Appel API pour notifier
    // await api.notifyRecipient(backCargoId)
  }

  const handleViewDetails = (type: string, id: string) => {
    console.log("Affichage des détails:", type, id)

    // TODO: Navigation vers la page de détails
    // router.push(`/travelwiz/${type}/${id}`)
  }

  return (
    <div className="container mx-auto p-6">
      <TravelWizDashboard
        loadingManifests={manifests}
        backCargoManifests={backCargos}
        vesselArrivals={arrivals}
        yardDispatches={dispatches}
        onCreateManifest={() => setShowManifestDrawer(true)}
        onRegisterArrival={() => setShowArrivalDialog(true)}
        onCreateBackCargo={() => setShowBackCargoDrawer(true)}
        onViewDetails={handleViewDetails}
      />

      {/* Drawer: Créer Manifeste de Chargement */}
      <CreateLoadingManifestDrawer
        trigger={null}
        open={showManifestDrawer}
        onOpenChange={setShowManifestDrawer}
        onSave={handleSaveManifest}
      />

      {/* Drawer: Créer Retour Site */}
      <CreateBackCargoDrawer
        trigger={null}
        open={showBackCargoDrawer}
        onOpenChange={setShowBackCargoDrawer}
        onSave={handleSaveBackCargo}
      />

      {/* Dialog: Enregistrer Arrivée Navire */}
      <Dialog open={showArrivalDialog} onOpenChange={setShowArrivalDialog}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contrôle d'Arrivée Navire</DialogTitle>
            <DialogDescription>
              Enregistrez l'arrivée du navire et effectuez les contrôles obligatoires
            </DialogDescription>
          </DialogHeader>
          {/*
            Note: Ce composant nécessite un VesselArrival existant
            Dans une vraie application, on afficherait d'abord une liste
            de navires attendus, puis on ouvrirait l'interface de contrôle
          */}
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              Sélectionnez un navire attendu pour démarrer le contrôle d'arrivée
            </p>
            <Button className="mt-4" variant="outline" onClick={() => setShowArrivalDialog(false)}>
              Annuler
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
