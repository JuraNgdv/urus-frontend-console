# Products API

Управління продуктами: додавання, перегляд, редагування та пов'язані з ними медіа. Продукт завжди прив'язаний до **листової** ноди дерева локацій і листової ноди дерева категорій одночасно.

---

## Концепції

### Статус продукту

Кожен продукт має поле `status`, яке описує його поточний стан у lifecycle:

| Статус | Опис |
|---|---|
| `available` | Доступний для резервації або покупки |
| `reserved` | Заброньований конкретним користувачем |
| `sold` | Куплений (фінальний стан автоматичного продажу) |
| `gifted` | Подарований (виставляється вручну через update) |
| `won` | Виграний (виставляється вручну через update) |

Статуси `sold`, `gifted`, `won` є фінальними в розумінні бізнес-логіки — система не змінює їх автоматично. `sold_price` записується автоматично при покупці і не доступний для ручного редагування.

### Медіа

Продукт не має окремого поля `media_id`. Замість цього використовується таблиця `media_attachments` з прив'язкою `entity_type = "product"` та `entity_id = product.id`.

**Властивості:**
- Медіа — **обов'язкове**: продукт не можна створити без хоча б одного медіафайлу.
- Список медіа **впорядкований**: `order_index` визначає порядок відображення (перший елемент = головне фото).
- При оновленні `media_ids` список **повністю замінюється**: стара прив'язка видаляється, нова записується з новим `order_index` за порядком масиву.
- Медіафайли (`media.id`) мають бути попередньо завантажені через Media API.

### Ціноутворення

Фінальна ціна продукту розраховується з ноди location і category дерев. Продукт може мати власну знижку (`discount_value`, `discount_type`), яка застосовується **поверх** ціни нод. Детальніше — у [node-tree-api.md](./node-tree-api.md).

---

## Permissions

| Permission | Кому видається | Що дозволяє |
|---|---|---|
| `products.add` | Адмін / персонал | Додавати продукти (bulk) |
| `products.manage` | Адмін | Переглядати всі продукти (list, get) |
| `products.update.any` | Адмін | Редагувати будь-який продукт (повна відповідь) |
| `products.update.my` | Персонал | Редагувати тільки власні додані продукти (safe відповідь) |
| `products.set_discount` | Адмін | Встановлювати `discount_value` / `discount_type` при update |
| `products.reserve` | Клієнт | Резервувати продукт |
| `products.buy` | Клієнт | Купувати продукт |
| `products.view_bought` | Клієнт | Переглядати свої куплені продукти |
| `products.view_added` | Персонал / адмін | Переглядати продукти, які додав сам |

TMA-роль отримує всі permissions автоматично. Роль `Customer` за замовчуванням містить `products.buy`, `products.reserve`, `products.view_bought`.

---

## Schemas

### `ProductResponse` (повний — для адмінів)

Повертається при `products.manage` (list/get) та `products.update.any` (PATCH), а також у `/my/bought`.

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "location_id": "uuid",
  "category_id": "uuid",
  "description": "string | null",
  "added_by": "uuid",
  "added_at": "datetime",
  "reserved_by": "uuid | null",
  "reserved_at": "datetime | null",
  "bought_by": "uuid | null",
  "bought_at": "datetime | null",
  "status": "available | reserved | sold | gifted | won",
  "media_ids": ["uuid", "uuid"],
  "latitude": "decimal | null",
  "longitude": "decimal | null",
  "discount_value": "decimal | null",
  "discount_type": "percent | fixed | null",
  "sold_price": "decimal | null",
  "created_at": "datetime",
  "is_available": true
}
```

### `ProductSafeResponse` (обмежений — для персоналу)

Повертається при `products.update.my` (PATCH) та `/my/added`. Не містить інформацію про покупця і резервацію.

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "location_id": "uuid",
  "category_id": "uuid",
  "description": "string | null",
  "added_by": "uuid",
  "added_at": "datetime",
  "status": "available | reserved | sold | gifted | won",
  "media_ids": ["uuid", "uuid"],
  "latitude": "decimal | null",
  "longitude": "decimal | null",
  "discount_value": "decimal | null",
  "discount_type": "percent | fixed | null",
  "sold_price": "decimal | null",
  "created_at": "datetime",
  "is_available": true
}
```

- `media_ids` — список UUID медіафайлів у порядку `order_index` (завжди непорожній).
- `is_available` — обчислюване поле: `status == "available"`.
- `sold_price` — записується автоматично при покупці, `null` до продажу.

