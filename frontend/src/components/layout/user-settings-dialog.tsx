import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTheme } from "next-themes"
import useAuth from "@/hooks/useAuth"
import {
  User,
  Lock,
  Bell,
  Palette,
  Globe,
  Shield,
  Building2,
  Mail,
  Phone,
  MapPin,
  Save
} from "lucide-react"

interface UserSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "preferences"

interface NavigationItem {
  id: SettingsSection
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const navigationItems: NavigationItem[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Account", icon: Mail },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "preferences", label: "Preferences", icon: Globe },
]

export function UserSettingsDialog({ open, onOpenChange }: UserSettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile")
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()

  const handleSave = () => {
    // TODO: Implement save functionality
    console.log("Saving settings...")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[600px] p-0">
        <div className="flex h-full">
          {/* Sidebar Navigation */}
          <aside className="w-56 border-r bg-muted/40 p-4">
            <DialogHeader className="mb-4 px-2">
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription className="text-xs">
                Manage your account settings and preferences
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
                      Update your personal information and how others see you
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
                      <Label htmlFor="jobTitle">Job Title</Label>
                      <Input id="jobTitle" placeholder="Operations Manager" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Select defaultValue="operations">
                        <SelectTrigger id="department">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operations">Operations</SelectItem>
                          <SelectItem value="hse">HSE</SelectItem>
                          <SelectItem value="logistics">Logistics</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="admin">Administration</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <div className="flex gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-2" />
                        <Select defaultValue="offshore">
                          <SelectTrigger id="location">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="offshore">Offshore Platform</SelectItem>
                            <SelectItem value="onshore">Onshore Base</SelectItem>
                            <SelectItem value="headquarters">Headquarters</SelectItem>
                            <SelectItem value="regional">Regional Office</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="flex gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground mt-2" />
                        <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "account" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Account Settings</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage your account credentials and email preferences
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="flex gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground mt-2" />
                        <Input id="email" type="email" defaultValue={user?.email} disabled />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Contact your administrator to change your email address
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input id="username" defaultValue={user?.email?.split("@")[0]} disabled />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Account Status</Label>
                      <div className="flex items-center gap-2">
                        <Badge variant="success" className="bg-success text-success-foreground">
                          Active
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Your account is in good standing
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Organization</Label>
                      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">OPSFLUX Operations</span>
                      </div>
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

                    <div className="space-y-2">
                      <Label htmlFor="language">Language</Label>
                      <Select defaultValue="en">
                        <SelectTrigger id="language">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="es">Español</SelectItem>
                          <SelectItem value="pt">Português</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select defaultValue="utc">
                        <SelectTrigger id="timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="utc">UTC (GMT+0)</SelectItem>
                          <SelectItem value="cet">Central European Time (GMT+1)</SelectItem>
                          <SelectItem value="est">Eastern Standard Time (GMT-5)</SelectItem>
                          <SelectItem value="pst">Pacific Standard Time (GMT-8)</SelectItem>
                          <SelectItem value="cst">China Standard Time (GMT+8)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dateFormat">Date Format</Label>
                      <Select defaultValue="dd-mm-yyyy">
                        <SelectTrigger id="dateFormat">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem>
                          <SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem>
                          <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Notification Preferences</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose what notifications you want to receive
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">HSE Alerts</Label>
                          <p className="text-sm text-muted-foreground">
                            Critical health, safety, and environment notifications
                          </p>
                        </div>
                        <input type="checkbox" defaultChecked className="mt-1" />
                      </div>

                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">Booking Updates</Label>
                          <p className="text-sm text-muted-foreground">
                            Offshore booking confirmations and changes
                          </p>
                        </div>
                        <input type="checkbox" defaultChecked className="mt-1" />
                      </div>

                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">PTW Notifications</Label>
                          <p className="text-sm text-muted-foreground">
                            Permit to Work approvals and expirations
                          </p>
                        </div>
                        <input type="checkbox" defaultChecked className="mt-1" />
                      </div>

                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">Weather Warnings</Label>
                          <p className="text-sm text-muted-foreground">
                            Adverse weather conditions affecting operations
                          </p>
                        </div>
                        <input type="checkbox" defaultChecked className="mt-1" />
                      </div>

                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">Training Reminders</Label>
                          <p className="text-sm text-muted-foreground">
                            Upcoming training sessions and certificate renewals
                          </p>
                        </div>
                        <input type="checkbox" className="mt-1" />
                      </div>

                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base">System Updates</Label>
                          <p className="text-sm text-muted-foreground">
                            New features and system maintenance notifications
                          </p>
                        </div>
                        <input type="checkbox" className="mt-1" />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Notification Method</Label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="emailNotif" defaultChecked />
                          <Label htmlFor="emailNotif" className="font-normal">Email notifications</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="pushNotif" defaultChecked />
                          <Label htmlFor="pushNotif" className="font-normal">Push notifications</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="smsNotif" />
                          <Label htmlFor="smsNotif" className="font-normal">SMS notifications (critical only)</Label>
                        </div>
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
                      Manage your password and security preferences
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="flex gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground mt-2" />
                        <Input id="currentPassword" type="password" placeholder="Enter current password" />
                      </div>
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
                      Password must be at least 8 characters long and include uppercase, lowercase, and numbers.
                    </p>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Two-Factor Authentication</Label>
                      <div className="flex items-center justify-between p-3 border rounded-md">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">Authenticator App</p>
                          <p className="text-xs text-muted-foreground">
                            Not configured
                          </p>
                        </div>
                        <Button variant="outline" size="sm">Enable</Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Active Sessions</Label>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 border rounded-md">
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium">Current Session</p>
                            <p className="text-xs text-muted-foreground">
                              Linux • Chrome • Active now
                            </p>
                          </div>
                          <Badge variant="success">Active</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "preferences" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">User Preferences</h3>
                    <p className="text-sm text-muted-foreground">
                      Customize your workflow and default settings
                    </p>
                  </div>
                  <Separator />

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="defaultView">Default Dashboard View</Label>
                      <Select defaultValue="overview">
                        <SelectTrigger id="defaultView">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="overview">Overview Dashboard</SelectItem>
                          <SelectItem value="map">Map View</SelectItem>
                          <SelectItem value="bookings">Offshore Bookings</SelectItem>
                          <SelectItem value="hse">HSE Reports</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="itemsPerPage">Items Per Page</Label>
                      <Select defaultValue="20">
                        <SelectTrigger id="itemsPerPage">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Auto-refresh Data</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically refresh dashboard data every 5 minutes
                        </p>
                      </div>
                      <input type="checkbox" defaultChecked className="mt-1" />
                    </div>

                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Show POB Counter</Label>
                        <p className="text-sm text-muted-foreground">
                          Display Personnel On Board counter in header
                        </p>
                      </div>
                      <input type="checkbox" defaultChecked className="mt-1" />
                    </div>

                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Compact View</Label>
                        <p className="text-sm text-muted-foreground">
                          Use smaller spacing and compact layouts
                        </p>
                      </div>
                      <input type="checkbox" className="mt-1" />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="exportFormat">Default Export Format</Label>
                      <Select defaultValue="xlsx">
                        <SelectTrigger id="exportFormat">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                          <SelectItem value="csv">CSV (.csv)</SelectItem>
                          <SelectItem value="pdf">PDF (.pdf)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>

            {/* Footer Actions */}
            <div className="border-t p-4 flex items-center justify-between bg-muted/20">
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
