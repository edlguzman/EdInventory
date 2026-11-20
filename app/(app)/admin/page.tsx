import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminPlans } from "@/components/admin/plan-controls";
import { AdminUserList } from "@/components/admin/user-list";
import { PageTitle } from "@/components/page-title";
import { listPlans, listUsers } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

/**
 * Admin page: accounts and numbers only. Anyone but the admin gets 404 (requireAdmin);
 * the database functions behind it check the role again on every call.
 * ?show=all lists everyone; by default the pending accounts come first if there are any.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requireAdmin();
  const [t, users, plans, { show }] = await Promise.all([getTranslations("admin"), listUsers(), listPlans(), searchParams]);
  const pendingCount = users.filter((u) => u.status === "pending").length;
  const filter = show === "all" || (show !== "pending" && pendingCount === 0) ? "all" : "pending";

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <AdminUserList
        users={filter === "all" ? users : users.filter((u) => u.status === "pending")}
        filter={filter}
        pendingCount={pendingCount}
        totalCount={users.length}
        selfId={user.id}
        plans={plans}
      />
      <div className="mt-8">
        <AdminPlans plans={plans} />
      </div>
    </>
  );
}
