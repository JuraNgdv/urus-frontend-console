// DTOs mirrored from auth.md / menus_and_keyboards.md / rbac-permissions-contract.md
// plus the two endpoints confirmed directly against the backend:
// GET /tenants/{tenant_id}/me/permissions and the /i18n endpoints.

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface JwtClaims {
  sub: string;
  exp: number;
  tenant_id: string | null;
  tenant_slug: string;
  provider: string;
}

export interface UserPermissionsResponse {
  user_id: string;
  tenant_id: string;
  permissions: string[];
}

export type IdentityProvider = "username" | "email" | "telegram";

export interface LoginRequest {
  provider: IdentityProvider;
  identifier: string;
  password?: string | null;
}

// ---- Profile (the signed-in admin's own account) ----
// GET/PATCH /tenants/{tenant_id}/me. `lang` drives the admin interface's own
// display language (see LocaleContext's useLocale) — independent of the
// tenant content locales (LOCALES) used for menu/keyboard/node translations.

export interface ProfileResponse {
  id: string;
  tenant_id: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  lang: string;
  telegram_bot_token: string | null;
  referral_id: string | null;
  balance: string;
  bonus_balance: string;
  created_at: string;
  updated_at: string;
}

// Only `lang` is exercised by this UI today — other profile fields aren't
// editable here, so they're left off rather than guessed at.
export interface ProfileUpdateRequest {
  lang?: string;
}

// ---- RBAC ----
// Endpoints, permission keys and request bodies are from
// rbac-permissions-contract.md. Response shapes confirmed directly against
// the backend (app/modules/rbac/schemas.py) — RoleResponse does NOT embed
// permissions; fetch a role's current permissions separately via
// GET /tenants/{tenant_id}/roles/{role_id}/permissions.

