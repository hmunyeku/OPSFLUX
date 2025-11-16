"use client";

/**
 * Icon Picker Component
 * Sélecteur d'icônes Lucide React pour les dashboards
 */

import { useState } from "react";
import * as Icons from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Liste d'icônes couramment utilisées pour les dashboards
const DASHBOARD_ICONS = [
  "LayoutDashboard",
  "BarChart3",
  "LineChart",
  "PieChart",
  "TrendingUp",
  "TrendingDown",
  "Activity",
  "Target",
  "Zap",
  "Gauge",
  "Users",
  "UserCheck",
  "Building2",
  "Boxes",
  "Package",
  "FolderKanban",
  "ListTodo",
  "CheckCircle2",
  "Calendar",
  "CalendarDays",
  "Clock",
  "Timer",
  "Plane",
  "Ship",
  "Car",
  "MapPin",
  "Map",
  "FileText",
  "FileEdit",
  "FilePen",
  "FileCheck",
  "Sparkles",
  "Star",
  "Heart",
  "ThumbsUp",
  "Award",
  "Trophy",
  "Settings",
  "Sliders",
  "Database",
  "Server",
  "HardDrive",
  "Cpu",
  "MemoryStick",
  "Wifi",
  "CloudUpload",
  "CloudDownload",
  "Download",
  "Upload",
  "RefreshCw",
  "RotateCw",
  "Search",
  "Filter",
  "SortAsc",
  "SortDesc",
  "Grid",
  "List",
  "Kanban",
  "Table",
  "Columns",
  "Rows",
  "Maximize2",
  "Minimize2",
  "ChevronUp",
  "ChevronDown",
  "ChevronLeft",
  "ChevronRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Plus",
  "Minus",
  "X",
  "Check",
  "AlertCircle",
  "AlertTriangle",
  "Info",
  "HelpCircle",
  "Bell",
  "Mail",
  "MessageSquare",
  "Phone",
  "Video",
  "Mic",
  "Image",
  "File",
  "Folder",
  "FolderOpen",
  "Home",
  "Briefcase",
  "ShoppingCart",
  "DollarSign",
  "CreditCard",
  "Wallet",
  "TrendingUp",
  "Percent",
];

interface IconPickerProps {
  value?: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}

export function IconPicker({ value, onChange, disabled = false }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Filtrer les icônes selon la recherche
  const filteredIcons = DASHBOARD_ICONS.filter((iconName) =>
    iconName.toLowerCase().includes(search.toLowerCase())
  );

  // Composant d'icône actuel
  const CurrentIcon = value
    ? (Icons[value as keyof typeof Icons] as React.ComponentType<{ className?: string }>)
    : Icons.LayoutDashboard;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-start"
          disabled={disabled}
        >
          {CurrentIcon && <CurrentIcon className="mr-2 h-4 w-4" />}
          {value || "Sélectionnez une icône"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Rechercher une icône..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="grid grid-cols-6 gap-1 p-2">
            {filteredIcons.map((iconName) => {
              const IconComponent = Icons[iconName as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
              const isSelected = value === iconName;

              return (
                <button
                  key={iconName}
                  onClick={() => {
                    onChange(iconName);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-center h-10 w-10 rounded hover:bg-accent",
                    isSelected && "bg-accent"
                  )}
                  title={iconName}
                >
                  {IconComponent && <IconComponent className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
          {filteredIcons.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Aucune icône trouvée
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
