"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Marks onboarding as done in the user's Auth metadata, so it does not show again
 * on any device. The user can edit their own metadata; that only re-shows the tour.
 */
export async function completeOnboarding() {
  const supabase = await createClient();
  await supabase.auth.updateUser({ data: { onboarded: true } });
}
