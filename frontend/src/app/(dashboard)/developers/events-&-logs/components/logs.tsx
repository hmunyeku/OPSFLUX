"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import Filters from "./filters"
import LogsList from "./logs-list"

export default function Logs() {
  const [openedFilter, setOpenedFilter] = useState(true)
  const [levelFilter, setLevelFilter] = useState<string[]>([])
  const [eventTypeFilter, setEventTypeFilter] = useState<string[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  function toggleFilters() {
    setOpenedFilter((prev) => !prev)
  }

  const handleLevelFilterChange = useCallback((levels: string[]) => {
    setLevelFilter(levels)
  }, [])

  const handleEventTypeFilterChange = useCallback((eventTypes: string[]) => {
    setEventTypeFilter(eventTypes)
  }, [])

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const handleReset = useCallback(() => {
    setLevelFilter([])
    setEventTypeFilter([])
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return (
    <Card>
      <div className="grid grid-cols-4 grid-rows-3">
        <div
          className={cn(
            "border-muted row-start-1 row-end-4 hidden border-r px-0 py-3 lg:col-start-1 lg:col-end-2 lg:block",
            {
              "row-start-1 row-end-1 lg:col-start-1 lg:col-end-1 lg:hidden":
                !openedFilter,
            }
          )}
        >
          <Filters
            onLevelFilterChange={handleLevelFilterChange}
            onEventTypeFilterChange={handleEventTypeFilterChange}
            onReset={handleReset}
            levelFilter={levelFilter}
            eventTypeFilter={eventTypeFilter}
          />
        </div>
        <div
          className={cn(
            "col-start-1 col-end-5 row-start-1 row-end-4 lg:col-start-2",
            {
              "lg:col-start-1": !openedFilter,
            }
          )}
        >
          <LogsList
            toggleFilters={toggleFilters}
            levelFilter={levelFilter}
            eventTypeFilter={eventTypeFilter}
            onLevelFilterChange={handleLevelFilterChange}
            onEventTypeFilterChange={handleEventTypeFilterChange}
            onRefresh={handleRefresh}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>
    </Card>
  )
}
