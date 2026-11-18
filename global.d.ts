import type { AppLocale } from "@/i18n/config";
import type messages from "@/messages/ru.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
  }
}
