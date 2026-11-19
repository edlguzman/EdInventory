"use client";

/**
 * Voice recording for Gemini.
 * MediaRecorder writes audio/webm (Chrome, Android) or audio/mp4 (Safari, iPhone).
 * WebM is not on Gemini's list of audio formats, so every recording is decoded with
 * Web Audio and re-encoded as 16 kHz mono 16-bit WAV — accepted by Gemini everywhere,
 * ~32 KB per second (a 20-second phrase is ~640 KB).
 */

export const MAX_RECORDING_MS = 20_000;
const TARGET_RATE = 16_000;

export class MicError extends Error {
  constructor(public readonly key: "micDenied" | "micUnsupported" | "recordingTooShort" | "recordingFailed") {
    super(key);
  }
}

export function canRecord() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

function pickMimeType() {
  for (const type of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return ""; // browser default
}

export type Recording = {
  /** Stops and returns the WAV. */
  stop: () => Promise<Blob>;
  /** Stops and throws the audio away. */
  cancel: () => void;
};

export async function startRecording(onAutoStop: () => void): Promise<Recording> {
  if (!canRecord()) throw new MicError("micUnsupported");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    throw new MicError(name === "NotAllowedError" || name === "SecurityError" ? "micDenied" : "micUnsupported");
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const startedAt = Date.now();
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(250);
  const timer = setTimeout(onAutoStop, MAX_RECORDING_MS);

  const finish = () => {
    clearTimeout(timer);
    if (recorder.state !== "inactive") recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    cancel: finish,
    stop: async () => {
      finish();
      await stopped;
      if (Date.now() - startedAt < 600) throw new MicError("recordingTooShort");
      const recorded = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      try {
        return await toWav(recorded);
      } catch {
        throw new MicError("recordingFailed");
      }
    },
  };
}

async function toWav(blob: Blob): Promise<Blob> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
  // Mix down to mono and resample to 16 kHz with an offline context.
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
