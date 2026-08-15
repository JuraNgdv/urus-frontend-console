import { UserDetailEditor } from "@/components/users/UserDetailEditor";

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserDetailEditor userId={decodeURIComponent(userId)} />;
}
