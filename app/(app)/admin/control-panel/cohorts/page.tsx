import { redirect } from "next/navigation";

// Old link — this page now lives in the Control panel.
export default function CohortManagementRedirect() {
  redirect("/admin/control-panel");
}
