import { MenuEditor } from "@/components/menu/MenuEditor";

export default async function MenuPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <MenuEditor menuKey={decodeURIComponent(key)} />;
}
