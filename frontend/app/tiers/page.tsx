export default function TiersPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Third Parties</h1>
      <div className="rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">
          Third parties management page. Navigate to specific sections:
        </p>
        <ul className="mt-4 space-y-2">
          <li><a href="/tiers/companies" className="text-primary hover:underline">Companies</a></li>
          <li><a href="/tiers/contacts" className="text-primary hover:underline">Contacts</a></li>
          <li><a href="/tiers/external-users" className="text-primary hover:underline">External Users</a></li>
        </ul>
      </div>
    </div>
  )
}
