"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MAX_RECORDING_MS } from "./limits";
import { canRecord, MicError, startRecording, type Recording } from "./recorder";

const subscribeNever = () => () => {};

/** Tap-to-start / tap-to-stop recording that hands over a WAV (auto-stop after maxMs, 20 s by default). */
export function useVoiceRecorder({
  onAudio,
  onError,
  maxMs = MAX_RECORDING_MS,
}: {
  onAudio: (wav: Blob) => void;
  onError: (key: string) => void;
  maxMs?: number;
}) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [converting, setConverting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const stopRef = useRef<() => void>(() => {});

  // Feature detection only on the client: the server render (and hydration) says "no mic".
  const available = useSyncExternalStore(
    subscribeNever,
    () => canRecord(),
    () => false,
  );

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  // Release the microphone if the component goes away mid-recording.
  useEffect(() => () => recording?.cancel(), [recording]);

  async function stop() {
    const r = recording;
    if (!r) return;
    setRecording(null);
    setConverting(true);
    try {
      onAudio(await r.stop());
    } catch (error) {
      onError(error instanceof MicError ? error.key : "recordingFailed");
    } finally {
      setConverting(false);
    }
  }
  // The auto-stop timer calls the latest stop() (it closes over the current recording).
  useEffect(() => {
    stopRef.current = () => void stop();
  });

  async function start() {
    try {
      setSeconds(0);
      setRecording(await startRecording(() => stopRef.current(), maxMs));
    } catch (error) {
      onError(error instanceof MicError ? error.key : "micUnsupported");
    }
  }

  return {
    available,
    recording: recording !== null,
    converting,
    seconds,
    toggle: () => (recording ? void stop() : void start()),
  };
}
