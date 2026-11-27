/**
 * RF Adapter — environmental modality
 *
 * Interfaces with a low-power RF reader (RFID-style) that detects
 * presence and coarse motion in a room-scale field. Maps to the
 * presence_motion biomarker. Zero battery on the body side.
 */

import {
  BiomarkerSignalContract,
  NormalizedSample,
  CaptureSession,
  normalizeSample,
} from "../skills/biomarkerCapture";

export const RF_CONTRACT: BiomarkerSignalContract = {
  modality: "rf",
  biomarker: "presence_motion",
  unit: "count",
  sample_rate_hz: 5,
  range: { min: 0, max: 100 },
  source_type: "environmental",
 };

export interface RfReading {
  tag_id: string;
  rssi_dbm: number;
  motion_events: number;
  timestamp: string;
}

export function readRfSensor(
  session: CaptureSession,
  reading: RfReading,
  calibrationId?: string
): NormalizedSample {
  // Motion event count is the normalized value; RSSI kept in provenance
  return normalizeSample(
    session,
    RF_CONTRACT,
    reading.motion_events,
    `rf-reader-01`,
    calibrationId,
    `tag=${reading.tag_id},rssi=${reading.rssi_dbm}dBm@${reading.timestamp}`
  );
}
