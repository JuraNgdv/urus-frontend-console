import type { SystemStringKey } from "./i18n/SystemI18nContext";

// Ported from the mockup's AREAS constant. Areas without an `href` stay as
// permission-gated drawer entries that flash "not part of this step yet",
// exactly like the mockup, until they get a real screen.
export interface AreaDef {
  id: string;
  labelKey: SystemStringKey;
  descriptionKey: SystemStringKey;
  permission: string;
  any: string[];
  href?: string;
}

export const AREAS: AreaDef[] = [
  {
    id: "menus",
    labelKey: "console.areas.menus.label",
    descriptionKey: "console.areas.menus.description",
    permission: "menus.manage",
    any: ["menus.manage", "keyboards.manage"],
    href: "/menus",
  },
  {
    id: "locations",
    labelKey: "console.areas.locations.label",
    descriptionKey: "console.areas.locations.description",
    permission: "locations.manage",
    any: ["locations.manage"],
    href: "/locations",
  },
  {
    id: "products",
    labelKey: "console.areas.products.label",
    descriptionKey: "console.areas.products.description",
    permission: "products.manage",
    any: ["products.manage", "products.view_added", "products.view_bought"],
    href: "/products",
  },
  {
    id: "products-add",
    labelKey: "console.areas.productsAdd.label",
    descriptionKey: "console.areas.productsAdd.description",
    permission: "products.add",
    any: ["products.add"],
    href: "/products/add",
  },
  {
    id: "users",
    labelKey: "console.areas.users.label",
    descriptionKey: "console.areas.users.description",
    permission: "users.read",
    any: ["users.read"],
    href: "/users",
  },
  {
    id: "appearance",
    labelKey: "console.areas.appearance.label",
    descriptionKey: "console.areas.appearance.description",
    permission: "appearance.manage",
    any: ["appearance.manage"],
    href: "/appearance",
  },
  {
    id: "i18n",
    labelKey: "console.areas.i18n.label",
    descriptionKey: "console.areas.i18n.description",
    permission: "translations.manage",
    any: ["translations.manage"],
  },
  {
    id: "rbac",
    labelKey: "console.areas.rbac.label",
    descriptionKey: "console.areas.rbac.description",
    permission: "permission.create · update · delete",
    any: ["permission.create", "permission.update", "permission.delete", "role.read"],
    href: "/permissions",
  },
  {
    id: "cfg",
    labelKey: "console.areas.cfg.label",
    descriptionKey: "console.areas.cfg.description",
    permission: "configs.manage",
    any: ["configs.manage"],
    href: "/configs",
  },
];

export function visibleAreas(permissions: string[]): AreaDef[] {
  return AREAS.filter((a) => a.any.some((p) => permissions.includes(p)));
}
