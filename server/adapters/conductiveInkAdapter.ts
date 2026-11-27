/**
 * Conductive Ink Adapter — electrical modality
 *
 * Simulates / interfaces with a 3D-printed conductive-ink sensor
 * (e.g., on a bed surface or chair). Reads raw resistance values
 * and maps them to the skin_conductance biomarker contract.
 *
 * In production this talks to the actual ADC/microcontroller.
 * Here it exposes the same interface so the capture skill stays
 * modality-agnostic.
 */

import {
  BiomarkerSignalContract,
  NormalizedSample,
  CaptureSession,
  normalizeSample,
} from "../skills/biomarkerCapture";

export const INK_CONTRACT: BiomarkerSignalContract = {
  modality: "electrical",
  biomarker: "skin_conductance",
  unit: "µS",
  sample_rate_hz: 10,
  range: { min: 0.1, max: 50 },
  source_type: "contact",
};

export interface InkReading {
  resistance_ohm: number;
  timestamp: string;
}

/**
 * Convert raw resistance (ohms) from the ink trace to conductance (µS).
 * G = 1/R * 1e6
 */
export function resistanceToConductance(ohms: number): number {
  if (ohms <= 0) return 0;
  return 1e6 / ohms;
}

export function readInkSensor(
  session: CaptureSession,
  reading: InkReading,
  calibrationId?: string
): NormalizedSample {
  const conductance = resistanceToConductance(reading.resistance_ohm);
  return normalizeSample(
    session,
    INK_CONTRACT,
    conductance,
    "conductive-ink-01",
    calibrationId,
    `raw_resistance=${reading.resistance_ohm}ohm@${reading.timestamp}`
  );
}
