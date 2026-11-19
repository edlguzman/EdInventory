import { BottomNav } from "@/components/bottom-nav";
import { CurrentLocationBar } from "@/components/current-location-bar";
import { LocationDialogsProvider } from "@/components/locations/location-dialogs";
import { LocationsProvider } from "@/components/locations/locations-context";
import { getLocations } from "@/lib/locations/data";

/**
 * Loads the user's places once for all (app) screens: the "I'm here" bar,
 * the tree and the picker share them. Server actions revalidate this layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const locations = await getLocations();

  return (
    <LocationsProvider locations={locations}>
      <LocationDialogsProvider>
        <CurrentLocationBar />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <BottomNav />
      </LocationDialogsProvider>
    </LocationsProvider>
  );
}
