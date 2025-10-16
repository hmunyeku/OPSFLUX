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

export default function MobileFilterSheet() {
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
        <Filters />
        <DrawerFooter>
          <Button>Soumettre</Button>
          <DrawerClose asChild>
            <Button variant="outline">Annuler</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
