"use client";

/**
 * Menu Parent Selector Component
 * Sélecteur de menu parent pour les dashboards OpsFlux
 */

import { MenuParentEnum } from "@/types/dashboard-system";
import { OPSFLUX_MENUS } from "@/lib/opsflux-menus";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as Icons from "lucide-react";

interface MenuParentSelectorProps {
  value: MenuParentEnum;
  onChange: (value: MenuParentEnum) => void;
  disabled?: boolean;
}

export function MenuParentSelector({
  value,
  onChange,
  disabled = false,
}: MenuParentSelectorProps) {
  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as MenuParentEnum)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Sélectionnez un menu parent" />
      </SelectTrigger>
      <SelectContent>
        {OPSFLUX_MENUS.map((menu) => {
          const IconComponent = Icons[menu.icon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;

          return (
            <SelectItem key={menu.id} value={menu.id}>
              <div className="flex items-center gap-3">
                {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
                <div className="flex flex-col">
                  <span className="font-medium">{menu.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {menu.description}
                  </span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
