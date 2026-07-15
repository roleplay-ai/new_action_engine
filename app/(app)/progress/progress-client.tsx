"use client";

import { useEngine } from "@/lib/store";
import Analytics from "@/components/Analytics";

export default function ProgressClient() {
  const { cohort } = useEngine();
  return <Analytics cohortId={cohort?.id ?? null} />;
}
