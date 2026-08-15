# RBAC Permissions — Contract

## Concepts

### Permission
Atomic capability string in dot-notation: `domain(.subdomain).action`.  
Format enforced by validator: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`

```
products.add
role.assign
role.permissions.update
```

**System permissions** — seeded by migration, `tenant_id = NULL`, `created_by = NULL`.  
**Custom permissions** — created by users via API, scoped to a tenant.

### Role
Named collection of permissions, scoped to a tenant (`tenant_id`).  
`created_by = NULL` → system role (e.g. TMA). User-created roles have `created_by = user_id`.

### TMA (Tenant Master Admin)
System role created automatically on tenant creation. Holds **all system permissions**.  
A user with `membership.is_tma = true` bypasses all permission and delegation checks.  
TMA status is checked via `RBACService._is_tma()` on every guarded call.

---

## Cache

Key format: `rbac:{tenant_id}:{user_id}:permissions`  
Value: JSON array of permission key strings, no TTL (invalidated explicitly).

| Event | Invalidation |
|---|---|
| Role assigned / revoked from user | `invalidate(tenant_id, user_id)` |
| TMA role assigned | `invalidate(tenant_id, user_id)` |
| Role permissions updated | `invalidate_tenant(tenant_id)` — pattern `rbac:{tenant_id}:*:permissions` |
| Role deleted | `invalidate_tenant(tenant_id)` |
| Role name/description updated | `invalidate_tenant(tenant_id)` |

`has_permission()` check order: TMA shortcut → Redis cache → DB.

---

## Protecting an Endpoint

```python
from app.modules.rbac.dependencies import require_permission

# OR logic — user needs at least one of these
@router.get(
    "/tenants/{tenant_id}/something",
    dependencies=[
        Depends(get_tenant_or_404),
        Depends(require_permission("role.assign", "role.revoke")),
    ],
)

# AND logic — stack multiple Depends
@router.post(
    "/tenants/{tenant_id}/something",
    dependencies=[
        Depends(get_tenant_or_404),
        Depends(require_permission("role.create")),
        Depends(require_permission("permission.create")),
    ],
)
```

`require_permission` reads `tenant_id` from the path automatically.  
Returns `403` if none of the listed permissions match.  
TMA users always pass.

---

## Delegation Policy

Non-TMA users can only assign/revoke what their own roles explicitly permit.  
Policy tables:

| Table | Controls |
|---|---|
| `role_manage_policy_assign_roles` | Which roles this role can assign to others |
| `role_manage_policy_revoke_roles` | Which roles this role can revoke from others |
| `role_manage_policy_assign_permissions` | Which permissions this role can put on a role |
| `role_manage_policy_remove_permissions` | Which permissions this role can remove from a role |

`DelegationRepository.get_manageable_roles()` = union of assignable + revokable roles.

**Setting delegation (TMA-only operation):**
```python
await svc.set_delegation_assign_roles(role_id, [target_role_id_1, ...])
await svc.set_delegation_revoke_roles(role_id, [target_role_id_1, ...])
await svc.set_delegation_assign_permissions(role_id, [permission_id_1, ...])
await svc.set_delegation_remove_permissions(role_id, [permission_id_1, ...])
```

---

## Ownership Rules

**Roles:** Non-TMA can update/delete only roles they created (`role.created_by == user.id`).  
**Permissions:** Non-TMA can update/delete only custom permissions they created.  
**System permissions** (`created_by = NULL`) cannot be modified or deleted by anyone, including TMA.

---

## System Permissions Reference

| Key | Group | Description |
|---|---|---|
| `products.add` | products | Add products |
| `products.buy` | products | Buy products |
| `products.reserve` | products | Reserve products |
| `products.manage` | products | Manage products |
| `locations.manage` | locations | Manage location and category nodes |
| `translations.manage` | i18n | Edit translations |
| `keyboards.manage` | keyboards | Manage keyboards, rows, and buttons |
| `menus.manage` | menus | Manage menus and blocks |
| `role.create` | rbac | Create custom roles |
| `role.read` | rbac | List roles and view user permissions |
| `role.update` | rbac | Update roles (requires ownership) |
| `role.delete` | rbac | Delete roles (requires ownership) |
| `role.assign` | rbac | Assign roles to users (subject to delegation) |
| `role.revoke` | rbac | Revoke roles from users (subject to delegation) |
| `role.permissions.update` | rbac | Set permissions on a role (subject to delegation) |
| `permission.create` | rbac | Create custom permissions |
| `permission.update` | rbac | Update custom permissions (requires ownership) |
| `permission.delete` | rbac | Delete custom permissions (requires ownership) |

---

## API Endpoints

### Permissions

| Method | Path | Required Permission | Notes |
|---|---|---|---|
| `GET` | `/admin/permissions` | Master Admin | All system permissions |
| `GET` | `/tenants/{id}/permissions` | authenticated | System + tenant custom |
| `GET` | `/tenants/{id}/permissions/manageable` | `role.assign` OR `role.revoke` | Filtered by delegation |
| `POST` | `/tenants/{id}/permissions` | `permission.create` | Custom only; key validated |
| `PATCH` | `/tenants/{id}/permissions/{perm_id}` | `permission.update` | Ownership required |
| `DELETE` | `/tenants/{id}/permissions/{perm_id}` | `permission.delete` | Ownership required |

### Roles

| Method | Path | Required Permission | Notes |
|---|---|---|---|
| `GET` | `/tenants/{id}/roles` | `role.read` | All tenant roles |
| `GET` | `/tenants/{id}/roles/manageable` | `role.assign` OR `role.revoke` | Filtered by delegation |
| `POST` | `/tenants/{id}/roles` | `role.create` | Delegation checked for permission_ids |
| `PATCH` | `/tenants/{id}/roles/{role_id}` | `role.update` | Ownership required; cache invalidated |
| `DELETE` | `/tenants/{id}/roles/{role_id}` | `role.delete` | Ownership required; cache invalidated |
| `PUT` | `/tenants/{id}/roles/{role_id}/permissions` | `role.permissions.update` | Full replace; delegation checked |

### User Roles

| Method | Path | Required Permission | Notes |
|---|---|---|---|
| `POST` | `/tenants/{id}/users/{uid}/roles` | `role.assign` | Delegation checked |
| `DELETE` | `/tenants/{id}/users/{uid}/roles/{role_id}` | `role.revoke` | Delegation checked |
| `GET` | `/tenants/{id}/users/{uid}/permissions` | `role.read` | Returns flat permission key list |

---

## Creating a Custom Permission Key

Key must match `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`.  
At least two dot-separated segments. No uppercase, no hyphens.

```json
POST /tenants/{tenant_id}/permissions
{
  "key": "orders.export",
  "group": "orders",
  "description_id": "perm.orders.export"
}
```

---

## Checking Permission in Code (Service Layer)

```python
has = await svc.has_permission(user_id, tenant_id, "products.add", redis)

perms: set[str] = await svc.get_user_permissions(user_id, tenant_id, redis)
```

Both methods return `True` / full set for TMA users without hitting the DB for permission records.
