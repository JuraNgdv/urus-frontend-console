# Config System

Система конфігів складається з глобальних визначень (`ConfigDefinition`) та per-tenant значень (`TenantConfigValue`). Значення тенанта перекривають дефолт визначення; якщо запис відсутній — повертається `default_value`.

---

## Моделі

```
ConfigDefinition                    TenantConfigValue
────────────────────────────────    ──────────────────────────────────────
id             uuid  PK             id          uuid  PK
key            str   unique         tenant_id   uuid  FK → tenants.id CASCADE
type           ConfigType           config_id   uuid  FK → config_definitions.id CASCADE
default_value  JSON | null          value       JSON
options        JSON | null          updated_at  datetime
validation_rules  JSON | null
is_editable    bool  default=true
is_visible     bool  default=true
description_id str | null
                                    UNIQUE (tenant_id, config_id)
```

**ConfigType:** `select | multiselect | checkbox | list | text | number`

---

## Кеш

In-memory dict `{str(tenant_id) → {key → value}}` (`app/modules/tenants/cache.py`).

- Заповнюється при першому `GET /configs/{key}` для тенанта.
- Інвалідується при:
  - `PUT /configs/{key}` → видаляє конкретний ключ + BFF-версію тенанта.
  - `DELETE /admin/tenants/{id}` → видаляє весь namespace тенанта.
- Немає TTL, немає Redis — живе до рестарту процесу.

---

## API

### MA: Config Definitions

Потребує MA JWT (`require_master_admin`).

#### `GET /admin/config-definitions` → `ConfigDefinitionResponse[]`

#### `POST /admin/config-definitions` → `ConfigDefinitionResponse` (201)

```json
{
  "key": "string",
  "type": "select | multiselect | checkbox | list | text | number",
  "description_id": "string | null",
  "is_editable": true,
  "is_visible": true,
  "default_value": "<any> | null",
  "options": ["string"] | null,
  "validation_rules": { "min": 0, "max": 100, "regex": "pattern" } | null
}
```

`validation_rules` застосовуються тільки для відповідних типів:

| type | підтримувані ключі | опис |
|------|--------------------|------|
| `number` | `min`, `max` | значення має бути числом у діапазоні `[min, max]` |
| `text` | `regex` | `re.fullmatch(regex, value)` |
| `list` | `max_length` | максимальна кількість елементів у списку |
| `list` | `min`, `max` | кожен елемент — число в діапазоні `[min, max]`; несумісне з `regex` |
| `list` | `regex` | кожен елемент — рядок, що відповідає `re.fullmatch(regex, item)`; несумісне з `min`/`max` |

`max_length` можна комбінувати з `min`/`max` або `regex`. `min`/`max` та `regex` — взаємовиключні: якщо задано `min` або `max`, `regex` ігнорується.

---

### TMA: Tenant Configs

Доступ через `get_tenant_or_404` (тенант повинен існувати).

#### `GET /tenants/{tenant_id}/configs` → `ConfigEntryResponse[]`

Повертає всі визначення; для кожного — значення тенанта або `default_value`.

#### `GET /tenants/{tenant_id}/configs/{key}` → `ConfigEntryResponse`

```
404  key не знайдений
```

#### `PUT /tenants/{tenant_id}/configs/{key}` → `ConfigEntryResponse`

```json
{ "value": "<any>" }
```

```
403  is_editable = false
404  key не знайдений
422  не проходить validation_rules
```

Після успішного запису інвалідується in-memory кеш ключа та BFF-версія тенанта.

---

### Схеми відповідей

```json
// ConfigDefinitionResponse
{
  "id": "uuid",
  "key": "string",
  "type": "ConfigType",
  "description_id": "string | null",
  "is_editable": true,
  "is_visible": true,
  "default_value": "<any>",
  "options": ["string"] | null,
  "validation_rules": { "min": 0, "max": 100 } | null
}

// ConfigEntryResponse
{
  "key": "string",
  "value": "<any>",
  "is_editable": true,
  "type": "ConfigType"
}
```

---

## Реєстровані конфіги

Seed: `scripts/seed/data/config_definitions.py`

| key                                 | type        | default_value | options | validation_rules | is_editable | is_visible |
|-------------------------------------|-------------|--------------|---------|----------------|:-----------:|:----------:|
| `auth_methods`                      | multiselect | `["telegram"]` | username, email, telegram | — | ✓ | ✓ |
| `merge_enabled`                     | checkbox    | `false` | — | — | ✓ | ✓ |
| `merge_strategy`                    | select      | `"manual"` | auto, manual | — | ✓ | ✓ |
| `start_language_selection_enabled`  | checkbox    | `false` | — | — | ✓ | ✓ |
| `bot_capture_telegram_profile`      | checkbox    | `true` | — | — | ✓ | ✓ |
| `default_user_role`                 | text        | `""` | — | — | ✓ | ✓ |
| `available_locales`                 | list        | `["en"]` | — | — | ✓ | ✓ |
| `product_first_node_type_selection` | select      | `"location"` | location, category | — | ✓ | ✓ |
| `product_can_switch_node_type`      | checkbox    | `true` | — | — | ✓ | ✓ |
| `product_selection_strategy`        | select      | `"oldest"` | oldest, random | — | ✓ | ✓ |
| `reservation_duration_minutes`      | number      | `15` | — | min:1, max:1440 | ✓ | ✓ |
| `discount_combination_rule`         | select      | `"sum"` | sum, max, min | — | ✓ | ✓ |
| `location_depth`                    | number      | `3` | — | min:1, max:8 | **✗** | ✓ |
| `category_depth`                    | number      | `3` | — | min:1, max:8 | **✗** | ✓ |
| `telegram_bot_token`                | text        | `null` | — | — | ✓ | **✗** |
| `tenant_full_breadcrumb`            | checkbox    | `false`| _ | — | ✓ | ✓ |
**`location_depth` / `category_depth`** — `is_editable=false`. PUT поверне 403. Змінювати тільки при створенні тенанта через SQL або окремий адмін-шлях. Зміна після існуючих продуктів потребує міграції даних.

**`telegram_bot_token`** — `is_visible=false`. Не з'являється в адмін-UI і виключається з BFF-snapshot (перевірте `bff_cache` логіку). Не клонується між тенантами.

---


## Нотатки

- `list` type — підтримує `max_length`, `min`/`max` (числові елементи) та `regex` (рядкові елементи). `min`/`max` та `regex` взаємовиключні.
- Definitions — глобальні (не прив'язані до тенанта). Значення — per-tenant.
- BFF-snapshot: `is_visible=false` виключає конфіг з `tenant_meta.configs`. Деталі — `docs/bot/07-tenant-config-reference.md`.
