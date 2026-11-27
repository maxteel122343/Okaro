/**
 * Biomarker Capture Skill — Okaro Framework
 *
 * Contract for physiological signal ingestion. Defines the minimum schema
 * every sensor source must satisfy, normalizes streams from any modality
 * (conductive ink, camera, microphone, RF) into a single versioned format,
 * and routes data through quarantine when out of range.
 *
 * This is the bridge between the physical world (hardware/no-hardware)
 * and the Okaro data layer — the skill that closes the loop from
 * idea → SCAMPER → evidence → field data → training.
 */

export type SignalModality = "electrical" | "optical" | "acoustic" | "rf" | "inertial";

export interface BiomarkerSignalContract {
  modality: SignalModality;
  biomarker: string;           // e.g. "heart_rate", "respiration", "skin_conductance"
  unit: string;                // e.g. "bpm", "Hz", "µS"
  sample_rate_hz: number;      // minimum required sampling rate
  range: { min: number; max: number };
  source_type: "contact" | "non_contact" | "environmental";
}

export interface NormalizedSample {
  biomarker: string;
  value: number;
  unit: string;
  timestamp: string;           // ISO-8601
  source_id: string;           // which sensor/adapter produced it
  modality: SignalModality;
  is_quarantined: boolean;
  quarantine_reason?: string;
  provenance: {
    contract_version: string;
    calibration_id?: string;
    raw_ref?: string;          // pointer to raw stream chunk
  };
}

export interface CaptureSession {
  id: string;
  started_at: string;
  subject_id: string;          // anonymized subject reference
  contracts: BiomarkerSignalContract[];
  samples: NormalizedSample[];
  status: "active" | "paused" | "closed";
  metrics: {
    total_samples: number;
    quarantined: number;
    modalities_active: SignalModality[];
  };
}

const CONTRACT_VERSION = "biomarker-capture-v1";

/**
 * Default contracts for the FitVerso biomarker set.
 * Each maps to a physical capture method the user described:
 * conductive ink (electrical), camera (optical), mic (acoustic), RF (rf).
 */
export const DEFAULT_CONTRACTS: BiomarkerSignalContract[] = [
  {
    modality: "electrical",
    biomarker: "skin_conductance",
    unit: "µS",
    sample_rate_hz: 10,
    range: { min: 0.1, max: 50 },
    source_type: "contact",
  },
  {
    modality: "optical",
    biomarker: "heart_rate",
    unit: "bpm",
    sample_rate_hz: 30,
    range: { min: 30, max: 220 },
    source_type: "non_contact",
  },
  {
    modality: "acoustic",
    biomarker: "respiration_rate",
    unit: "Hz",
    sample_rate_hz: 20,
    range: { min: 0.1, max: 1.0 },
    source_type: "non_contact",
  },
  {
    modality: "rf",
    biomarker: "presence_motion",
    unit: "count",
    sample_rate_hz: 5,
    range: { min: 0, max: 100 },
    source_type: "environmental",
  },
  {
    modality: "inertial",
    biomarker: "movement_pattern",
    unit: "g",
    sample_rate_hz: 50,
    range: { min: -16, max: 16 },
    source_type: "contact",
  },
];

export function createCaptureSession(
  subjectId: string,
  contracts: BiomarkerSignalContract[] = DEFAULT_CONTRACTS
): CaptureSession {
  return {
    id: `cap-${Date.now()}`,
    started_at: new Date().toISOString(),
    subject_id: subjectId,
    contracts,
    samples: [],
    status: "active",
    metrics: {
      total_samples: 0,
      quarantined: 0,
      modalities_active: [...new Set(contracts.map((c) => c.modality))],
    },
  };
}

/**
 * Normalize a raw sample against its contract.
 * Out-of-range values are quarantined but still recorded —
 * never silently dropped, always provenance-tagged.
 */
export function normalizeSample(
  session: CaptureSession,
  contract: BiomarkerSignalContract,
  rawValue: number,
  sourceId: string,
  calibrationId?: string,
  rawRef?: string
): NormalizedSample {
  const outOfRange = rawValue < contract.range.min || rawValue > contract.range.max;
  const sample: NormalizedSample = {
    biomarker: contract.biomarker,
    value: rawValue,
    unit: contract.unit,
    timestamp: new Date().toISOString(),
    source_id: sourceId,
    modality: contract.modality,
    is_quarantined: outOfRange,
    quarantine_reason: outOfRange
      ? `value ${rawValue} outside range ${contract.range.min}–${contract.range.max} ${contract.unit}`
      : undefined,
    provenance: {
      contract_version: CONTRACT_VERSION,
      calibration_id: calibrationId,
      raw_ref: rawRef,
    },
  };
  session.samples.push(sample);
  session.metrics.total_samples++;
  if (outOfRange) session.metrics.quarantined++;
  return sample;
}

export function closeSession(session: CaptureSession): CaptureSession {
  session.status = "closed";
  return session;
}

/**
 * Export session as versioned dataset chunk — the asset that feeds
 * the AI health model and robotics training pipeline.
 */
export function exportDatasetChunk(session: CaptureSession): object {
  return {
    session_id: session.id,
    subject_id: session.subject_id,
    exported_at: new Date().toISOString(),
    contract_version: CONTRACT_VERSION,
    biomarker_set: session.contracts.map((c) => c.biomarker),
    sample_count: session.samples.length,
    quarantine_rate: session.metrics.quarantined / Math.max(session.metrics.total_samples, 1),
    samples: session.samples,
  };
}
