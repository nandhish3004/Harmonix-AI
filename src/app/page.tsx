import { redirect } from "next/navigation";

export default function RootPage() {
  // Present the film directly; the original app routes remain available separately.
  redirect("/film");
}

