"use client"

import * as React from "react"
import {
  IconArrowRightDashed,
  IconDeviceLaptop,
  IconMoon,
  IconSun,
  IconUser,
  IconChecklist,
  IconSettings,
  IconPlus,
} from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { sidebarData } from "./layout/data/sidebar-data"
import { useSearch } from "./search-provider"
import { ScrollArea } from "./ui/scroll-area"

interface QuickAction {
  id: string
  title: string
  icon: React.ReactNode
  action: () => void
}

export function CommandMenu() {
  const router = useRouter()
  const { setTheme } = useTheme()
  const { open, setOpen } = useSearch()
  const [searchQuery, setSearchQuery] = React.useState("")

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false)
      command()
    },
    [setOpen]
  )

  // Actions rapides
  const quickActions: QuickAction[] = React.useMemo(() => [
    {
      id: "new-user",
      title: "Créer un nouvel utilisateur",
      icon: <IconUser className="mr-2 h-4 w-4" />,
      action: () => router.push("/users?action=create"),
    },
    {
      id: "new-task",
      title: "Créer une nouvelle tâche",
      icon: <IconChecklist className="mr-2 h-4 w-4" />,
      action: () => router.push("/tasks?action=create"),
    },
    {
      id: "settings",
      title: "Ouvrir les paramètres",
      icon: <IconSettings className="mr-2 h-4 w-4" />,
      action: () => router.push("/settings"),
    },
  ], [router])

  return (
    <CommandDialog modal open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Rechercher des pages, actions, paramètres..."
        value={searchQuery}
        onValueChange={setSearchQuery}
      />
      <CommandList>
        <ScrollArea type="hover" className="h-96 pr-1">
          <CommandEmpty>
            <div className="py-6 text-center text-sm">
              <p className="text-muted-foreground">Aucun résultat trouvé.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Essayez de rechercher des pages, actions ou paramètres
              </p>
            </div>
          </CommandEmpty>

          {/* Actions rapides */}
          {searchQuery.length === 0 && (
            <>
              <CommandGroup heading="Actions rapides">
                {quickActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={action.title}
                    onSelect={() => runCommand(action.action)}
                  >
                    {action.icon}
                    {action.title}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Pages de navigation */}
          {sidebarData.navGroups.map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.map((navItem, i) => {
                if (navItem.url)
                  return (
                    <CommandItem
                      key={`${navItem.url}-${i}`}
                      value={navItem.title}
                      onSelect={() => {
                        runCommand(() => router.push(navItem.url))
                      }}
                    >
                      <div className="mr-2 flex h-4 w-4 items-center justify-center">
                        <IconArrowRightDashed className="text-muted-foreground/80 size-2" />
                      </div>
                      {navItem.title}
                    </CommandItem>
                  )

                return navItem.items?.map((subItem, i) => (
                  <CommandItem
                    key={`${subItem.url}-${i}`}
                    value={subItem.title}
                    onSelect={() => {
                      runCommand(() => router.push(subItem.url))
                    }}
                  >
                    <div className="mr-2 flex h-4 w-4 items-center justify-center">
                      <IconArrowRightDashed className="text-muted-foreground/80 size-2" />
                    </div>
                    {subItem.title}
                  </CommandItem>
                ))
              })}
            </CommandGroup>
          ))}

          <CommandSeparator />

          {/* Thème */}
          <CommandGroup heading="Thème">
            <CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
              <IconSun className="mr-2 h-4 w-4" />
              <span>Clair</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
              <IconMoon className="mr-2 h-4 w-4" />
              <span>Sombre</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
              <IconDeviceLaptop className="mr-2 h-4 w-4" />
              <span>Système</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  )
}
