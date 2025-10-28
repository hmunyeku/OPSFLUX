"use client"

import { ChevronDown } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export default function TeamMembers() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Membres de l&apos;équipe</CardTitle>
        <CardDescription className="truncate">
          Invitez les membres de votre équipe à collaborer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/avatars/avatar-1.png" alt="Image" />
              <AvatarFallback>DK</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm leading-none font-medium">Dale Komen</p>
              <p className="text-muted-foreground text-sm">dale@example.com</p>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 py-0" size="sm">
                Membre <ChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Command>
                <CommandInput placeholder="Sélectionner un nouveau rôle..." />
                <CommandList>
                  <CommandEmpty>Aucun rôle trouvé.</CommandEmpty>
                  <CommandGroup className="p-1.5">
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Observateur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir et commenter.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Développeur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et modifier.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Facturation</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et gérer la facturation.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Propriétaire</p>
                      <p className="text-muted-foreground text-sm">
                        Accès de niveau administrateur à toutes les ressources.
                      </p>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/avatars/avatar-5.png" alt="Image" />
              <AvatarFallback>SD</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm leading-none font-medium">Sofia Davis</p>
              <p className="text-muted-foreground text-sm">m@example.com</p>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 py-0" size="sm">
                Propriétaire <ChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Command>
                <CommandInput placeholder="Sélectionner un nouveau rôle..." />
                <CommandList>
                  <CommandEmpty>Aucun rôle trouvé.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Observateur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir et commenter.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Développeur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et modifier.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Facturation</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et gérer la facturation.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Propriétaire</p>
                      <p className="text-muted-foreground text-sm">
                        Accès de niveau administrateur à toutes les ressources.
                      </p>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/avatars/avatar-4.png" alt="Image" />
              <AvatarFallback>JL</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm leading-none font-medium">Jackson Lee</p>
              <p className="text-muted-foreground text-sm">p@example.com</p>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 py-0" size="sm">
                Membre <ChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Command>
                <CommandInput placeholder="Sélectionner un nouveau rôle..." />
                <CommandList>
                  <CommandEmpty>Aucun rôle trouvé.</CommandEmpty>
                  <CommandGroup className="p-1.5">
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Observateur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir et commenter.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Développeur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et modifier.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Facturation</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et gérer la facturation.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Propriétaire</p>
                      <p className="text-muted-foreground text-sm">
                        Accès de niveau administrateur à toutes les ressources.
                      </p>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/avatars/avatar-3.png" alt="Image" />
              <AvatarFallback>IN</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm leading-none font-medium">
                Isabella Nguyen
              </p>
              <p className="text-muted-foreground text-sm">i@example.com</p>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 py-0" size="sm">
                Membre <ChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Command>
                <CommandInput placeholder="Sélectionner un nouveau rôle..." />
                <CommandList>
                  <CommandEmpty>Aucun rôle trouvé.</CommandEmpty>
                  <CommandGroup className="p-1.5">
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Observateur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir et commenter.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Développeur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et modifier.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Facturation</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et gérer la facturation.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Propriétaire</p>
                      <p className="text-muted-foreground text-sm">
                        Accès de niveau administrateur à toutes les ressources.
                      </p>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/avatars/avatar-2.png" alt="Image" />
              <AvatarFallback>HR</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm leading-none font-medium">Hugan Romex</p>
              <p className="text-muted-foreground text-sm">kai@example.com</p>
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-7 py-0" size="sm">
                Membre <ChevronDown className="text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0" align="end">
              <Command>
                <CommandInput placeholder="Sélectionner un nouveau rôle..." />
                <CommandList>
                  <CommandEmpty>Aucun rôle trouvé.</CommandEmpty>
                  <CommandGroup className="p-1.5">
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Observateur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir et commenter.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Développeur</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et modifier.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Facturation</p>
                      <p className="text-muted-foreground text-sm">
                        Peut voir, commenter et gérer la facturation.
                      </p>
                    </CommandItem>
                    <CommandItem className="teamaspace-y-1 flex flex-col items-start px-4 py-2">
                      <p>Propriétaire</p>
                      <p className="text-muted-foreground text-sm">
                        Accès de niveau administrateur à toutes les ressources.
                      </p>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardContent>
    </Card>
  )
}
