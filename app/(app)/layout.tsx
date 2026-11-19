import { AccountBlocked } from "@/components/account-blocked";
import { BottomNav } from "@/components/bottom-nav";
import { DataLangProvider } from "@/components/data-lang/context";
import { TranslationProgress } from "@/components/data-lang/translation-progress";
import { CurrentLocationBar } from "@/components/current-location-bar";
import { LocationDialogsProvider } from "@/components/locations/location-dialogs";
import { LocationsProvider } from "@/components/locations/locations-context";
import { Onboarding } from "@/components/onboarding";
import { OfflineBanner } from "@/components/offline-banner";
import { getPendingCount } from "@/lib/admin/data";
import { getProfile, getUser, requireUser } from "@/lib/auth";
import { getLocations } from "@/lib/locations/data";
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

  const mode = profile.dataLang;
  const [locations, pendingCount, silentMissingEn] = await Promise.all([
    getLocations(),
    profile.isAdmin ? getPendingCount() : 0,
    // Ru mode keeps English filled in the background; catch up what a failed save left.
    mode === "ru" ? createClient().then((supabase) => countMissing(supabase, ["en"])) : 0,
  ]);
  const onboarding = await needsOnboarding(locations.length);

  return (
    <DataLangProvider mode={mode} silentMissingEn={silentMissingEn}>
      <LocationsProvider locations={locations}>
        <LocationDialogsProvider>
          <CurrentLocationBar />
          <OfflineBanner />
          <TranslationProgress />
          <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
          <BottomNav settingsBadge={pendingCount} />
          <Onboarding initialOpen={onboarding} />
        </LocationDialogsProvider>
      </LocationsProvider>
    </DataLangProvider>
  );
}
