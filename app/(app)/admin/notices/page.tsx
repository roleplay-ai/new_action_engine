import { redirect } from "next/navigation";

// Old link — this page now lives in the Control panel.
export default function NoticesRedirect() {
  redirect("/admin/control-panel/announcements");
}
