"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { t } from "./translations"

interface CronEditorProps {
  value: {
    minute?: string
    hour?: string
    dayOfWeek?: string
    dayOfMonth?: string
    monthOfYear?: string
  }
  onChange: (value: {
    minute?: string
    hour?: string
    dayOfWeek?: string
    dayOfMonth?: string
    monthOfYear?: string
  }) => void
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

export function CronEditor({ value, onChange }: CronEditorProps) {
  const [preset, setPreset] = useState<string>("custom")

  useEffect(() => {
    // Detect preset based on current values
    const { minute = "*", hour = "*", dayOfWeek = "*", dayOfMonth = "*", monthOfYear = "*" } = value

    if (minute === "*" && hour === "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      setPreset("every_minute")
    } else if (minute === "0" && hour === "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      setPreset("hourly")
    } else if (minute !== "*" && hour !== "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      setPreset("daily")
    } else if (minute !== "*" && hour !== "*" && dayOfWeek !== "*" && dayOfMonth === "*" && monthOfYear === "*") {
      setPreset("weekly")
    } else if (minute !== "*" && hour !== "*" && dayOfWeek === "*" && dayOfMonth === "1" && monthOfYear === "*") {
      setPreset("monthly")
    } else {
      setPreset("custom")
    }
  }, [value])

  const handlePresetChange = (newPreset: string) => {
    setPreset(newPreset)

    switch (newPreset) {
      case "every_minute":
        onChange({ minute: "*", hour: "*", dayOfWeek: "*", dayOfMonth: "*", monthOfYear: "*" })
        break
      case "hourly":
        onChange({ minute: "0", hour: "*", dayOfWeek: "*", dayOfMonth: "*", monthOfYear: "*" })
        break
      case "daily":
        onChange({ minute: "0", hour: "0", dayOfWeek: "*", dayOfMonth: "*", monthOfYear: "*" })
        break
      case "weekly":
        onChange({ minute: "0", hour: "0", dayOfWeek: "0", dayOfMonth: "*", monthOfYear: "*" })
        break
      case "monthly":
        onChange({ minute: "0", hour: "0", dayOfWeek: "*", dayOfMonth: "1", monthOfYear: "*" })
        break
      case "custom":
        // Keep current values
        break
    }
  }

  const getCronExpression = () => {
    const { minute = "*", hour = "*", dayOfMonth = "*", monthOfYear = "*", dayOfWeek = "*" } = value
    return `${minute} ${hour} ${dayOfMonth} ${monthOfYear} ${dayOfWeek}`
  }

  const getHumanReadable = () => {
    const { minute = "*", hour = "*", dayOfWeek = "*", dayOfMonth = "*", monthOfYear = "*" } = value

    if (minute === "*" && hour === "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      return "Every minute"
    }
    if (minute === "0" && hour === "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      return "Every hour"
    }
    if (minute !== "*" && hour === "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      return `Every hour at minute ${minute}`
    }
    if (minute !== "*" && hour !== "*" && dayOfWeek === "*" && dayOfMonth === "*" && monthOfYear === "*") {
      return `Every day at ${hour}:${minute.padStart(2, "0")}`
    }
    if (minute !== "*" && hour !== "*" && dayOfWeek !== "*" && dayOfMonth === "*" && monthOfYear === "*") {
      const day = DAYS_OF_WEEK.find(d => d.value === dayOfWeek)?.label || `day ${dayOfWeek}`
      return `Every ${day} at ${hour}:${minute.padStart(2, "0")}`
    }
    if (minute !== "*" && hour !== "*" && dayOfWeek === "*" && dayOfMonth !== "*" && monthOfYear === "*") {
      return `Day ${dayOfMonth} of every month at ${hour}:${minute.padStart(2, "0")}`
    }

    return getCronExpression()
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("preset")}</Label>
        <Select value={preset} onValueChange={handlePresetChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="every_minute">{t("everyMinute")}</SelectItem>
            <SelectItem value="hourly">{t("hourly")}</SelectItem>
            <SelectItem value="daily">{t("daily")}</SelectItem>
            <SelectItem value="weekly">{t("weekly")}</SelectItem>
            <SelectItem value="monthly">{t("monthly")}</SelectItem>
            <SelectItem value="custom">{t("custom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{t("minute")}</Label>
          <Input
            value={value.minute || "*"}
            onChange={(e) => onChange({ ...value, minute: e.target.value })}
            placeholder="*"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("hour")}</Label>
          <Input
            value={value.hour || "*"}
            onChange={(e) => onChange({ ...value, hour: e.target.value })}
            placeholder="*"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">{t("dayOfMonth")}</Label>
          <Input
            value={value.dayOfMonth || "*"}
            onChange={(e) => onChange({ ...value, dayOfMonth: e.target.value })}
            placeholder="*"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("month")}</Label>
          <Input
            value={value.monthOfYear || "*"}
            onChange={(e) => onChange({ ...value, monthOfYear: e.target.value })}
            placeholder="*"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">{t("dayOfWeek")}</Label>
          <Input
            value={value.dayOfWeek || "*"}
            onChange={(e) => onChange({ ...value, dayOfWeek: e.target.value })}
            placeholder="*"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="rounded-md border border-border/40 bg-muted/30 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t("cronLabel")}</Label>
          <Badge variant="outline" className="font-mono text-xs">
            {getCronExpression()}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t("runsLabel")}</Label>
          <span className="text-xs">{getHumanReadable()}</span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Tip:</strong> {t("cronTip")}</p>
      </div>
    </div>
  )
}
