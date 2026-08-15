import { KeyboardEditor } from "@/components/keyboard/KeyboardEditor";

export default async function KeyboardPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <KeyboardEditor kbKey={decodeURIComponent(key)} />;
}
