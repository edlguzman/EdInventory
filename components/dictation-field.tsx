"use client";

import { useState } from "react";
import { Languages, LoaderCircle, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { transcribe, translateName } from "@/lib/ai/client";
import { useVoiceRecorder } from "@/lib/audio/use-voice-recorder";
import { slotLang, type Slot } from "@/lib/data-lang";
import { useErrorText } from "@/lib/use-error-text";
import { useDataLang } from "./data-lang/context";
import { useOffline } from "./offline-banner";
import { useAiOff, usePlanLimitText } from "./plan-context";
import { Button } from "./ui/buttons";
import { RecordingStatus } from "./voice-input";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "suggest"; text: string }
  | { kind: "offerTranslation"; text: string }
  | { kind: "translating" };

/** Current text + space (description: a full stop first if the text ends mid-sentence) + dictated text. */
function appendText(current: string, added: string, kind: "name" | "description") {
  const base = current.trimEnd();
  if (!base) return added;
  const end = kind === "description" && /[\p{L}\p{N}]$/u.test(base) ? "." : "";
  return `${base}${end} ${added}`;
}

/**
 * A text field with dictation: the label row gets a mic button. The recording goes to
 * /api/ai/transcribe (text in the field's language, 1 AI unit) and comes back as a suggestion
 * under the field: "Insert" (empty field) or "Replace" / "Append", and "Cancel". Nothing
 * changes without a tap. With English next to it (`other` given), after a change while the other
 * field already has text, "Update translation" is offered (/api/ai/translate, 1 AI unit).
 */
export function DictationField({
  label,
  htmlFor,
  slot,
  kind,
  max,
  getValue,
  setValue,
  other,
  children,
}: {
  label: string;
  htmlFor: string;
  /** The field's slot: the user's language or English. */
  slot: Slot;
  kind: "name" | "description";
  max: number;
  getValue: () => string;
  setValue: (value: string) => void;
  other?: { slot: Slot; get: () => string; set: (value: string) => void };
  children: React.ReactNode;
}) {
  const t = useTranslations("dictation");
  const { lang: myLang } = useDataLang();
  const lang = slotLang(slot, myLang);
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [error, setError] = useState<string>();

  const recorder = useVoiceRecorder({
    onAudio: async (audio) => {
      setState({ kind: "busy" });
      const r = await transcribe(audio, { slot, kind });
      if ("error" in r) {
        setError(r.error);
        return setState({ kind: "idle" });
      }
      if (!r.text) {
        setError("dictationEmpty");
        return setState({ kind: "idle" });
      }
      setState({ kind: "suggest", text: r.text });
    },
    onError: (key) => {
      setError(key);
      setState({ kind: "idle" });
    },
  });

  function apply(next: string) {
    const value = next.slice(0, max);
    setValue(value);
    if (other && other.get().trim()) setState({ kind: "offerTranslation", text: value });
    else setState({ kind: "idle" });
  }

  async function updateTranslation(text: string) {
    if (!other) return;
    setState({ kind: "translating" });
    const r = await translateName({ text, from: slot, kind });
    if ("error" in r) {
      setError(r.error);
      return setState({ kind: "offerTranslation", text });
    }
    other.set(r.text.slice(0, max));
    setState({ kind: "idle" });
  }

  const busy = state.kind === "busy" || recorder.converting;
  const current = getValue().trim();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {recorder.available && (
          <button
            type="button"
            onClick={() => {
              setError(undefined);
              if (!recorder.recording) setState({ kind: "idle" });
              recorder.toggle();
            }}
            disabled={busy || state.kind === "translating" || ((offline || aiOff) && !recorder.recording)}
            title={limitText}
            aria-pressed={recorder.recording}
            aria-label={recorder.recording ? t("stop") : t("dictate", { field: label })}
            className={`-my-1 flex size-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40 ${
              recorder.recording ? "bg-red-600 text-white" : "text-accent"
            }`}
          >
            {busy ? (
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
            ) : recorder.recording ? (
              <Square className="size-4" fill="currentColor" aria-hidden />
            ) : (
              <Mic className="size-5" aria-hidden />
            )}
          </button>
        )}
      </div>

      {children}

      {recorder.recording && <RecordingStatus seconds={recorder.seconds} />}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorText(error)}
        </p>
      )}

      {state.kind === "suggest" && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3">
          <span className="text-xs font-medium text-muted">{t("heard")}</span>
          <p lang={lang} className="break-words whitespace-pre-wrap">
            {state.text}
          </p>
          <div className="flex flex-wrap gap-2">
            {current ? (
              <>
                <Button variant="primary" onClick={() => apply(state.text)}>
                  {t("replace")}
                </Button>
                <Button onClick={() => apply(appendText(getValue(), state.text, kind))}>{t("append")}</Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => apply(state.text)}>
                {t("insert")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setState({ kind: "idle" })}>
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      )}

      {(state.kind === "offerTranslation" || state.kind === "translating") && other && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => state.kind === "offerTranslation" && void updateTranslation(state.text)}
            pending={state.kind === "translating"}
            disabled={offline || aiOff}
          >
            {state.kind !== "translating" && <Languages className="size-5" aria-hidden />}
            {t("updateTranslation", { lang: slotLang(other.slot, myLang).toUpperCase() })}
          </Button>
          {state.kind === "offerTranslation" && (
            <Button variant="ghost" onClick={() => setState({ kind: "idle" })}>
              {t("skip")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
