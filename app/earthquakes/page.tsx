import type { Metadata } from "next";
import QuakeDashboard from "@/components/QuakeDashboard";

export const metadata: Metadata = {
  title: "Panahon — Philippine earthquakes",
  description:
    "Every earthquake PHIVOLCS recorded in the last 90 days, mapped and in plain language: magnitude, place, depth, and how long ago.",
};

export default function Page() {
  return <QuakeDashboard />;
}
