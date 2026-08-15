export function permsToText(perms: string[] | null | undefined): string {
  return perms && perms.length ? perms.join(", ") : "";
}

export function textToPerms(text: string): string[] | null {
  const items = text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : null;
}
