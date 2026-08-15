# Users & Balance — Admin API

Адміністрування користувачів тенанту: перегляд профілів, управління основним і бонусним балансом, перегляд транзакцій.

---

## Концепції

### Баланс

У кожного користувача два незалежних баланси:

| Тип | `balance_type` | Поле в `user_profiles` |
|---|---|---|
| Основний | `main` | `balance` |
| Бонусний | `bonus` | `bonus_balance` |

Кожна операція зміни балансу атомарна: профіль оновлюється і транзакція записується в одному `flush`. Якщо після дебету баланс пішов би в мінус — операція відхиляється з `422`.

### Транзакції

`BalanceTransaction` — незмінний аудит-лог. Кожен запис фіксує:
- `amount` — сума зміни (позитивна = зарахування, негативна = списання)
- `balance_after` — баланс після операції
- `reference_type` — тип операції (enum, задається сервером)
- `reference_id` — UUID конкретної сутності (order, payment тощо), опціональний

### `reference_type`

| Значення | Коли виставляється |
|---|---|
| `manual` | Ручне коригування балансу адміном через API |
| `purchase` | Списання при купівлі продукту |
| `product_added` | Нарахування за додавання продукту |
| `user_transfer` | Переказ між балансами або юзерами |
| `payment_gateway` | Поповнення через зовнішній платіжний шлюз |

---

## Permissions

| Permission | Група | Що дозволяє |
|---|---|---|
| `users.read` | users | Перегляд списку і профілю будь-якого юзера тенанту |
| `balance.main.read` | balance | Перегляд транзакцій основного балансу |
| `balance.bonus.read` | balance | Перегляд транзакцій бонусного балансу |
| `balance.main.manage` | balance | Поповнення і списання основного балансу |
| `balance.bonus.manage` | balance | Поповнення і списання бонусного балансу |

TMA-роль проходить всі перевірки автоматично.

---

## Schemas

### `ProfileResponse`

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "user_id": "uuid",
  "username": "string | null",
  "first_name": "string | null",
  "last_name": "string | null",
  "lang": "string",
  "telegram_bot_token": "string | null",
  "referral_id": "uuid | null",
  "balance": "decimal",
  "bonus_balance": "decimal",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### `PaginatedUsers`

```json
{
  "items": ["...ProfileResponse"],
  "total": 120,
  "limit": 50,
  "offset": 0
}
```

### `TransactionResponse`

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "user_id": "uuid",
  "balance_type": "main | bonus",
  "amount": "decimal",
  "balance_after": "decimal",
  "reference_type": "manual | product_purchase | product_added | user_transfer | payment_gateway",
  "reference_id": "uuid | null",
  "created_at": "datetime"
}
```

### `PaginatedTransactions`

```json
{
  "items": ["...TransactionResponse"],
  "total": 340,
  "limit": 50,
  "offset": 0
}
```

### `BalanceAdjust`

```json
{
  "balance_type": "main | bonus",
  "amount": "decimal",
  "reference_id": "uuid | null"
}
```

- `amount` — позитивне = зарахування, негативне = списання.
- `reference_id` — UUID зовнішньої сутності (order, payment тощо). Опціональний.
- `reference_type` клієнтом не передається — встановлюється сервером залежно від контексту виклику.

---

## Endpoints

### `GET /tenants/{tenant_id}/users`

Список профілів усіх юзерів тенанту з пошуком, сортуванням і пагінацією.

**Permission:** `users.read`

**Query parameters:**

| Параметр | Тип | За замовчуванням | Опис |
|---|---|---|---|
| `search` | `string` | — | Пошук по `username`, `first_name`, `last_name` (case-insensitive, ilike) |
| `sort_by` | enum (нижче) | `created_at` | Поле сортування |
| `sort_dir` | `asc \| desc` | `asc` | Напрямок сортування |
| `limit` | `int` (1–200) | `50` | Кількість записів |
| `offset` | `int` | `0` | Зміщення |

**Допустимі значення `sort_by`:** `created_at`, `username`, `balance`, `bonus_balance`

**Приклади:**

```
# Знайти юзерів по імені, відсортувати за балансом від більшого
GET /tenants/{id}/users?search=ivan&sort_by=balance&sort_dir=desc

