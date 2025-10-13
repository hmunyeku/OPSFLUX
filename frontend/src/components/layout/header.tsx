import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Search } from "@/components/search"
import { BookmarksDropdown } from "@/components/header/bookmarks-dropdown"
import { NotificationsPanel } from "@/components/header/notifications-panel"
import { CalendarButton } from "@/components/header/calendar-button"
import { LanguageSwitcher } from "@/components/header/language-switcher"
import { AiChatButton } from "@/components/header/ai-chat-button"
import { UserMenu } from "@/components/header/user-menu"

export function Header() {
  return (
    <header
      className={cn(
        "bg-background z-50 flex h-16 shrink-0 items-center gap-2 border-b px-4",
        "sticky top-0"
      )}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex w-full justify-between items-center">
        <Search />
        <div className="flex items-center gap-1">
          <BookmarksDropdown />
          <NotificationsPanel />
          <CalendarButton />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <LanguageSwitcher />
          <AiChatButton />
          <Separator orientation="vertical" className="mx-1 h-6" />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
