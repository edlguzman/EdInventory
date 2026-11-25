import { AccountBlocked } from "@/components/account-blocked";
import { CodeRequired } from "@/components/auth/code-required";
import { BottomNav } from "@/components/bottom-nav";
import { DataLangProvider } from "@/components/data-lang/context";
import { TranslationProgress } from "@/components/data-lang/translation-progress";
import { CurrentLocationBar } from "@/components/current-location-bar";
import { LocationDialogsProvider } from "@/components/locations/location-dialogs";
import { LocationsProvider } from "@/components/locations/locations-context";
import { Onboarding } from "@/components/onboarding";
import { OfflineBanner } from "@/components/offline-banner";
import { PlanLimitBanner, PlanProvider } from "@/components/plan-context";
import { getPendingCount } from "@/lib/admin/data";
import { getProfile, getUser, requireUser } from "@/lib/auth";
import { getLocations } from "@/lib/locations/data";
import { getMyPlan } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";
import { countMissing } from "@/lib/translate/records";

/** First run: not onboarded yet and nothing created (an existing user is never bothered). */
async function needsOnboarding(placeCount: number) {
  const user = await getUser();
  if (!user || user.user_metadata?.onboarded === true || placeCount > 0) return false;
  const supabase = await createClient();
  const { count } = await supabase.from("items").select("id", { count: "exact", head: true });
  return (count ?? 0) === 0;
}

/**
 * Pending and disabled accounts see only the "awaiting approval" / "disabled" screen.
 * Loads the user's places once for all (app) screens: the "I'm here" bar,
 * the tree and the picker share them. Server actions revalidate this layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const profile = await getProfile();
  // Pending or disabled: nothing else is rendered (and RLS returns no data anyway).
  if (!profile || profile.status !== "active") {
    return <AccountBlocked status={profile?.status === "disabled" ? "disabled" : "pending"} email={user.email ?? ""} />;
  }

  // "Sign-in with a code" is on and the code was not entered in this session.
  if (profile.needsCode) return <CodeRequired email={user.email ?? ""} />;

  const data = profile.dataLang;
  const [locations, pendingCount, missingEn, plan] = await Promise.all([
    getLocations(),
    profile.isAdmin ? getPendingCount() : 0,
    // English is kept filled in the background; catch up what a failed save left.
    data.mode !== "en" ? createClient().then((supabase) => countMissing(supabase, "en", data.lang)) : 0,
    getMyPlan(),
  ]);
  // Plan item limit reached: all AI is off, including the silent background translation.
  const silentMissingEn = plan?.atItemLimit ? 0 : missingEn;
  const planState = plan && {
    names: plan.names,
    itemLimit: plan.itemLimit,
    atItemLimit: plan.atItemLimit,
  };
  const onboarding = await needsOnboarding(locations.length);

  return (
    <PlanProvider plan={planState}>
      <DataLangProvider data={data} silentMissingEn={silentMissingEn}>
        <LocationsProvider locations={locations} userId={user.id}>
          <LocationDialogsProvider>
            <CurrentLocationBar />
            <OfflineBanner />
            <PlanLimitBanner />
            <TranslationProgress />
            <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
              {children}
            </main>
            <BottomNav settingsBadge={pendingCount} />
            <Onboarding initialOpen={onboarding} />
          </LocationDialogsProvider>
        </LocationsProvider>
      </DataLangProvider>
    </PlanProvider>
  );
}
