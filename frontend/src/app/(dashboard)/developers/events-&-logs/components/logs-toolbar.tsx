import { Dispatch, SetStateAction, useState } from "react"
import {
  IconFilter,
  IconPlaystationTriangle,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import { SearchInput } from "@/components/search-input"
import LogsAction from "./logs-actions"
import MobileFilterSheet from "./mobile-filter-sheet"
import { usePermissions } from "@/hooks/use-permissions"

interface Props {
  toggleFilters: () => void
  searchVal: string
  setSearchVal: Dispatch<SetStateAction<string>>
  onLevelFilterChange: (levels: string[]) => void
  onEventTypeFilterChange: (eventTypes: string[]) => void
  onRefresh: () => void
  onClearLogs: () => void
}

export default function LogsToolbar({
  toggleFilters,
  searchVal,
  setSearchVal,
  onLevelFilterChange,
  onEventTypeFilterChange,
  onRefresh,
  onClearLogs,
}: Props) {
  const { hasPermission } = usePermissions()
  const [clearDialogOpen, setClearDialogOpen] = useState(false)

  const handleClearConfirm = () => {
    onClearLogs()
    setClearDialogOpen(false)
  }

  return (
    <>
    <div className="border-muted flex items-center gap-2 border-b p-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={toggleFilters}
              className="hidden shrink-0 lg:block"
              variant="outline"
              size="icon"
            >
              <IconFilter className="m-auto" size={20} strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">Basculer les filtres</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <MobileFilterSheet
        onLevelFilterChange={onLevelFilterChange}
        onEventTypeFilterChange={onEventTypeFilterChange}
      />

      <SearchInput
        value={searchVal}
        onChange={(e) => setSearchVal(e)}
        className="flex-1"
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="shrink-0" variant="outline" size="icon" onClick={onRefresh}>
              <IconRefresh size={20} strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">Actualiser</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {hasPermission("core.audit.delete") && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setClearDialogOpen(true)}
              >
                <IconTrash size={20} strokeWidth={1.5} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">Vider tous les logs</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <Button variant="outline" className="shrink-0 px-3">
        <IconPlaystationTriangle
          className="rotate-90"
          size={20}
          strokeWidth={1.5}
        />
        <p className="text-sm">Live</p>
      </Button>
      <LogsAction />
    </div>

    <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vider tous les logs d'audit ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Tous les logs d'audit seront définitivement supprimés.
            Êtes-vous sûr de vouloir continuer ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Vider les logs
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
