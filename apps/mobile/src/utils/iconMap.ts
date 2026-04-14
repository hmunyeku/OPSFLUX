/**
 * Map server-provided icon names to Google Material Symbols names.
 *
 * The backend (form_definitions.py, portal configs) emits free-form icon
 * names like "scan", "qr-code", "package-plus" etc. We map them to the
 * Material Symbols set used throughout the mobile app.
 */
import type { MIconName } from "../components/MIcon";

const MAP: Record<string, MIconName> = {
  activity: "show-chart",
  anchor: "anchor",
  archive: "archive",
  bell: "notifications",
  boxes: "inventory-2",
  briefcase: "work",
  "building-2": "apartment",
  building: "apartment",
  calendar: "calendar-today",
  car: "directions-car",
  "check-circle": "check-circle",
  clipboard: "assignment",
  "clipboard-check": "assignment-turned-in",
  cog: "settings",
  "credit-card": "credit-card",
  "edit-3": "edit",
  edit: "edit",
  "file-badge": "badge",
  "file-edit": "edit-note",
  "file-plus": "post-add",
  folder: "folder",
  gauge: "speed",
  globe: "language",
  "help-circle": "help-outline",
  home: "home",
  inbox: "inbox",
  key: "key",
  layers: "layers",
  "layout-dashboard": "dashboard",
  list: "list",
  mail: "email",
  map: "map",
  "map-pin": "place",
  navigation: "navigation",
  package: "inventory-2",
  "package-plus": "add-box",
  "pen-square": "edit",
  phone: "phone",
  plane: "flight",
  "plus-circle": "add-circle",
  "qr-code": "qr-code-scanner",
  scan: "qr-code-scanner",
  "scan-circle": "qr-code-scanner",
  "scan-line": "qr-code-scanner",
  search: "search",
  settings: "settings",
  shield: "shield",
  ship: "sailing",
  smartphone: "smartphone",
  star: "star",
  truck: "local-shipping",
  user: "person",
  "user-plus": "person-add",
  users: "people",
};

/** Return the Material Icon name for a server-emitted name. Falls back to "list". */
export function iconByName(name?: string): MIconName {
  if (!name) return "list";
  return MAP[name.toLowerCase()] ?? "list";
}