### `ProductCreate`
```json
{
  "location_id": "uuid",
  "category_id": "uuid",
  "description": "string | null",
  "media_ids": ["uuid"],
  "latitude": "decimal | null",
  "longitude": "decimal | null"
}
```

- `media_ids` — **обов'язкове**, мінімум один UUID.
- `location_id` і `category_id` — мають бути **листовими** нодами відповідного типу.
- `discount_value` / `discount_type` недоступні при створенні — встановлюються тільки через PATCH з `products.set_discount`.

### `ProductBulkCreate`
```json
{
  "products": [
    { ...ProductCreate... },
    { ...ProductCreate... }
  ]
}
```

### `ProductBulkResult`
```json
{
  "results": [
    { "index": 0, "success": true,  "product": { ...ProductResponse... }, "error": null },
    { "index": 1, "success": false, "product": null, "error": "location_id must be a leaf node" }
  ]
}
```

Продукти обробляються по одному. Помилка в одному елементі не зупиняє інші.

### `ProductUpdate`

Всі поля опціональні. Відсутні поля — не змінюються.

```json
{
  "description": "string | null",
  "media_ids": ["uuid"],
  "status": "available | reserved | sold | gifted | won | null",
  "latitude": "decimal | null",
  "longitude": "decimal | null",
  "discount_value": "decimal | null",
  "discount_type": "percent | fixed | null"
}
```

- `media_ids` — якщо передано, список **повністю замінює** поточні медіа. Не можна передати порожній масив `[]`.
- Явний `null` для nullable полів (`description`, `latitude`, `longitude`, `discount_value`, `discount_type`) — очищає значення.
- `sold_price` не редагується через цей ендпоінт.

---

## Endpoints

### `POST /tenants/{tenant_id}/products`

Додавання продуктів пакетом.

**Permission:** `products.add`

**Body:** `ProductBulkCreate`

**Логіка на кожен елемент:**
1. Перевірити що `location_id` є листовою нодою типу `location`.
2. Перевірити що `category_id` є листовою нодою типу `category`.
3. Створити запис `Product`.
4. Прив'язати `media_ids` до продукту через `media_attachments` (порядок — за індексом масиву).

Якщо будь-яка перевірка не пройшла — елемент позначається `success: false`, решта продовжується.

**Errors (на рівні елемента):**
| Причина | `error` |
|---|---|
| `location_id` не є листовою нодою | `"location_id must be a leaf node"` |
| `category_id` не є листовою нодою | `"category_id must be a leaf node"` |
| `location_id` / `category_id` не знайдено | `"404: ... node not found"` |
| `media_ids` порожній | `422` на рівні схеми (не потрапить у results) |

**Response `201`:** `ProductBulkResult`

---

### `GET /tenants/{tenant_id}/products`

Список продуктів тенанту з фільтрацією і сортуванням.

**Permission:** `products.manage`

**Query parameters:**

| Параметр | Тип | За замовчуванням | Опис |
|---|---|---|---|
| `location_id` | `uuid` | — | Фільтр по локації |
| `category_id` | `uuid` | — | Фільтр по категорії |
| `status` | `available\|reserved\|sold\|gifted\|won` | — | Фільтр по статусу |
| `bought_by` | `uuid` | — | Фільтр по покупцю (user_id) |
| `added_by` | `uuid` | — | Фільтр по тому хто додав (user_id) |
| `sort_by` | enum (див. нижче) | `added_at` | Поле для сортування |
| `sort_order` | `asc\|desc` | `asc` | Напрямок сортування |
| `limit` | `int` (1–200) | `50` | Кількість записів |
| `offset` | `int` | `0` | Зміщення для пагінації |

**Допустимі значення `sort_by`:**
`added_at`, `bought_at`, `sold_price`, `status`, `created_at`, `latitude`, `longitude`

**Приклади:**

```
# Всі доступні продукти у локації, відсортовані за датою додавання
GET /tenants/{id}/products?location_id={uuid}&status=available&sort_by=added_at&sort_order=asc

# Куплені продукти конкретного юзера, найновіші спочатку
GET /tenants/{id}/products?bought_by={user_uuid}&status=sold&sort_by=bought_at&sort_order=desc

# Що додав конкретний менеджер
GET /tenants/{id}/products?added_by={user_uuid}&sort_by=added_at&sort_order=desc
```

**Response `200`:** `list[ProductResponse]`

---

### `GET /tenants/{tenant_id}/products/{product_id}`

Отримати один продукт за UUID.

**Permission:** `products.manage`

**Response `200`:** `ProductResponse`

**Errors:**
| Code | Причина |
|---|---|
| `404` | Продукт не знайдено |

