import { useState, useEffect } from "react"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import CalendarDatePicker from "@/components/calendar-date-picker"
import {
  Timeline,
  timelines,
} from "../data/data"

interface Props {
  onLevelFilterChange: (levels: string[]) => void
  onEventTypeFilterChange: (eventTypes: string[]) => void
  onReset: () => void
  levelFilter: string[]
  eventTypeFilter: string[]
}

// Map actual API values to display labels
const levelOptions = [
  { label: "INFO", value: "INFO", count: 0 },
  { label: "WARN", value: "WARN", count: 0 },
  { label: "ERROR", value: "ERROR", count: 0 },
  { label: "DEBUG", value: "DEBUG", count: 0 },
]

const eventTypeOptions = [
  { label: "API", value: "API", count: 0 },
  { label: "AUTH", value: "AUTH", count: 0 },
  { label: "CRUD", value: "CRUD", count: 0 },
  { label: "SYSTEM", value: "SYSTEM", count: 0 },
]

const environmentOptions = [
  { label: "Développement", value: "development", count: 0 },
  { label: "Production", value: "production", count: 0 },
]

export default function Filters({ onLevelFilterChange, onEventTypeFilterChange, onReset, levelFilter, eventTypeFilter }: Props) {
  const [timeline, setTimeline] = useState<Timeline>("custom")
  const [environments, setEnvironments] = useState<string[]>([])

  // Sync local state with props
  useEffect(() => {
    // This ensures the checkboxes are updated when parent resets
  }, [levelFilter, eventTypeFilter])

  function resetHandler() {
    setEnvironments([])
    onReset()
  }

  return (
    <div className="flex h-full flex-col gap-3 md:max-h-[380px]">
      <div className="flex items-center justify-between px-4">
        <h1 className="text-sm font-bold">Filtres</h1>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={resetHandler}
                variant="outline"
                className="px-3 text-xs"
              >
                Réinitialiser
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">Réinitialiser les filtres</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ScrollArea className="flex flex-col">
        <Collapsible defaultOpen className="group/log-filter px-2">
          <CollapsibleTrigger asChild>
            <Button
              className="flex w-full items-center justify-start px-2"
              variant="ghost"
            >
              <ChevronRight className="scale-125 transition-transform duration-200 group-data-[state=open]/log-filter:rotate-90" />
              <p className="text-sm">Chronologie</p>
              <span className="sr-only">Basculer</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="CollapsibleContent space-y-2 px-2 pt-1 pb-3 duration-75!">
            <Select
              value={timeline}
              onValueChange={(e) => setTimeline(e as Timeline)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionner la période" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {timelines.map((timeline) => (
                    <SelectItem key={timeline.value} value={timeline.value}>
                      {timeline.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {timeline === "custom" && (
              <CalendarDatePicker
                className="w-full"
                variant="outline"
                date={{ from: new Date() }}
                onDateSelect={() => {}}
              />
            )}
          </CollapsibleContent>
        </Collapsible>
        <Collapsible defaultOpen className="group/log-filter px-2">
          <CollapsibleTrigger asChild>
            <Button
              className="flex w-full items-center justify-start px-2"
              variant="ghost"
            >
              <ChevronRight className="scale-125 transition-transform duration-200 group-data-[state=open]/log-filter:rotate-90" />
              <p className="text-sm">Niveau</p>
              <span className="sr-only">Basculer</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="CollapsibleContent space-y-2 px-2 pt-1 pb-3 duration-75!">
            <div className="border-muted flex flex-col overflow-hidden rounded-md border">
              {levelOptions.map((level) => (
                <div
                  className="flex items-center gap-2 px-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  key={level.value}
                >
                  <Checkbox
                    checked={levelFilter.includes(level.value)}
                    onCheckedChange={(checked) => {
                      const newLevels = checked
                        ? [...levelFilter, level.value]
                        : levelFilter.filter((value) => value !== level.value)
                      onLevelFilterChange(newLevels)
                    }}
                    id={level.value}
                  />
                  <Label
                    className="flex h-full flex-1 cursor-pointer items-center justify-between py-2"
                    htmlFor={level.value}
                  >
                    <p className="text-xs">{level.label}</p>
                    {level.count > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-6 w-6 rounded-full p-0"
                      >
                        <p className="m-auto text-[10px] opacity-70">
                          {level.count}
                        </p>
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <Collapsible className="group/log-filter px-2">
          <CollapsibleTrigger asChild>
            <Button
              className="flex w-full items-center justify-start px-2"
              variant="ghost"
            >
              <ChevronRight className="scale-125 transition-transform duration-200 group-data-[state=open]/log-filter:rotate-90" />
              <p className="text-sm">Environnement</p>
              <span className="sr-only">Sélectionner l&apos;environnement</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="CollapsibleContent space-y-2 px-2 pt-1 pb-3 duration-75!">
            <div className="border-muted flex flex-col overflow-hidden rounded-md border">
              {environmentOptions.map((env) => (
                <div
                  className="flex items-center gap-2 px-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  key={env.value}
                >
                  <Checkbox
                    checked={environments.includes(env.value)}
                    onCheckedChange={(checked) => {
                      return checked
                        ? setEnvironments([...environments, env.value])
                        : setEnvironments(
                            environments.filter((value) => value !== env.value)
                          )
                    }}
                    id={env.value}
                  />
                  <Label
                    className="flex flex-1 cursor-pointer items-center justify-between py-2"
                    htmlFor={env.value}
                  >
                    <p className="text-xs">{env.label}</p>
                    {env.count > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-6 w-6 rounded-full p-0"
                      >
                        <p className="m-auto text-[10px] opacity-70">
                          {env.count}
                        </p>
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <Collapsible className="group/log-filter px-2">
          <CollapsibleTrigger asChild>
            <Button
              className="flex w-full items-center justify-start px-2"
              variant="ghost"
            >
              <ChevronRight className="scale-125 transition-transform duration-200 group-data-[state=open]/log-filter:rotate-90" />
              <p className="text-sm">Types</p>
              <span className="sr-only">Sélectionner le type d&apos;événement</span>
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="CollapsibleContent space-y-2 px-2 pt-1 pb-3 duration-75!">
            <div className="border-muted flex flex-col overflow-hidden rounded-md border">
              {eventTypeOptions.map((eventType) => (
                <div
                  className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                  key={eventType.value}
                >
                  <Checkbox
                    checked={eventTypeFilter.includes(eventType.value)}
                    onCheckedChange={(checked) => {
                      const newTypes = checked
                        ? [...eventTypeFilter, eventType.value]
                        : eventTypeFilter.filter((value) => value !== eventType.value)
                      onEventTypeFilterChange(newTypes)
                    }}
                    id={eventType.value}
                  />
                  <Label
                    className="flex flex-1 cursor-pointer items-center justify-between"
                    htmlFor={eventType.value}
                  >
                    <p className="text-xs">{eventType.label}</p>
                    {eventType.count > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-6 w-6 rounded-full p-0"
                      >
                        <p className="m-auto text-[10px] opacity-70">
                          {eventType.count}
                        </p>
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>
    </div>
  )
}
