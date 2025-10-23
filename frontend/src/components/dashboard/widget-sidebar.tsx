"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconSearch, IconPlus } from "@tabler/icons-react"
import { getAllWidgets, getWidgetCategories, type WidgetComponent } from "@/widgets/registry"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

interface WidgetSidebarProps {
  onAddWidget: (widgetType: string) => void
}

export default function WidgetSidebar({ onAddWidget }: WidgetSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const allWidgets = getAllWidgets()
  const categories = getWidgetCategories()

  // Filter widgets based on search and category
  const filteredWidgets = allWidgets.filter((widget) => {
    const matchesSearch =
      widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory =
      selectedCategory === "all" || widget.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const WidgetCard = ({ widget }: { widget: WidgetComponent }) => (
    <Card className="hover:bg-accent/50 transition-colors">
      <CardHeader className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-sm">{widget.name}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {widget.description}
            </CardDescription>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onAddWidget(widget.type)}
          >
            <IconPlus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Badge variant="secondary" className="text-xs">
          {widget.category}
        </Badge>
      </CardContent>
    </Card>
  )

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un widget..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">
            Tous
          </TabsTrigger>
          {categories.map((category) => (
            <TabsTrigger key={category} value={category} className="flex-1 capitalize">
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={selectedCategory} className="mt-4">
          <ScrollArea className="h-[calc(100vh-16rem)]">
            <div className="space-y-3 pr-4">
              {filteredWidgets.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Aucun widget trouvé
                </div>
              ) : (
                filteredWidgets.map((widget) => (
                  <WidgetCard key={widget.type} widget={widget} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Info */}
      <div className="mt-auto text-xs text-muted-foreground text-center">
        {filteredWidgets.length} widget{filteredWidgets.length > 1 ? "s" : ""} disponible
        {filteredWidgets.length > 1 ? "s" : ""}
      </div>
    </div>
  )
}
