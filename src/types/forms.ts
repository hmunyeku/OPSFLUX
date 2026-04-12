/**
 * Form definition types — matching the server form_engine output.
 *
 * These types describe the JSON schema that the server sends
 * and the mobile app interprets to render dynamic forms.
 */

// ── Conditional Logic ─────────────────────────────────────────────────

export interface ConditionRule {
  field: string;
  op: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in" | "not_in" | "is_empty" | "is_not_empty" | "contains";
  value?: unknown;
}

// ── Field Definition ──────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "textarea"
  | "integer"
  | "decimal"
  | "email"
  | "url"
  | "date"
  | "datetime"
  | "toggle"
  | "select"
  | "multi_select"
  | "lookup"
  | "multi_lookup"
  | "tags"
  | "repeater"
  | "group"
  | "photo"
  | "signature"
  | "barcode"
  | "location"
  | "computed"
  | "readonly";

export interface LookupSource {
  entity: string;
  endpoint: string;
  display: string;
  value: string;
  search_param?: string;
  filter?: Record<string, unknown>;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldValidation {
  min_length?: number;
  max_length?: number;
  min?: number;
  max?: number;
  exclusive_min?: number;
  exclusive_max?: number;
  pattern?: string;
}

export interface FieldDefinition {
  type: FieldType;
  label: string;
  required: boolean;
  order: number;
  default?: unknown;
  placeholder?: string;
  help_text?: string;
  options?: SelectOption[];
  validation?: FieldValidation;
  lookup_source?: LookupSource;
  ui_width?: "full" | "half";
  visible_when?: ConditionRule;
  required_when?: ConditionRule;
  auto_populate_from?: string;
  formula?: string;
  step?: string;
  item_fields?: Record<string, FieldDefinition>;
}

// ── Step Definition ───────────────────────────────────────────────────

export interface StepDefinition {
  id: string;
  title: string;
  description: string;
  fields: string[];
  visible_when?: ConditionRule;
}

// ── Form Definition ───────────────────────────────────────────────────

export interface FormDefinition {
  id: string;
  version: string;
  title: string;
  description: string;
  icon: string;
  module: string;
  permission: string;
  submit: {
    endpoint: string;
    method: "post" | "patch" | "put";
  };
  steps: StepDefinition[];
  fields: Record<string, FieldDefinition>;
}

// ── Portal Definition ─────────────────────────────────────────────────

export interface PortalAction {
  id: string;
  type: "scan" | "form" | "list" | "screen";
  title: string;
  icon: string;
  screen?: string;
  form_id?: string;
  params?: Record<string, unknown>;
}

export interface QuickScan {
  type: "qr" | "barcode";
  label: string;
  target: string;
}

export interface DashboardCard {
  type: "stat" | "chart" | "list";
  title: string;
  endpoint: string;
  params?: Record<string, unknown>;
  display: string;
}

export interface PortalDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  access: {
    permissions: string[];
    role_slugs: string[];
  };
  actions: PortalAction[];
  quick_scans: QuickScan[];
  dashboard_cards: DashboardCard[];
}

// ── Form Registry Response ────────────────────────────────────────────

export interface FormRegistryResponse {
  forms: FormDefinition[];
}

export interface PortalConfigResponse {
  portals: PortalDefinition[];
}

export interface SyncManifest {
  forms: Record<string, string>;
  portals: Record<string, string>;
}
