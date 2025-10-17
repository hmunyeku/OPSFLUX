import { useState } from "react"
import LogsTable from "./logs-table"
import LogsToolbar from "./logs-toolbar"

interface Props {
  toggleFilters: () => void
  levelFilter: string[]
  eventTypeFilter: string[]
  onLevelFilterChange: (levels: string[]) => void
  onEventTypeFilterChange: (eventTypes: string[]) => void
}

export default function LogsList({
  toggleFilters,
  levelFilter,
  eventTypeFilter,
  onLevelFilterChange,
  onEventTypeFilterChange,
}: Props) {
  const [searchVal, setSearchVal] = useState("")

  return (
    <div>
      <LogsToolbar
        searchVal={searchVal}
        setSearchVal={setSearchVal}
        toggleFilters={toggleFilters}
        onLevelFilterChange={onLevelFilterChange}
        onEventTypeFilterChange={onEventTypeFilterChange}
      />
      <LogsTable
        searchVal={searchVal}
        levelFilter={levelFilter}
        eventTypeFilter={eventTypeFilter}
      />
    </div>
  )
}
