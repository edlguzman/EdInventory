import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminPlans } from "@/components/admin/plan-controls";
import { AdminLocked } from "@/components/admin/locked";
import { PageTitle } from "@/components/page-title";
import { listPlansWithStats } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("plans") };
}

/** Admin → Plans: names, limits, order, users per plan; add and delete. The owner only (404). */
export default async function AdminPlansPage() {
  const { locked } = await requireAdmin("owner");
  if (locked) return <AdminLocked />;
  const [t, plans] = await Promise.all([getTranslations("admin"), listPlansWithStats()]);
  return (
    <>
      <PageTitle>{t("plans")}</PageTitle>
      <AdminPlans plans={plans} />
    </>
  );
}
