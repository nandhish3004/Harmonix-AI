import { redirect } from "next/navigation";

export default function RootPage() {
  // Onboarding sequence starts at Screen 00 (Language Selection)
  redirect("/language");
}