export interface PermissionResponse {
  id: string;
  tenant_id: string | null;
  key: string;
  group: string;
  description_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PermissionCreateRequest {
  key: string;
  group: string;
  description_id: string;
}

export type PermissionUpdateRequest = Partial<Omit<PermissionCreateRequest, "key">>;

export interface RoleResponse {
  id: string;
  tenant_id: string | null;
  name: string;
  description_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleCreateRequest {
  name: string;
  description_id?: string | null;
  permission_ids: string[];
}

export type RoleUpdateRequest = Partial<Pick<RoleCreateRequest, "name" | "description_id">>;

export interface SetRolePermissionsRequest {
  permission_ids: string[];
}

// ---- Menus ----

export type MenuBlockType =
  | "TEXT"
  | "PHOTO"
  | "VIDEO"
  | "AUDIO"
  | "DOCUMENT"
  | "POLL"
  | "ALBUM"
  | "RICH_TEXT"
  | "LOCATION";

export interface MenuResponse {
  id: string;
  tenant_id: string;
  key: string;
  description: string | null;
  version: number;
  content_hash: string | null;
  meta: Record<string, unknown> | null;
  is_template: boolean;
  key_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlockFull {
  id: string;
  menu_id: string;
  order_index: number;
  type: MenuBlockType;
  content: Record<string, unknown>;
  keyboard_id: string | null;
  is_separate: boolean;
  persistent: boolean;
  condition: { all?: string[]; any?: string[] } | null;
  permissions: string[] | null;
  meta: Record<string, unknown> | null;
}

export interface MenuFullResponse extends MenuResponse {
  blocks: BlockFull[];
}

export interface BlockCreateRequest {
  type: MenuBlockType;
  content: Record<string, unknown>;
  keyboard_id?: string | null;
  is_separate: boolean;
  persistent: boolean;
  condition?: { all?: string[]; any?: string[] } | null;
  permissions?: string[] | null;
  meta?: Record<string, unknown> | null;
}

// PATCH does not accept `type` per menus_and_keyboards.md — block type is immutable after creation.
export type BlockUpdateRequest = Partial<Omit<BlockCreateRequest, "type">>;

// ---- Keyboards ----

export type KeyboardType = "INLINE" | "REPLY";
export type RowType = "STATIC" | "DYNAMIC";
export type ButtonActionType = "NAVIGATE" | "HOOK" | "URL" | "BACK";
export type ButtonType = "INLINE" | "URL" | "CONTACT" | "WEB_APP";
export type ButtonStyle = "PRIMARY" | "SUCCESS" | "DANGER";

export interface KeyboardResponse {
  id: string;
  tenant_id: string;
  key: string;
  type: KeyboardType;
  version: number;
  content_hash: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ButtonFull {
  id: string;
  row_id: string;
  order_index: number;
  text_key: string;
  text_namespace: string;
  text_params: Record<string, unknown> | null;
  action_type: ButtonActionType;
  action_payload: Record<string, unknown> | null;
  type: ButtonType;
  style: ButtonStyle | null;
  custom_emoji_id: string | null;
  permissions: string[] | null;
}

export interface RowPagination {
  page_size: number;
  max_buttons_per_row: number;
  position: "TOP" | "BOTTOM";
  style: "PRIMARY" | "SECONDARY";
  always_visible: boolean;
}

export interface RowFull {
  id: string;
  keyboard_id: string;
  order_index: number;
  type: RowType;
  source: string | null;
  pagination: RowPagination | null;
  buttons: ButtonFull[];
}

export interface KeyboardFullResponse extends KeyboardResponse {
  rows: RowFull[];
}

export interface RowCreateRequest {
  type: RowType;
  buttons_per_row: number;
  source?: string | null;
  pagination?: RowPagination | null;
}

export interface ButtonCreateRequest {
  text_key: string;
  text_namespace: string;
  text_params?: Record<string, unknown> | null;
  action_type: ButtonActionType;
  action_payload?: Record<string, unknown> | null;
  type: ButtonType;
  style?: ButtonStyle | null;
  custom_emoji_id?: string | null;
  permissions?: string[] | null;
}

export type ButtonUpdateRequest = Partial<ButtonCreateRequest>;

// ---- Media ----

// Media attaches to any entity by (entity_type, entity_id) — "block" is what
// menu block editors use, but other domains (e.g. "product") attach media
// the same way, so this stays open rather than a closed union.
export type MediaEntityType = "block" | (string & {});

export interface MediaResponse {
  id: string;
  tenant_id: string;
  type: string;
  path: string;
  storage: string;
  size_bytes: number | null;
  original_filename: string | null;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface MediaAttachRequest {
  media_id: string;
  order_index: number;
}

export interface MediaAttachmentResponse {
  id: string;
  tenant_id: string;
  entity_type: MediaEntityType;
  entity_id: string;
  order_index: number;
  created_at: string;
  media: MediaResponse;
}

// ---- Node tree (locations / categories) ----
// From docs/node-tree-api.md. Two independent per-tenant hierarchies keyed by
// node_type; price/discount_value serialize as decimal strings (see the
// doc's own PATCH example: {"price": "50.00", ...}).

export type NodeType = "location" | "category";
export type DiscountType = "percent" | "fixed";

export interface NodeResponse {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name_key: string;
  desc_key: string | null;
  media_id: string | null;
  node_type: NodeType;
  depth: number;
  order_index: number;
  price: string | null;
  discount_value: string | null;
  discount_type: DiscountType | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NodeCreateRequest {
  node_type: NodeType;
  parent_id: string | null;
  name_key: string;
  desc_key?: string | null;
  media_id?: string | null;
  order_index?: number;
  price?: string | null;
  discount_value?: string | null;
  discount_type?: DiscountType | null;
}

export interface NodeUpdateRequest {
  name_key?: string;
  desc_key?: string | null;
  media_id?: string | null;
  order_index?: number;
  price?: string | null;
  discount_value?: string | null;
  discount_type?: DiscountType | null;
  is_active?: boolean;
}

export interface NodeReorderItem {
  node_id: string;
  order_index: number;
}

// Bulk create — POST /tenants/{tenant_id}/nodes/{node_type}/bulk. Unlike single
// create, name_key/desc_key are server-generated (slug + random suffix) from
// the given {locale: text} translations, and the translations are written
// directly — no separate i18n PUT calls needed. Building a multi-level tree
// means multiple sequential calls: parents must exist (and their real UUIDs
// known) before their children's parent_id can be sent.
export interface NodeBulkCreateItem {
  parent_id: string | null;
  name: Record<string, string>;
  desc?: Record<string, string>;
  order_index?: number;
}

export interface NodeBulkResultItem {
  index: number;
  success: boolean;
  node: NodeResponse | null;
  name_key: string | null;
  error: string | null;
}

export interface NodeBulkResult {
  results: NodeBulkResultItem[];
}

// ---- Products ----
// From docs/products-api.md, updated per the BFF team's changelog: added_by/
// added_at/reserved_by/reserved_at/bought_by/bought_at are gone from the
// response with no replacement (created_at is the closest stand-in for
// added_at) — ProductResponse and ProductSafeResponse are now identical, so
// this one shape covers both. A product always attaches to a leaf location
// node and a leaf category node simultaneously; media_ids is required and
// never empty.

export type ProductStatus =
  | "created" // initial state, pre-moderation
  | "available"
  | "reserved"
  | "sold"
  | "gifted"
  | "won"
  | "replacement" // issued to replace a defective one
  | "defective";

export interface ProductResponse {
  id: string;
  tenant_id: string;
  location_id: string;
  category_id: string;
  description: string | null;
  status: ProductStatus;
  media_ids: string[];
  latitude: string | null;
  longitude: string | null;
  discount_value: string | null;
  discount_type: DiscountType | null;
  sold_price: string | null;
  created_at: string;
  is_available: boolean;
}

export interface ProductCreateRequest {
  location_id: string;
  category_id: string;
  description?: string | null;
  media_ids: string[];
  latitude?: string | null;
  longitude?: string | null;
}

export interface ProductBulkCreateRequest {
  products: ProductCreateRequest[];
}

export interface ProductBulkResultItem {
  index: number;
  success: boolean;
  product: ProductResponse | null;
  error: string | null;
}

export interface ProductBulkResult {
  results: ProductBulkResultItem[];
}

// All fields optional — absent ones are left unchanged. Explicit null on a
// nullable field clears it; media_ids, if present, fully replaces the set
// (an empty array is rejected by the backend, so never send one).
export interface ProductUpdateRequest {
  description?: string | null;
  media_ids?: string[];
  status?: ProductStatus | null;
  latitude?: string | null;
  longitude?: string | null;
  discount_value?: string | null;
  discount_type?: DiscountType | null;
}

export type ProductSortBy = "created_at" | "sold_price" | "status" | "latitude" | "longitude";

// ---- Users & Balance ----
// From docs/users-balance-api.md. Every user has two independent balances
// (main, bonus); each adjustment is atomic (profile update + transaction
// row in one flush) and a debit that would go negative is rejected (422).

export type BalanceType = "main" | "bonus";

export interface UserStats {
  purchases_count: number;
  wins_count: number;
  replacements_received_count: number;
  total_spent: string;
  total_saved: string;
}

// Shape beyond "present once the user has sold or added something" isn't
// documented — kept loose rather than guessing fields that might be wrong.
export type SellerStats = Record<string, unknown> | null;

// GET /tenants/{tenant_id}/users — list items. `roles` is role *names*, not
// ids — resolving a name to an id for assign/revoke needs a separate roles
// lookup (see lib/api/rbac.ts).
export interface UserListItem {
  id: string;
  tenant_id: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  balance: string;
  bonus_balance: string;
  stats: UserStats;
  seller_stats: SellerStats;
  roles: string[];
  created_at: string;
}

// GET /tenants/{tenant_id}/users/{user_id} — richer than the list item:
// adds lang/telegram_bot_token/referral_id/identities, and the stats field
// is named user_stats here (not stats).
export interface UserProfileEnriched {
  id: string;
  tenant_id: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  balance: string;
  bonus_balance: string;
  lang: string;
  telegram_bot_token: string | null;
  referral_id: string | null;
  identities: IdentityProvider[];
  user_stats: UserStats;
  seller_stats: SellerStats;
  roles: string[];
  created_at: string;
}

export interface PaginatedUsers {
  items: UserListItem[];
  total: number;
  limit: number;
  offset: number;
}

// What happened to the balance.
export type BalanceAction = "manual" | "purchase" | "sale" | "creation" | "transfer" | "deposit";
// What kind of entity reference_id points to — always present (every
// transaction has a source), unlike reference_id itself which can be null.
export type BalanceReferenceType = "product" | "payment" | "user";

export interface TransactionResponse {
  id: string;
  tenant_id: string;
  user_id: string;
  balance_type: BalanceType;
  amount: string;
  balance_after: string;
  action: BalanceAction;
  reference_type: BalanceReferenceType;
  reference_id: string | null;
  created_at: string;
}

export interface PaginatedTransactions {
  items: TransactionResponse[];
  total: number;
  limit: number;
  offset: number;
}

// action/reference_type/reference_id aren't sent by the client — the server
// derives them from context; a manual adjustment through this endpoint is
// always action="manual".
export interface BalanceAdjustRequest {
  balance_type: BalanceType;
  amount: string;
}

// ---- Config system ----
// From docs/config-system.md. Definitions are global; a per-tenant PUT
// overrides a definition's default_value. GET .../config-definitions and
// GET .../configs both require the server-held bff_token and are proxied
// through Next.js Route Handlers (src/app/api/tenants/[tenantId]/...) —
// never called directly from the browser. PUT uses the caller's own JWT.

export type ConfigType = "select" | "multiselect" | "checkbox" | "list" | "text" | "number";

export interface ConfigValidationRules {
  min?: number;
  max?: number;
  regex?: string;
  max_length?: number;
}

export interface ConfigDefinitionResponse {
  id: string;
  key: string;
  type: ConfigType;
  description_id: string | null;
  is_editable: boolean;
  is_visible: boolean;
  default_value: unknown;
  options: string[] | null;
  validation_rules: ConfigValidationRules | null;
}

export interface ConfigEntryResponse {
  key: string;
  value: unknown;
  is_editable: boolean;
  type: ConfigType;
}

// ---- Translations ----
// GET /i18n/batch?tenant_id=&locale=&keys[]=...  -> { translations: { "ns.key": value|null } }
// PUT /tenants/{tenant_id}/i18n/{namespace}/{key}?locale=  body { value }

export interface TranslationBatchResponse {
  translations: Record<string, string | null>;
}
