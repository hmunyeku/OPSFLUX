"use client"

import { JSX, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Props extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string
    title: string
    icon: JSX.Element
    external?: boolean
  }[]
  isCollapsed?: boolean
  onToggle?: () => void
}

export default function SidebarNav({ className, items, isCollapsed = false, onToggle, ...props }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [val, setVal] = useState(pathname ?? "/settings")

  const handleSelect = (e: string) => {
    setVal(e)
    const item = items.find((item) => item.href === e)
    if (item?.external) {
      window.open(e, "_blank", "noopener,noreferrer")
    } else {
      router.push(e)
    }
  }

  return (
    <>
      {/* Mobile View */}
      <div className="p-1 md:hidden">
        <Select value={val} onValueChange={handleSelect}>
          <SelectTrigger className="h-10 sm:w-48">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <div className="flex gap-x-4 px-2 py-0.5">
                  <span className="scale-125 [&_svg]:size-[1.125rem]">
                    {item.icon}
                  </span>
                  <span className="text-md">{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop View with Collapsible Sidebar */}
      <div className="hidden md:block">
        <div className="relative h-full">
          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute -right-3 top-2 z-10 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-accent transition-all"
            onClick={onToggle}
            title={isCollapsed ? "Étendre le menu" : "Réduire le menu"}
          >
            {isCollapsed ? (
              <IconChevronRight className="h-4 w-4" />
            ) : (
              <IconChevronLeft className="h-4 w-4" />
            )}
          </Button>

          {/* Sidebar Content */}
          <ScrollArea
            orientation="horizontal"
            type="auto"
            className="h-full bg-background/50 backdrop-blur-sm rounded-lg border shadow-sm"
          >
            <nav
              className={cn(
                "flex flex-col space-y-1 p-2 transition-all duration-300",
                className
              )}
              {...props}
            >
              <TooltipProvider delayDuration={0}>
                {items.map((item) => {
                  const isActive = pathname === item.href
                  const linkClassName = cn(
                    buttonVariants({ variant: "ghost" }),
                    "justify-start transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground shadow-sm"
                      : "hover:bg-accent/50",
                    isCollapsed ? "h-10 w-10 p-0 justify-center" : "h-10"
                  )

                  const content = (
                    <>
                      <span className={cn(
                        "[&_svg]:size-[1.125rem] transition-all",
                        isCollapsed ? "" : "mr-3"
                      )}>
                        {item.icon}
                      </span>
                      {!isCollapsed && (
                        <span className="truncate font-medium">{item.title}</span>
                      )}
                    </>
                  )

                  if (item.external) {
                    const element = (
                      <a
                        key={item.href}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClassName}
                      >
                        {content}
                      </a>
                    )

                    return isCollapsed ? (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{element}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                    ) : element
                  }

                  const element = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={linkClassName}
                    >
                      {content}
                    </Link>
                  )

                  return isCollapsed ? (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{element}</TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  ) : element
                })}
              </TooltipProvider>
            </nav>
          </ScrollArea>
        </div>
      </div>
    </>
  )
}
