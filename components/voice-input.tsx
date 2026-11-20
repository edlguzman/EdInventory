"use client";

import { useState } from "react";
import { ArrowUp, LoaderCircle, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_RECORDING_MS } from "@/lib/audio/recorder";
import { useVoiceRecorder } from "@/lib/audio/use-voice-recorder";
import { useOffline } from "./offline-banner";
import { useAiOff, usePlanLimitText } from "./plan-context";

export function MicButton({
  recorder,
  busy,
}: {
  recorder: ReturnType<typeof useVoiceRecorder>;
  busy: boolean;
}) {
  const t = useTranslations("voice");
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  if (!recorder.available) return null;
  return (
    <button
      type="button"
      onClick={recorder.toggle}
      disabled={busy || recorder.converting || ((offline || aiOff) && !recorder.recording)}
      title={limitText}
      aria-pressed={recorder.recording}
      aria-label={recorder.recording ? t("stop") : t("speak")}
      className={`flex size-12 shrink-0 items-center justify-center rounded-xl disabled:opacity-50 ${
        recorder.recording ? "bg-red-600 text-white" : "bg-accent text-accent-foreground"
      }`}
    >
      {busy || recorder.converting ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
      ) : recorder.recording ? (
        <Square className="size-5" fill="currentColor" aria-hidden />
      ) : (
        <Mic className="size-5" aria-hidden />
      )}
    </button>
  );
}

export function RecordingStatus({ seconds }: { seconds: number }) {
  const t = useTranslations("voice");
  return (
    <p
      role="status"
      className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-600" aria-hidden />
      <span className="truncate">{t("listening", { seconds, max: MAX_RECORDING_MS / 1000 })}</span>
    </p>
  );
}

/**
 * A phrase by voice or by text. The text field is always there (CLAUDE.md);
 * the mic: tap to start, tap to stop (auto-stop after 20 s). The parent sends the
 * phrase to an AI route and shows the result.
 */
export function VoiceInput({
  placeholder,
  label,
  busy,
  onSubmit,
  onError,
}: {
  placeholder: string;
  label: string;
  busy: boolean;
  onSubmit: (input: { audio?: Blob; text?: string }) => void;
  onError: (key: string) => void;
}) {
  const t = useTranslations("voice");
  const [text, setText] = useState("");
  const recorder = useVoiceRecorder({ onAudio: (audio) => onSubmit({ audio }), onError });
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const disabled = busy || recorder.converting || offline || aiOff;

  // Not a <form>: it is used inside the item form, and forms cannot be nested.
  const submitText = () => {
    const value = text.trim();
    if (value && !disabled) onSubmit({ text: value });
  };

  return (
    <div className="flex items-center gap-2">
      {recorder.recording ? (
        <RecordingStatus seconds={recorder.seconds} />
      ) : (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={limitText ?? placeholder}
          aria-label={label}
          maxLength={500}
          enterKeyHint="send"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // do not submit the surrounding item form
              submitText();
            }
          }}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent disabled:opacity-60"
        />
      )}
      {!recorder.recording && text.trim() ? (
        <button
          type="button"
          onClick={submitText}
          disabled={disabled}
          aria-label={t("send")}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
        </button>
      ) : (
        <MicButton recorder={recorder} busy={busy} />
      )}
    </div>
  );
}
