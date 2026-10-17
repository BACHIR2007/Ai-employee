import { redirect } from "next/navigation";

// The per-visitor orders list now lives inside the single demo page, so the old
// standalone dashboard page just sends the visitor there.
export default function DashboardPage() {
  redirect("/");
}
