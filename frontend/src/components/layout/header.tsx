import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Search } from "@/components/search"
import { AddBookmarkButton } from "@/components/header/add-bookmark-button"
import { BookmarksDropdown } from "@/components/header/bookmarks-dropdown"
import { NotificationsPanel } from "@/components/header/notifications-panel"
import { CalendarButton } from "@/components/header/calendar-button"
import { LanguageSwitcher } from "@/components/header/language-switcher"
import { AiChatButton } from "@/components/header/ai-chat-button"
import { UserMenu } from "@/components/header/user-menu"
import { NavigationSpinner } from "@/components/navigation-progress"

export function Header() {
  return (
    <header
      className={cn(
        "bg-background z-50 flex h-14 md:h-16 shrink-0 items-center gap-1 md:gap-2 border-b px-2 md:px-4",
        "sticky top-0"
      )}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 md:mr-2 h-4 hidden sm:block" />
      <div className="flex w-full justify-between items-center gap-1 md:gap-2">
        <Search />
        <div className="flex items-center gap-0.5 md:gap-1">
          <NavigationSpinner />
          <AddBookmarkButton />
          <BookmarksDropdown />
          <NotificationsPanel />
          <CalendarButton className="hidden sm:flex" />
          <Separator orientation="vertical" className="mx-0.5 md:mx-1 h-6 hidden md:block" />
          <LanguageSwitcher />
          <AiChatButton className="hidden lg:flex" />
          <Separator orientation="vertical" className="mx-0.5 md:mx-1 h-6 hidden md:block" />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
