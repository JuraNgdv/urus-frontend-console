import type { MenuBlockType } from "./types";

// Menu block `content` is a loosely-typed JSON blob whose shape depends on
// `type` (see menus_and_keyboards.md). This maps the type to its
// translation-ref field so the editor can treat it generically, matching the
// mockup's single "Translation ref" field.
export function getBlockRef(type: MenuBlockType, content: Record<string, unknown>): string {
  switch (type) {
    case "TEXT":
    case "RICH_TEXT":
      return typeof content.text_ref === "string" ? content.text_ref : "";
    case "PHOTO":
    case "VIDEO":
    case "AUDIO":
    case "DOCUMENT":
    case "ALBUM":
      return typeof content.caption_ref === "string" ? content.caption_ref : "";
    case "POLL":
      return typeof content.question_ref === "string" ? content.question_ref : "";
    default:
      return "";
  }
}

// Translation refs for menu blocks are never hand-typed — this generates a
// stable, unique one at block-creation time so the UI doesn't need a
// "translation ref" field at all. Namespace is always the constant "menus",
// with the menu key + a random slug as the key, e.g. "menus.main.block_a1b2c3d4".
export function generateBlockRef(menuKey: string): string {
  return `menus.${menuKey}.block_${crypto.randomUUID().slice(0, 8)}`;
}

// `entityType` defaults to "block" (media attached directly to this block's
// own id) but can be any other entity type (e.g. "product") so the renderer
// resolves media dynamically from that entity's context at send time instead.
export function buildBlockContent(type: MenuBlockType, ref: string, entityType: string = "block"): Record<string, unknown> {
  switch (type) {
    case "TEXT":
    case "RICH_TEXT":
      return { text_ref: ref, text_params: {}, parse_mode: "html" };
    case "PHOTO":
    case "VIDEO":
    case "AUDIO":
    case "DOCUMENT":
    case "ALBUM":
      return { entity_type: entityType, caption_ref: ref, text_params: {}, parse_mode: "html" };
    case "POLL":
      return { question_ref: ref, question_params: {}, options: [] };
    default:
      return {};
  }
}
