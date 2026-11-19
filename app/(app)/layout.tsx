import { BottomNav } from "@/components/bottom-nav";
import { CurrentLocationBar } from "@/components/current-location-bar";
import { LocationDialogsProvider } from "@/components/locations/location-dialogs";
import { LocationsProvider } from "@/components/locations/locations-context";
import { Onboarding } from "@/components/onboarding";
import { OfflineBanner } from "@/components/offline-banner";
import { getUser } from "@/lib/auth";
import { getLocations } from "@/lib/locations/data";
import { createClient } from "@/lib/supabase/server";

/** First run: not onboarded yet and nothing created (an existing user is never bothered). */
async function needsOnboarding(placeCount: number) {
  const user = await getUser();
  if (!user || user.user_metadata?.onboarded === true || placeCount > 0) return false;
  const supabase = await createClient();
  const { count } = await supabase.from("items").select("id", { count: "exact", head: true });
  return (count ?? 0) === 0;
}

/**
 * Loads the user's places once for all (app) screens: the "I'm here" bar,
 * the tree and the picker share them. Server actions revalidate this layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const locations = await getLocations();
  const onboarding = await needsOnboarding(locations.length);

  return (
    <LocationsProvider locations={locations}>
      <LocationDialogsProvider>
        <CurrentLocationBar />
        <OfflineBanner />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomNav />
        <Onboarding initialOpen={onboarding} />
      </LocationDialogsProvider>
    </LocationsProvider>
  );
}
