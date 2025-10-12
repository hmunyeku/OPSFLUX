import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTheme } from "next-themes"
import useAuth from "@/hooks/useAuth"
import { User, Lock, Palette, Save } from "lucide-react"

interface UserSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsSection = "profile" | "appearance" | "security"

interface NavigationItem {
  id: SettingsSection
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navigationItems: NavigationItem[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "security", label: "Security", icon: Lock },
]

export function UserSettingsDialog({ open, onOpenChange }: UserSettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile")
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()

  const handleSave = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[500px] p-0">
        <div className="flex h-full">
          {/* Sidebar Navigation */}
          <aside className="w-48 border-r bg-muted/40 p-4">
            <DialogHeader className="mb-4 px-2">
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription className="text-xs">
                Manage your account settings
              </DialogDescription>
            </DialogHeader>

            <nav className="space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <Button
                    key={item.id}
                    variant={isActive ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setActiveSection(item.id)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                )
              })}
            </nav>
          </aside>

          {/* Content Area */}
          <div className="flex-1 flex flex-col">
            <ScrollArea className="flex-1 p-6">
              {activeSection === "profile" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Profile Information</h3>
                    <p className="text-sm text-muted-foreground">
                      Update your personal information
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input id="firstName" defaultValue={user?.full_name?.split(" ")[0] || ""} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input id="lastName" defaultValue={user?.full_name?.split(" ")[1] || ""} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" type="email" defaultValue={user?.email} disabled />
                      <p className="text-xs text-muted-foreground">
                        Contact your administrator to change your email
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Appearance</h3>
                    <p className="text-sm text-muted-foreground">
                      Customize the look and feel of your interface
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant={theme === "light" ? "default" : "outline"}
                          onClick={() => setTheme("light")}
                          className="justify-start"
                        >
                          <div className="mr-2 h-4 w-4 rounded-full bg-white border" />
                          Light
                        </Button>
                        <Button
                          variant={theme === "dark" ? "default" : "outline"}
                          onClick={() => setTheme("dark")}
                          className="justify-start"
                        >
                          <div className="mr-2 h-4 w-4 rounded-full bg-slate-950 border" />
                          Dark
                        </Button>
                        <Button
                          variant={theme === "system" ? "default" : "outline"}
                          onClick={() => setTheme("system")}
                          className="justify-start"
                        >
                          <div className="mr-2 h-4 w-4 rounded-full bg-gradient-to-r from-white to-slate-950 border" />
                          System
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "security" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Security Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage your password and security
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <Input id="currentPassword" type="password" placeholder="Enter current password" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input id="newPassword" type="password" placeholder="Enter new password" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input id="confirmPassword" type="password" placeholder="Confirm new password" />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Password must be at least 8 characters long
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>

            {/* Footer Actions */}
            <div className="border-t p-4 flex items-center justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
