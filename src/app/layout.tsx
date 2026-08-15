import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/lib/query/QueryProvider";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemedRoot } from "@/components/ThemedRoot";

export const metadata: Metadata = {
  title: "Tenant Console",
  description: "BFF tenant admin console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <ThemedRoot>{children}</ThemedRoot>
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
