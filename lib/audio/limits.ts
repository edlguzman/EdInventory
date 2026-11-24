/**
 * Recording limits. A 16 kHz mono WAV is 32 KB per second and the AI routes take up to 1.5 MB,
 * so about 45 seconds would be the most.
 */
export const MAX_RECORDING_MS = 20_000;

/** "Add by voice": several items in one phrase. */
export const VOICE_ADD_RECORDING_MS = 40_000;
export const VOICE_ADD_TEXT_MAX = 1000;
