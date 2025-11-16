"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { type User, getRoleById, getGroupById, permissions, permissionCategories } from "@/lib/user-management-data"
import { Mail, Shield, Activity } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"

interface UserDetailDrawerProps {
  user: User | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserDetailDrawer({ user, open, onOpenChange }: UserDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState("overview")

  if (!user) return null

  const role = getRoleById(user.role)
  const userGroups = user.groups.map((gId) => getGroupById(gId)).filter(Boolean)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[700px] sm:max-w-[700px] p-0">
        {/* Header */}
        <SheetHeader className="border-b p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.avatar || "/placeholder.svg"} alt={`${user.firstName} ${user.lastName}`} />
              <AvatarFallback className="text-2xl">
                {user.firstName[0]}
                {user.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <SheetTitle className="text-2xl">
                {user.firstName} {user.lastName}
              </SheetTitle>
              <p className="text-base text-muted-foreground">{role?.name}</p>
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                {user.email}
              </div>
            </div>
            <Badge
              variant={
                user.status === "active"
                  ? "default"
                  : user.status === "inactive"
                    ? "secondary"
                    : user.status === "pending"
                      ? "outline"
                      : "destructive"
              }
            >
              {user.status}
            </Badge>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-[calc(100vh-180px)] flex-col">
          <TabsList className="w-full justify-start rounded-none border-b px-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 p-6">
              <div className="space-y-6">
                {/* Profile Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">First Name</Label>
                        <p className="text-sm font-medium">{user.firstName}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Last Name</Label>
                        <p className="text-sm font-medium">{user.lastName}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Email</Label>
                        <p className="text-sm font-medium">{user.email}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Phone</Label>
                        <p className="text-sm font-medium">{user.phone || "-"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Department</Label>
                        <p className="text-sm font-medium">{user.department}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Job Title</Label>
                        <p className="text-sm font-medium">{user.jobTitle}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Employee ID</Label>
                        <p className="text-sm font-medium">{user.employeeId}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Location</Label>
                        <p className="text-sm font-medium">{user.location}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Account Status */}
                <Card>
                  <CardHeader>
                    <CardTitle>Account Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Current Status</p>
                        <p className="text-xs text-muted-foreground">Account is {user.status}</p>
                      </div>
                      <Badge variant={user.status === "active" ? "default" : "secondary"}>{user.status}</Badge>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Email Verified</span>
                        <span className="font-medium">{user.emailVerified ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">2FA Enabled</span>
                        <span className="font-medium">{user.twoFactorEnabled ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Account Type</span>
                        <span className="font-medium capitalize">{user.accountType}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Statistics */}
                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{user.loginCount}</p>
                        <p className="text-xs text-muted-foreground">Total Logins</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{formatDistanceToNow(new Date(user.lastLogin))}</p>
                        <p className="text-xs text-muted-foreground">Last Login</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{user.groups.length}</p>
                        <p className="text-xs text-muted-foreground">Groups</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{user.roles.length}</p>
                        <p className="text-xs text-muted-foreground">Roles</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* Permissions Tab */}
            <TabsContent value="permissions" className="m-0 p-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Assigned Roles</CardTitle>
                    <CardDescription>Roles assigned to this user</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {user.roles.map((roleId) => {
                        const r = getRoleById(roleId)
                        return r ? (
                          <Badge key={roleId} variant="secondary">
                            {r.name}
                          </Badge>
                        ) : null
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Permissions</CardTitle>
                    <CardDescription>Permissions inherited from roles</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {permissionCategories.map((category) => {
                        const categoryPerms = permissions.filter((p) => p.category === category)
                        const userRole = getRoleById(user.role)
                        const hasPerms = categoryPerms.filter((p) => userRole?.permissions.includes(p.id))

                        if (hasPerms.length === 0) return null

                        return (
                          <div key={category}>
                            <h4 className="mb-2 text-sm font-semibold">{category}</h4>
                            <div className="space-y-2">
                              {hasPerms.map((perm) => (
                                <div key={perm.id} className="flex items-center justify-between rounded-md border p-2">
                                  <div>
                                    <p className="text-sm font-medium">{perm.name}</p>
                                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">
                                    From {userRole?.name}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Groups Tab */}
            <TabsContent value="groups" className="m-0 p-6">
              <Card>
                <CardHeader>
                  <CardTitle>Group Memberships</CardTitle>
                  <CardDescription>Groups this user belongs to</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userGroups.map((group) =>
                      group ? (
                        <div key={group.id} className="flex items-center justify-between rounded-md border p-3">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">{group.icon}</div>
                            <div>
                              <p className="text-sm font-medium">{group.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {group.memberCount} members • {group.type}
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            Remove
                          </Button>
                        </div>
                      ) : null,
                    )}
                    {userGroups.length === 0 && (
                      <p className="text-center text-sm text-muted-foreground">No groups assigned</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Log Tab */}
            <TabsContent value="activity" className="m-0 p-6">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Log</CardTitle>
                  <CardDescription>Recent user activity and changes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Activity className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Logged in</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        <Shield className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Account created</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(user.joinDate), "PPP")}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="m-0 p-6">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Authentication</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Two-Factor Authentication</p>
                        <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                      </div>
                      <Switch checked={user.twoFactorEnabled} />
                    </div>
                    <Separator />
                    <div>
                      <Button variant="outline" size="sm">
                        Force Password Reset
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Lock Account</p>
                        <p className="text-xs text-muted-foreground">Prevent user from logging in</p>
                      </div>
                      <Button variant="outline" size="sm">
                        Lock
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Delete Account</p>
                        <p className="text-xs text-muted-foreground">Permanently remove this user</p>
                      </div>
                      <Button variant="destructive" size="sm">
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer */}
        <div className="border-t p-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button>Edit User</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
