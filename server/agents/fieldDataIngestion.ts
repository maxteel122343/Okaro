/**
 * Okaro — Field data ingestion
 *
 * Accepts biomarker capture sessions (from hardware or absence-of-hardware setups)
 * and structures them as versioned, provenance-tagged training assets.
 * This is the data layer that makes the business loop real.
 */

export type BiomarkerSample = {
  session_id: string;
  timestamp: string;
  user_id_hash: string; // hashed, never raw PII
  modality: "electrical" | "acoustic" | "optical" | "frequency" | "motion" | "ambient";
  channel: string;      // e.g. "ecg_lead1", "ppg_wrist", "breath_audio"
  value: number;
  unit: string;
  quality_flag: "clean" | "noisy" | "artifact";
  device: string;       // e.g. "ink_electrode_v2", "passive_rfid_tag"
  framing_id: string;   // which SCAMPER framing produced this capture setup
  lens: string;
  accepted_angle_id: string;
};

export type FieldSession = {
  id: string;
  started_at: string;
  ended_at: string | null;
  device_profile: string;
  samples: BiomarkerSample[];
  total_samples: number;
  clean_ratio: number;
  provenance: {
    scamper_session_id: string;
    accepted_lenses: string[];
    evidence_matrix_id: string;
  };
  status: "open" | "closed" | "quarantined";
};

export type IngestionResult = {
  session: FieldSession;
  training_ready: boolean;
  quarantine_reason: string | null;
  stats: {
    by_modality: Record<string, number>;
    by_channel: Record<string, number>;
    duration_seconds: number | null;
  };
};

/**
 * Ingest a raw capture session. Quarantines if quality is too low
 * or provenance is missing. Otherwise structures it as a training asset.
 */
export function ingestFieldSession(
  raw: Partial<FieldSession> & { samples: BiomarkerSample[] },
  provenance: FieldSession["provenance"]
): IngestionResult {
  const clean = raw.samples.filter((s) => s.quality_flag === "clean");
  const cleanRatio = raw.samples.length ? clean.length / raw.samples.length : 0;

  const byModality: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  for (const s of raw.samples) {
    byModality[s.modality] = (byModality[s.modality] ?? 0) + 1;
    byChannel[s.channel] = (byChannel[s.channel] ?? 0) + 1;
  }

  let status: FieldSession["status"] = "closed";
  let quarantineReason: string | null = null;
  if (!provenance.scamper_session_id || !provenance.accepted_lenses?.length) {
    status = "quarantined";
    quarantineReason = "Missing SCAMPER provenance — sample cannot be linked to an accepted angle.";
  } else if (cleanRatio < 0.5) {
    status = "quarantined";
    quarantineReason = `Clean ratio ${cleanRatio.toFixed(2)} below 0.5 threshold.`;
  } else if (raw.samples.length < 10) {
    status = "quarantined";
    quarantineReason = "Fewer than 10 samples — statistically meaningless.";
  }

  const session: FieldSession = {
    id: raw.id ?? `fsession-${Date.now()}`,
    started_at: raw.started_at ?? new Date().toISOString(),
    ended_at: raw.ended_at ?? null,
    device_profile: raw.device_profile ?? "unknown",
    samples: status === "quarantined" ? [] : raw.samples,
    total_samples: raw.samples.length,
    clean_ratio: cleanRatio,
    provenance,
    status,
  };

  const duration = session.started_at && session.ended_at
    ? (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
    : null;

  return {
    session,
    training_ready: status === "closed",
    quarantine_reason: quarantineReason,
    stats: { by_modality: byModality, by_channel: byChannel, duration_seconds: duration },
  };
}
