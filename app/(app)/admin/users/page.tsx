import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminUserList } from "@/components/admin/user-list";
import { UserFiltersBar, UsersPager } from "@/components/admin/user-filters";
import { PageTitle } from "@/components/page-title";
import { listPlans, listUsersPage } from "@/lib/admin/data";
import { parseUserFilters, userFiltersHref, USERS_PAGE_SIZE } from "@/lib/admin/filters";
import { requireAdmin } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("usersSection") };
}

/** Admin → Users: search, filters, sorting and pages of 50, all in the address. Admin only (404). */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { user, isOwner } = await requireAdmin();
  const filters = parseUserFilters(await searchParams);
  const [t, { users, total }, plans] = await Promise.all([getTranslations("admin"), listUsersPage(filters), listPlans()]);
  // Past the last page (e.g. the last user on it was deleted): the first page.
  if (users.length === 0 && filters.page > 1) redirect(userFiltersHref(filters, { page: 1 }));

  return (
    <>
      <PageTitle>{t("usersSection")}</PageTitle>
      <div className="flex flex-col gap-4">
        <UserFiltersBar filters={filters} plans={plans} />
        <AdminUserList users={users} selfId={user.id} isOwner={isOwner} plans={plans} filtered={!!(filters.q || filters.status || filters.plan)} />
        <UsersPager filters={filters} total={total} pageSize={USERS_PAGE_SIZE} />
      </div>
    </>
  );
}
