# Node Tree API

Управління деревом локацій і категорій. Дерево складається з двох незалежних ієрархій типу `location` і `category`. Продукт прив'язується до листової ноди кожного типу одночасно.

---

## Концепції

### Структура ноди

Кожна нода (`ProductNodeTree`) містить:
- `node_type` — тип: `"location"` або `"category"`, незмінний після створення
- `depth` — рівень у дереві (0 = корінь), обчислюється автоматично
- `parent_id` — батьківська нода того ж типу; `null` для кореня
- `name_key`, `desc_key` — **ключі перекладів**, не текст (зберігаються в `translations`)
- `order_index` — порядок відображення серед сестринських нод
- `price`, `discount_value`, `discount_type` — ціноутворення на рівні ноди (необов'язково)
- `is_active` — чи видима нода клієнтам у browse

### Обмеження дерева

Максимальна глибина задається в tenant config:
- `location_depth` — кількість дозволених рівнів для локацій
- `category_depth` — для категорій

Вузол **не може мати одночасно дітей і прямо прив'язані продукти**: якщо є діти — продукти кріпляться до листів.

### Локалізація нод

`name_key` та `desc_key` — це ключі в namespace `nodes` таблиці `translations`.

| Що | Namespace | Key | Приклад |
|----|-----------|-----|---------|
| Назва ноди | `nodes` | значення `name_key` | `kyiv` |
| Опис ноди | `nodes` | значення `desc_key` | `kyiv_desc` |
| Мітка рівня дерева | `node_levels` | `{node_type}.level_{depth}` | `location.level_0` |

Переклади управляються через [i18n API](./i18n). Видалення ноди **не видаляє** переклади автоматично — треба прибирати окремо.

### Ціноутворення

Фінальна ціна = сума `price` по всіх нодах шляху від кореня до листа (по location + category). Знижки (`discount_value`, `discount_type`) акумулюються згідно конфіг-правила `discount_combination_rule` (`sum` / `max` / `min`).

---

## Permissions

Всі ендпоінти цього розділу вимагають permission: **`locations.manage`**

---

## Schemas

### NodeResponse
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "parent_id": "uuid | null",
  "name_key": "string",
  "desc_key": "string | null",
  "media_id": "uuid | null",
  "node_type": "location | category",
  "depth": 0,
  "order_index": 0,
  "price": "decimal | null",
  "discount_value": "decimal | null",
  "discount_type": "percent | fixed | null",
  "is_active": true,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

---

## Endpoints

### `POST /tenants/{tenant_id}/nodes/{node_type}`

Створює нову ноду. `node_type` у path — єдине джерело типу; поле `node_type` в тілі ігнорується.

**Path:** `node_type: "location" | "category"`

**Body:**
```json
{
  "parent_id": "uuid | null",
  "name_key": "string",
  "desc_key": "string | null",
  "media_id": "uuid | null",
  "order_index": 0,
  "price": "decimal | null",
  "discount_value": "decimal | null",
  "discount_type": "percent | fixed | null"
}
```

**Errors:**
| Code | Причина |
|------|---------|
| `400` | `parent_id` не існує або належить до іншого `node_type` |
| `400` | батько вже має прямо прив'язані продукти |
| `400` | глибина перевищує `{node_type}_depth` з tenant config |
| `400` | tenant config `{node_type}_depth` не визначено або не є числом |

**Response `201`:** `NodeResponse`

---

### `GET /tenants/{tenant_id}/node/{node_id}`

Повертає одну ноду за UUID.

**Response `200`:** `NodeResponse`

**Errors:**
| Code | Причина |
|------|---------|
| `404` | нода не знайдена |

---

### `GET /tenants/{tenant_id}/nodes/{node_type}?parent_id={uuid}`

Список безпосередніх дочірніх нод вказаного типу. Якщо `parent_id` відсутній — повертає кореневі ноди (depth 0).

**Path:** `node_type: "location" | "category"`

**Query:** `parent_id: uuid (optional)`

**Response `200`:** `list[NodeResponse]` (відсортовано по `order_index`, потім `created_at`)

---

### `GET /tenants/{tenant_id}/nodes/{node_id}/children`

Список безпосередніх дітей ноди незалежно від типу. Зручно коли тип невідомий або коли потрібно отримати дітей після навігації по UUID.

**Response `200`:** `list[NodeResponse]` (відсортовано по `order_index`, потім `created_at`)

---

### `GET /tenants/{tenant_id}/nodes/{node_id}/path`

Ланцюжок предків від кореня до зазначеної ноди включно. Використовується для breadcrumb в адмінці.

**Response `200`:** `list[NodeResponse]` (від кореня до поточного вузла)

---

### `PATCH /tenants/{tenant_id}/nodes/{node_id}`

Часткове оновлення ноди. Відсутні поля — не чіпаються. Явний `null` для nullable полів (`price`, `discount_value`, `discount_type`, `desc_key`, `media_id`) — очищає значення в БД.

**Body (всі поля опціональні):**
```json
{
  "name_key": "string | null",
  "desc_key": "string | null",
  "media_id": "uuid | null",
  "order_index": "int | null",
  "price": "decimal | null",
  "discount_value": "decimal | null",
  "discount_type": "percent | fixed | null",
  "is_active": "bool | null"
}
```

**Validations:**
- `price >= 0` якщо передано не null
- `discount_value >= 0` якщо передано не null

**Response `200`:** `NodeResponse`

**Errors:**
| Code | Причина |
|------|---------|
| `404` | нода не знайдена |
| `422` | від'ємна ціна або знижка |

---

### `PUT /tenants/{tenant_id}/nodes/reorder`

Масове переупорядкування нод за один запит. Може містити ноди різних рівнів і типів. Невалідні `node_id` (не належать тенанту) мовчки ігноруються.

**Body:**
```json
{
  "items": [
    { "node_id": "uuid", "order_index": 0 },
    { "node_id": "uuid", "order_index": 1 },
    { "node_id": "uuid", "order_index": 2 }
  ]
}
```

**Response `204`:** No content

---

### `DELETE /tenants/{tenant_id}/nodes/{node_id}`

Видаляє ноду. Дочірні ноди видаляються **каскадно** (CASCADE FK). Переклади (`name_key`, `desc_key`) видаляються окремо через i18n API.

**Errors:**
| Code | Причина |
|------|---------|
| `404` | нода не знайдена |
| `409` | нода або її піддерево містить продукти |

**Response `204`:** No content

---

## Управління перекладами

### Назви та описи нод — namespace `nodes`

```
PUT    /tenants/{tenant_id}/i18n/nodes/{name_key}?locale={locale}
       Body: {"value": "Київ"}

GET    /tenants/{tenant_id}/i18n/nodes?locale={locale}

DELETE /tenants/{tenant_id}/i18n/nodes/{name_key}?locale={locale}
```

### Мітки рівнів дерева — namespace `node_levels`

Key формат: `{node_type}.level_{depth}`

```
PUT    /tenants/{tenant_id}/i18n/node_levels/location.level_0?locale=uk
       Body: {"value": "Місто"}

PUT    /tenants/{tenant_id}/i18n/node_levels/location.level_1?locale=uk
       Body: {"value": "Район"}

PUT    /tenants/{tenant_id}/i18n/node_levels/category.level_0?locale=uk
       Body: {"value": "Категорія"}

GET    /tenants/{tenant_id}/i18n/node_levels

DELETE /tenants/{tenant_id}/i18n/node_levels/location.level_0?locale=uk
```

### Пакетний запит (для UI)

Отримати назви кількох нод і мітки рівнів одним запитом:

```
GET /i18n/batch
    ?tenant_id={uuid}
    &locale=uk
    &keys=nodes.kyiv
    &keys=nodes.kharkiv
    &keys=node_levels.location.level_0
    &keys=node_levels.category.level_0

Response:
{
  "translations": {
    "nodes.kyiv": "Київ",
    "nodes.kharkiv": "Харків",
    "node_levels.location.level_0": "Місто",
    "node_levels.category.level_0": "Категорія"
  }
}
```

---

## Типова послідовність для адмінки

### Ініціалізація дерева

```
1. Отримати ліміти глибини:
   GET /tenants/{id}/config/location_depth
   GET /tenants/{id}/config/category_depth

2. Встановити мітки рівнів (один раз при налаштуванні):
   PUT /tenants/{id}/i18n/node_levels/location.level_0?locale=uk  {"value":"Місто"}
   PUT /tenants/{id}/i18n/node_levels/location.level_1?locale=uk  {"value":"Район"}
   PUT /tenants/{id}/i18n/node_levels/category.level_0?locale=uk  {"value":"Тип"}
```

### Додавання вузла з локалізацією

```
1. POST /tenants/{id}/nodes/location
   Body: {"parent_id": null, "name_key": "kyiv", "order_index": 0}
   → 201: {id: "...", depth: 0, ...}

2. PUT /tenants/{id}/i18n/nodes/kyiv?locale=uk   {"value": "Київ"}
3. PUT /tenants/{id}/i18n/nodes/kyiv?locale=en   {"value": "Kyiv"}
```

### Переупорядкування після drag-and-drop

```
PUT /tenants/{id}/nodes/reorder
Body:
{
  "items": [
    {"node_id": "uuid-kyiv",    "order_index": 0},
    {"node_id": "uuid-kharkiv", "order_index": 1},
    {"node_id": "uuid-odesa",   "order_index": 2}
  ]
}
→ 204
```

### Видалення вузла

```
1. DELETE /tenants/{id}/nodes/{node_id}
   → 204 (або 409 якщо є продукти)

2. DELETE /tenants/{id}/i18n/nodes/{name_key}?locale=uk
3. DELETE /tenants/{id}/i18n/nodes/{name_key}?locale=en
```

### Редагування ціни (очищення)

```
Встановити:
PATCH /tenants/{id}/nodes/{node_id}
{"price": "50.00", "discount_value": "5.00", "discount_type": "fixed"}

Очистити:
PATCH /tenants/{id}/nodes/{node_id}
{"price": null, "discount_value": null, "discount_type": null}
```
