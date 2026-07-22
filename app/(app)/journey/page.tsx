import PrepareClient from "../prepare/prepare-client";
import { getJourneyData } from "@/app/actions/journey";

export default async function JourneyPage() {
  const initialData = await getJourneyData();
  return <PrepareClient initialData={initialData} />;
}
