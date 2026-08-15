import { getBlockRef } from "./blockContent";
import { emptyTranslations } from "./locale/LocaleContext";
import type { BlockFull, MediaAttachmentResponse, MenuBlockType } from "./types";

// A "rich message" is a contiguous run of underlying menu blocks — one
// RICH_TEXT block per text/table segment, one PHOTO/VIDEO block per media
// segment — tagged with a shared `meta.rich_group` id so RichMessageEditor
// can reload and re-diff them as a single document. Block `type` is
// immutable server-side, so a segment's kind never changes after creation.

export type RichSegmentKind = "text" | "image" | "video" | "table";

interface SegmentCommon {
  key: string;
  blockId: string | null;
  ref: string;
}

export interface TextSegment extends SegmentCommon {
  kind: "text";
  // One HTML value per content locale — see emptyTranslations().
  html: Record<string, string>;
}

export interface TableSegment extends SegmentCommon {
  kind: "table";
  // Table cells aren't translated per locale (kept simple, like the rest of
  // this editor's translation fields) — the same grid saves to every locale.
  rows: string[][];
}

export interface MediaSegment extends SegmentCommon {
  kind: "image" | "video";
  // One caption per content locale — see emptyTranslations().
  caption: Record<string, string>;
  // "block" attaches an uploaded file directly to this block's own id.
  // Any other value (e.g. "product") skips upload entirely — the renderer
  // resolves media for that entity dynamically at send time.
  entityType: string;
  file: File | null;
  existing: MediaAttachmentResponse[];
}

export type RichSegment = TextSegment | TableSegment | MediaSegment;

export function richGroupOf(block: BlockFull): string | null {
  const value = block.meta?.rich_group;
  return typeof value === "string" ? value : null;
}

export function groupBlocksByRichGroup(blocks: BlockFull[]): Map<string, BlockFull[]> {
  const groups = new Map<string, BlockFull[]>();
  for (const block of blocks) {
    const group = richGroupOf(block);
    if (!group) continue;
    const list = groups.get(group);
    if (list) list.push(block);
    else groups.set(group, [block]);
  }
  for (const list of groups.values()) list.sort((a, b) => a.order_index - b.order_index);
  return groups;
}

export function blockTypeForKind(kind: RichSegmentKind): MenuBlockType {
  if (kind === "image") return "PHOTO";
  if (kind === "video") return "VIDEO";
  return "RICH_TEXT";
}

export function blockToSegment(
  block: BlockFull,
  textByLocale: Record<string, string>,
  attachments: MediaAttachmentResponse[],
): RichSegment {
  const key = block.id;
  const ref = getBlockRef(block.type, block.content);
  if (block.type === "PHOTO" || block.type === "VIDEO") {
    const entityType = typeof block.content.entity_type === "string" ? block.content.entity_type : "block";
    return {
      kind: block.type === "PHOTO" ? "image" : "video",
      key,
      blockId: block.id,
      ref,
      caption: textByLocale,
      entityType,
      file: null,
      existing: attachments,
    };
  }
  const grid = block.meta?.table_grid;
  if (Array.isArray(grid)) {
    return { kind: "table", key, blockId: block.id, ref, rows: grid as string[][] };
  }
  return { kind: "text", key, blockId: block.id, ref, html: textByLocale };
}

export function createSegment(kind: RichSegmentKind, refSuggestion: string): RichSegment {
  const key = crypto.randomUUID();
  const base = { key, blockId: null as string | null, ref: refSuggestion };
  switch (kind) {
    case "text":
      return { ...base, kind: "text", html: emptyTranslations() };
    case "table":
      return {
        ...base,
        kind: "table",
        rows: [
          ["", ""],
          ["", ""],
        ],
      };
    case "image":
    case "video":
      return { ...base, kind, caption: emptyTranslations(), entityType: "block", file: null, existing: [] };
  }
}

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "code", "pre", "a", "tg-spoiler", "blockquote"]);

// Regex-based, not a DOM sanitizer: content here is authored by the tenant
// admin themselves (same trust level as any other translation value they
// edit elsewhere in this app), so this only guards against stray/broken
// tags reaching the preview and the saved translation — not hostile input.
export function sanitizeTelegramHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (match, tagRaw: string, attrs: string) => {
    const tag = tagRaw.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    if (tag === "a") {
      const hrefMatch = /href\s*=\s*"([^"]*)"/i.exec(attrs) ?? /href\s*=\s*'([^']*)'/i.exec(attrs);
      const href = (hrefMatch ? hrefMatch[1] : "").replace(/"/g, "&quot;");
      return `<a href="${href}">`;
    }
    return `<${tag}>`;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Telegram messages have no native table markup, so a table segment renders
// to a monospaced `<pre>` block; the editable grid itself is kept in
// block.meta.table_grid so it can be reloaded without parsing text back out.
export function tableRowsToPreHtml(rows: string[][]): string {
  if (rows.length === 0) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => (r[c] ?? "").length)));
  const lines = rows.map((r) => Array.from({ length: cols }, (_, c) => (r[c] ?? "").padEnd(widths[c])).join(" | "));
  return `<pre>${escapeHtml(lines.join("\n"))}</pre>`;
}
