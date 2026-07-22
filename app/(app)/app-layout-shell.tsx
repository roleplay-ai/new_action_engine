"use client";

import { usePathname } from "next/navigation";
import { EngineProvider } from "@/lib/store";
import Layout from "@/components/Layout";
import { PageLoadingProvider } from "@/components/PageLoadingProvider";

export default function AppLayoutShell({
  children,
  hasCompany,
  role,
}: {
  children: React.ReactNode;
  displayName: string;
  hasCompany: boolean;
  role: string;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const isSuperadminRoute = pathname?.startsWith("/superadmin");
  const isUserRoute = !isAdminRoute && !isSuperadminRoute;

  // Admin and superadmin have their own layouts with headers - don't show the generic one
  if (!isUserRoute) {
    return <>{children}</>;
  }

  return (
    <EngineProvider>
      <PageLoadingProvider>
        <div className="min-h-screen flex flex-col">
          {!hasCompany && (
            <div className="bg-amber-100 border-b-4 border-black px-4 py-3 text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-amber-900">
                Not assigned to a company yet. You’ll see full content once an admin assigns you.
              </p>
            </div>
          )}
          <Layout role={role}>{children}</Layout>
        </div>
      </PageLoadingProvider>
    </EngineProvider>
  );
}
