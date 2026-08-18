import type { ButtonActionType, ButtonFull } from "./types";

export interface ActionPayloadDraft {
  navigateMenu: string;
  hookHandler: string;
  url: string;
}

export function payloadFromButton(actionType: ButtonActionType, payload: Record<string, unknown> | null): ActionPayloadDraft {
  const p = payload ?? {};
  return {
    navigateMenu: actionType === "NAVIGATE" ? String(p.menu ?? "") : "",
    hookHandler: actionType === "HOOK" ? String(p.hook ?? "") : "",
    url: actionType === "URL" ? String(p.url ?? "") : "",
  };
}

export function buildActionPayload(actionType: ButtonActionType, draft: ActionPayloadDraft): Record<string, unknown> | null {
  switch (actionType) {
    case "NAVIGATE":
      return { menu: draft.navigateMenu };
    case "HOOK":
      return { hook: draft.hookHandler };
    case "URL":
      return { url: draft.url };
    case "BACK":
      return null;
  }
}

export function describeAction(btn: ButtonFull): string {
  const payload = btn.action_payload as Record<string, unknown> | null;
  const extra = payload && Object.keys(payload).length ? Object.values(payload)[0] : "";
  return extra ? `${btn.action_type} · ${extra}` : btn.action_type;
}
