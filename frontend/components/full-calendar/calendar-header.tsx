"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  List,
  CalendarRange,
  Plus,
  Filter,
  Settings,
  Grid3X3,
  ChevronDown,
} from "lucide-react"
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, addYears, subYears } from "date-fns"
import { fr } from "date-fns/locale"
import { useCalendar } from "./calendar-context"
import { CalendarView } from "./types"
import { cn } from "@/lib/utils"

interface CalendarHeaderProps {
  onCreateEvent?: () => void
  onSettingsClick?: () => void
}

export function CalendarHeader({ onCreateEvent, onSettingsClick }: CalendarHeaderProps) {
  const { currentDate, setCurrentDate, view, setView, users, filteredUserIds, setFilteredUserIds } = useCalendar()

  const navigatePrev = () => {
    switch (view) {
      case "month":
        setCurrentDate(subMonths(currentDate, 1))
        break
      case "week":
        setCurrentDate(subWeeks(currentDate, 1))
        break
      case "day":
        setCurrentDate(subDays(currentDate, 1))
        break
      case "year":
        setCurrentDate(subYears(currentDate, 1))
        break
      case "agenda":
        setCurrentDate(subMonths(currentDate, 1))
        break
    }
  }

  const navigateNext = () => {
    switch (view) {
      case "month":
        setCurrentDate(addMonths(currentDate, 1))
        break
      case "week":
        setCurrentDate(addWeeks(currentDate, 1))
        break
      case "day":
        setCurrentDate(addDays(currentDate, 1))
        break
      case "year":
        setCurrentDate(addYears(currentDate, 1))
        break
      case "agenda":
        setCurrentDate(addMonths(currentDate, 1))
        break
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const getTitle = () => {
    switch (view) {
      case "month":
        return format(currentDate, "MMMM yyyy", { locale: fr })
      case "week":
        return `Semaine du ${format(currentDate, "d MMMM yyyy", { locale: fr })}`
      case "day":
        return format(currentDate, "EEEE d MMMM yyyy", { locale: fr })
      case "year":
        return format(currentDate, "yyyy", { locale: fr })
      case "agenda":
        return format(currentDate, "MMMM yyyy", { locale: fr })
    }
  }

  const viewOptions: { value: CalendarView; label: string; icon: React.ElementType }[] = [
    { value: "day", label: "Jour", icon: CalendarDays },
    { value: "week", label: "Semaine", icon: CalendarRange },
    { value: "month", label: "Mois", icon: LayoutGrid },
    { value: "year", label: "Année", icon: Grid3X3 },
    { value: "agenda", label: "Agenda", icon: List },
  ]

  const toggleUserFilter = (userId: string) => {
    if (filteredUserIds.includes(userId)) {
      setFilteredUserIds(filteredUserIds.filter(id => id !== userId))
    } else {
      setFilteredUserIds([...filteredUserIds, userId])
    }
  }

  const clearUserFilters = () => {
    setFilteredUserIds([])
  }

  // Get color classes for user avatars
  const userColors = ["bg-blue-500", "bg-emerald-500", "bg-orange-500", "bg-purple-500", "bg-pink-500", "bg-cyan-500"]
  const getUserColor = (index: number) => userColors[index % userColors.length]

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        {/* Left: Filters and View icons */}
        <div className="flex items-center gap-2">
          {/* Filter button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Filter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filtrer</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6" />

          {/* View Switcher - Icon buttons */}
          <div className="flex items-center gap-0.5">
            {viewOptions.map((option) => {
              const Icon = option.icon
              return (
                <Tooltip key={option.value}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-9 w-9",
                        view === option.value && "bg-accent"
                      )}
                      onClick={() => setView(option.value)}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{option.label}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Navigation */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={navigatePrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Précédent</TooltipContent>
            </Tooltip>

            <Button variant="ghost" size="sm" className="h-9 px-3" onClick={goToToday}>
              Aujourd'hui
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={navigateNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Suivant</TooltipContent>
            </Tooltip>
          </div>

          {/* Current date/title */}
          <div className="ml-2">
            <h1 className="text-lg font-semibold capitalize">{getTitle()}</h1>
          </div>
        </div>

        {/* Right: User filters, All dropdown, Add Event, Settings */}
        <div className="flex items-center gap-3">
          {/* User Filters - Avatar buttons */}
          {users.length > 0 && (
            <>
              <div className="flex items-center -space-x-1">
                {users.slice(0, 5).map((user, index) => {
                  const isActive = filteredUserIds.length === 0 || filteredUserIds.includes(user.id)
                  return (
                    <Tooltip key={user.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleUserFilter(user.id)}
                          className={cn(
                            "relative rounded-full ring-2 ring-background transition-all",
                            !isActive && "opacity-40 grayscale"
                          )}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={cn("text-xs text-white", getUserColor(index))}>
                              {user.initials}
                            </AvatarFallback>
                          </Avatar>
                          {filteredUserIds.includes(user.id) && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-blue-600 ring-2 ring-background" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{user.name}</TooltipContent>
                    </Tooltip>
                  )
                })}
                {users.length > 5 && (
                  <Avatar className="h-8 w-8 ring-2 ring-background">
                    <AvatarFallback className="text-xs bg-gray-400 text-white">
                      +{users.length - 5}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>

              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          {/* All Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1">
                {filteredUserIds.length === 0 ? "All" : `${filteredUserIds.length}`}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={clearUserFilters}>
                Tous les utilisateurs
              </DropdownMenuItem>
              {users.length > 0 && <DropdownMenuSeparator />}
              {users.map((user, index) => (
                <DropdownMenuCheckboxItem
                  key={user.id}
                  checked={filteredUserIds.includes(user.id)}
                  onCheckedChange={() => toggleUserFilter(user.id)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className={cn("text-[10px] text-white", getUserColor(index))}>
                        {user.initials}
                      </AvatarFallback>
                    </Avatar>
                    {user.name}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add Event */}
          {onCreateEvent && (
            <Button
              size="sm"
              onClick={onCreateEvent}
              className="h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Event
            </Button>
          )}

          {/* Settings */}
          {onSettingsClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onSettingsClick}>
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paramètres</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