# Нові реєстрації спочатку
GET /tenants/{id}/users?sort_by=created_at&sort_dir=desc&limit=20
```

**Response `200`:** `PaginatedUsers`

---

### `GET /tenants/{tenant_id}/users/{user_id}`

Отримати профіль одного юзера.

**Permission:** `users.read`

**Response `200`:** `ProfileResponse`

**Errors:**

| Code | Причина |
|---|---|
| `404` | Профіль не знайдено |

---

### `GET /tenants/{tenant_id}/users/{user_id}/balance/history`

Історія транзакцій юзера з фільтрацією, сортуванням і пагінацією.

**Permission:** динамічна — залежить від параметра `balance_type`:

| `balance_type` | Потрібний permission |
|---|---|
| `main` | `balance.main.read` |
| `bonus` | `balance.bonus.read` |
| не вказано | `balance.main.read` АБО `balance.bonus.read` |

Якщо `balance_type` не вказано, але є тільки один з двох permissions — результат автоматично фільтрується по доступному типу.

**Query parameters:**

| Параметр | Тип | За замовчуванням | Опис |
|---|---|---|---|
| `balance_type` | `main \| bonus` | — | Фільтр по типу балансу |
| `date_from` | `datetime` (ISO 8601) | — | Транзакції не раніше цієї дати |
| `date_to` | `datetime` (ISO 8601) | — | Транзакції не пізніше цієї дати |
| `sort_by` | `created_at \| amount` | `created_at` | Поле сортування |
| `sort_dir` | `asc \| desc` | `desc` | Напрямок сортування |
| `limit` | `int` (1–200) | `50` | Кількість записів |
| `offset` | `int` | `0` | Зміщення |

**Приклади:**

```
# Тільки транзакції основного балансу, найновіші спочатку
GET /tenants/{id}/users/{uid}/balance/history?balance_type=main&sort_dir=desc

# Транзакції за серпень, відсортовані за сумою
GET /tenants/{id}/users/{uid}/balance/history
  ?date_from=2026-08-01T00:00:00Z
  &date_to=2026-08-31T23:59:59Z
  &sort_by=amount
  &sort_dir=desc

# Найбільші списання бонусів
GET /tenants/{id}/users/{uid}/balance/history
  ?balance_type=bonus&sort_by=amount&sort_dir=asc&limit=10
```

**Response `200`:** `PaginatedTransactions`

**Errors:**

| Code | Причина |
|---|---|
| `403` | Немає жодного balance read-permission |
| `403` | Запитаний `balance_type=main` без `balance.main.read` |
| `403` | Запитаний `balance_type=bonus` без `balance.bonus.read` |
| `404` | Юзер не знайдений (перевіряється tenant) |

---

### `POST /tenants/{tenant_id}/users/{user_id}/balance`

Ручне зарахування або списання балансу.

**Permission:** `balance.main.manage` (для `balance_type=main`) або `balance.bonus.manage` (для `balance_type=bonus`)

**Body:** `BalanceAdjust`

**Логіка:**
- Позитивний `amount` — зарахування.
- Негативний `amount` — списання. Якщо баланс після операції < 0 → `422`.
- Операція атомарна: оновлення профілю + запис транзакції в одному flush.

**Response `201`:** `TransactionResponse`

**Errors:**

| Code | Причина |
|---|---|
| `403` | Немає відповідного manage-permission |
| `404` | Профіль юзера не знайдено |
| `422` | Недостатньо коштів для списання |

---

## Типові сценарії

### Пошук і перевірка юзера

```
1. Знайти юзера по username:
   GET /tenants/{id}/users?search=vasyl&sort_by=created_at

2. Відкрити профіль:
   GET /tenants/{id}/users/{uid}
   → ProfileResponse з поточними balance і bonus_balance

3. Переглянути останні транзакції:
   GET /tenants/{id}/users/{uid}/balance/history?limit=10
```

### Поповнення основного балансу

```
POST /tenants/{id}/users/{uid}/balance
{
  "balance_type": "main",
  "amount": "100.00",
  "reference_id": "a3f1c2b4-d5e6-..."
}
→ 201: TransactionResponse з balance_after
```

### Списання бонусного балансу

```
POST /tenants/{id}/users/{uid}/balance
{
  "balance_type": "bonus",
  "amount": "-50.00"
}
→ 201 якщо bonus_balance >= 50
→ 422 якщо недостатньо бонусів
```

### Аудит транзакцій за період

```
# Усі операції юзера за тиждень по обох балансах
GET /tenants/{id}/users/{uid}/balance/history
  ?date_from=2026-08-07T00:00:00Z
  &date_to=2026-08-14T23:59:59Z
  &sort_by=created_at
  &sort_dir=asc
  &limit=200
```

### Адмін з одним balance permission

```
# Якщо у адміна є тільки balance.main.read:
GET /tenants/{id}/users/{uid}/balance/history
→ автоматично повертає тільки main-транзакції

GET /tenants/{id}/users/{uid}/balance/history?balance_type=bonus
→ 403
```
