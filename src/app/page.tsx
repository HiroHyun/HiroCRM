// Dashboard shell. An expired/absent session lands on /login;
// the dashboard body (table, filters, KPIs) lives in the Dashboard component below.

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Dashboard } from "../components/dashboard/dashboard";
import { authOptions } from "../server/auth";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <Dashboard />;
}
