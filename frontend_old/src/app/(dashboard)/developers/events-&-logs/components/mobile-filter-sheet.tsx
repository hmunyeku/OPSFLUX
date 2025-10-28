"use client"

import * as React from "react"
import { IconFilter } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import Filters from "./filters"

interface Props {
  onLevelFilterChange: (levels: string[]) => void
  onEventTypeFilterChange: (eventTypes: string[]) => void
}

export default function MobileFilterSheet({ onLevelFilterChange, onEventTypeFilterChange }: Props) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button className="block lg:hidden" size="icon" variant="outline">
          <IconFilter className="m-auto" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filtres événements/journaux</DrawerTitle>
          <DrawerDescription>Sélectionnez et cochez les filtres.</DrawerDescription>
        </DrawerHeader>
        <Filters
          onLevelFilterChange={onLevelFilterChange}
          onEventTypeFilterChange={onEventTypeFilterChange}
        />
        <DrawerFooter>
          <DrawerClose asChild>
            <Button>Appliquer</Button>
          </DrawerClose>
          <DrawerClose asChild>
            <Button variant="outline">Annuler</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
