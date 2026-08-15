export interface BlockCondition {
  all?: string[];
  any?: string[];
}

export function conditionToText(condition: BlockCondition | null | undefined): string {
  if (!condition) return "";
  if (condition.all?.length) return `all: ${condition.all.join(", ")}`;
  if (condition.any?.length) return `any: ${condition.any.join(", ")}`;
  return "";
}

export function textToCondition(text: string): BlockCondition | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(all|any):\s*(.+)$/i.exec(trimmed);
  if (!match) {
    return { all: trimmed.split(",").map((s) => s.trim()).filter(Boolean) };
  }
  const [, kind, rest] = match;
  const items = rest.split(",").map((s) => s.trim()).filter(Boolean);
  return kind.toLowerCase() === "any" ? { any: items } : { all: items };
}
