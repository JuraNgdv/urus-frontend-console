"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useSystemT } from "@/lib/i18n/SystemI18nContext";
import { listMenus } from "@/lib/api/menus";
import { listKeyboards } from "@/lib/api/keyboards";
import { primaryBtn, tabStyle } from "@/components/ui/styles";
import type { KeyboardResponse, MenuResponse } from "@/lib/types";

export function ListScreen({ kind }: { kind: "menus" | "keyboards" }) {
  const router = useRouter();
  const { token, claims } = useAuth();
  const flash = useToast();
  const t = useSystemT();
  const tenantId = claims?.tenant_id ?? "";

  const query = useQuery<(MenuResponse | KeyboardResponse)[]>({
    queryKey: [kind, tenantId],
    queryFn: () => (kind === "menus" ? listMenus(tenantId, token!) : listKeyboards(tenantId, token!)),
    enabled: !!token && !!tenantId,
  });

  const items = query.data ?? [];
  const title = kind === "menus" ? t("console.list.menus") : t("console.list.keyboards");
  const colThreeLabel = kind === "menus" ? t("console.list.columnBlocks") : t("console.list.columnType");

  return (
    <main className="urus-list-screen">
      <div className="urus-list-head">
        <div>
          <div className="urus-eyebrow">{t("console.common.manage")}</div>
          <h1 className="urus-display-sm">{title}</h1>
        </div>
        <div className="urus-list-actions">
          <div className="urus-tabbar" style={{ marginBottom: 0 }}>
            <button type="button" style={tabStyle(kind === "menus")} onClick={() => router.push("/menus")}>
              {t("console.list.menus")}
            </button>
            <button type="button" style={tabStyle(kind === "keyboards")} onClick={() => router.push("/keyboards")}>
              {t("console.list.keyboards")}
            </button>
          </div>
          <button
            type="button"
            style={primaryBtn()}
            onClick={() => flash(kind === "menus" ? t("console.list.toastMenu") : t("console.list.toastKeyboard"))}
          >
            {kind === "menus" ? t("console.list.newMenu") : t("console.list.newKeyboard")}
          </button>
        </div>
      </div>

      <div className="urus-table-card">
        <div className="urus-table-header-row">
          <span>{t("console.list.columnKey")}</span>
          <span>{t("console.list.columnDescription")}</span>
          <span>{colThreeLabel}</span>
          <span style={{ textAlign: "right" }}>{t("console.list.columnVersion")}</span>
        </div>
        {query.isLoading && <div className="urus-table-empty">{t("console.list.loading")}</div>}
        {query.isError && <div className="urus-table-empty">{t("console.list.failed")}</div>}
        {!query.isLoading && !query.isError && items.length === 0 && (
          <div className="urus-table-empty">
            {kind === "menus" ? t("console.list.emptyMenus") : t("console.list.emptyKeyboards")}
          </div>
        )}
        {items.map((item) => (
          <Link key={item.id} href={`/${kind}/${encodeURIComponent(item.key)}`} className="urus-table-row">
            <span className="urus-mono-accent">{item.key}</span>
            <span>{item.description || "—"}</span>
            <span className="urus-muted">{kind === "keyboards" ? (item as KeyboardResponse).type : "—"}</span>
            <span className="urus-tabnum" style={{ textAlign: "right" }}>
              {item.version}
            </span>
          </Link>
        ))}
      </div>
      
    </main>
  );
}