---

### `PATCH /tenants/{tenant_id}/products/{product_id}`

Часткове оновлення продукту.

**Permission:** `products.update.any` АБО `products.update.my`

**Логіка доступу:**
- `products.update.any` → будь-який продукт → повертає **`ProductResponse`**.
- `products.update.my` → тільки де `added_by == user.id` → повертає **`ProductSafeResponse`**.
- Жоден → `403`.

**Логіка знижки:**
- Поля `discount_value` і `discount_type` потребують додаткового permission `products.set_discount`.
- Якщо хоча б одне з цих полів присутнє в тілі і у користувача немає `products.set_discount` → `403`.
- Наявність `products.update.any` або `products.update.my` **не дає** права встановлювати знижку автоматично.

**Body:** `ProductUpdate`

**Логіка медіа при оновленні:**

Якщо `media_ids` передано — відбувається **повна заміна**:
1. Видаляються всі поточні `media_attachments` для цього продукту.
2. Записуються нові з `order_index = 0, 1, 2, ...` за порядком масиву.

Якщо `media_ids` **не передано** — медіа не змінюються.

**Response `200`:** `ProductResponse`

**Errors:**
| Code | Причина |
|---|---|
| `403` | Немає жодного update-permission |
| `403` | `products.update.my` + продукт доданий іншим користувачем |
| `403` | `discount_value`/`discount_type` в тілі без `products.set_discount` |
| `404` | Продукт не знайдено |
| `422` | `media_ids` — порожній масив |

---

### `GET /tenants/{tenant_id}/products/my/bought`

Продукти, куплені поточним користувачем. Відсортовано від найновішого.

**Permission:** `products.view_bought`

**Query:** `limit` (1–200, default 50), `offset` (default 0)

**Response `200`:** `list[ProductResponse]`

---

### `GET /tenants/{tenant_id}/products/my/added`

Продукти, додані поточним користувачем. Відсортовано від найновішого.

**Permission:** `products.view_added`

**Query:** `limit` (1–200, default 50), `offset` (default 0)

**Response `200`:** `list[ProductResponse]`

---

## Типова послідовність

### Додавання продуктів (адмін / персонал)

```
1. Завантажити медіафайли через Media API:
   POST /tenants/{id}/media
   → ["media-uuid-1", "media-uuid-2"]

2. Знайти листові ноди:
   GET /tenants/{id}/nodes/location?parent_id={uuid}   → листова нода
   GET /tenants/{id}/nodes/category?parent_id={uuid}   → листова нода

3. Додати продукти пакетом:
   POST /tenants/{id}/products
   {
     "products": [
       {
         "location_id": "loc-leaf-uuid",
         "category_id": "cat-leaf-uuid",
         "description": "Опис продукту",
         "media_ids": ["media-uuid-1", "media-uuid-2"],
         "latitude": 50.4501,
         "longitude": 30.5234
       }
     ]
   }
   → 201: { "results": [{ "index": 0, "success": true, "product": {...} }] }
```

### Оновлення медіа продукту

```
# Замінити фото (стара прив'язка видаляється, нова записується)
PATCH /tenants/{id}/products/{product_id}
{
  "media_ids": ["new-media-uuid-1", "new-media-uuid-2"]
}

# Змінити опис без зміни медіа
PATCH /tenants/{id}/products/{product_id}
{
  "description": "Новий опис"
}
```

### Перегляд своїх куплених (клієнт)

```
GET /tenants/{id}/products/my/bought?limit=20&offset=0
→ список ProductResponse відсортований від найновішого bought_at
```

### Адмін шукає продукти менеджера зі статусом sold

```
GET /tenants/{id}/products
  ?added_by={manager_uuid}
  &status=sold
  &sort_by=bought_at
  &sort_order=desc
  &limit=50
```

### Зміна статусу вручну (gifted / won)

```
PATCH /tenants/{id}/products/{product_id}
{
  "status": "gifted"
}
```

`sold_price` при цьому не встановлюється автоматично — він записується лише при покупці через `/products/buy`.

---

## Нотатки

- **Пагінація** реалізована через `limit` + `offset`. Загальна кількість записів в `GET /products` не повертається — для підрахунку використовуй окремий запит або рахуй на фронті.
- **`media_ids` завжди непорожній** у `ProductResponse`: система не дозволяє ні створити, ні оновити продукт без хоча б одного медіафайлу.
- Маршрути `/my/bought` і `/my/added` зареєстровані **до** `/{product_id}`, тому FastAPI не намагається інтерпретувати `"my"` як UUID.
