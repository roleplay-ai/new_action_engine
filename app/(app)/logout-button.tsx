"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  /** Icon-only control for dark sidebars; text button elsewhere. */
  variant?: "icon" | "text";
};

export function LogoutButton({ variant = "text" }: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleLogout}
        className="participant-logout-btn"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut size={15} strokeWidth={2.2} />
      </button>
    );
  }

  return (
    <button type="button" onClick={handleLogout} className="btn btn--decline btn--sm">
      Log out
    </button>
  );
}
