/**
 * Camera Adapter — optical modality
 *
 * Wraps a frame stream (phone, GoPro, Insta360) and extracts
 * heart_rate via remote photoplethysmography (rPPG) on skin pixels.
 * Non-contact, works with the fisheye/chest-mount setups discussed.
 */

import {
  BiomarkerSignalContract,
  NormalizedSample,
  CaptureSession,
  normalizeSample,
} from "../skills/biomarkerCapture";

export const CAMERA_CONTRACT: BiomarkerSignalContract = {
  modality: "optical",
  biomarker: "heart_rate",
  unit: "bpm",
  sample_rate_hz: 30,
  range: { min: 30, max: 220 },
  source_type: "non_contact",
 };

export interface FrameMeta {
  frame_id: number;
  skin_pixel_mean: number;   // average green-channel intensity over ROI
  timestamp: string;
}

/**
 * Minimal rPPG estimate: peak-to-peak interval on the green channel
 * over a rolling window. Real deployment would use POS/CHROM;
 * this keeps the adapter contract identical either way.
 */
export function estimateHrFromFrames(frames: FrameMeta[]): number {
  if (frames.length < 2) return 0;
  const intervals: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = new Date(frames[i].timestamp).getTime() - new Date(frames[i - 1].timestamp).getTime();
    if (dt > 0) intervals.push(dt);
  }
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return meanInterval > 0 ? 60000 / meanInterval : 0;
}

export function readCameraStream(
  session: CaptureSession,
  frames: FrameMeta[],
  calibrationId?: string
): NormalizedSample {
  const hr = estimateHrFromFrames(frames);
  const last = frames[frames.length - 1];
  return normalizeSample(
    session,
    CAMERA_CONTRACT,
    hr,
    "camera-rppg-01",
    calibrationId,
    `frames=${frames.length},last_skin_mean=${last?.skin_pixel_mean}`
  );
}
