# Okaro — Closed-Loop Cycle (State Diagram)

The complete flow from idea to measurable results, with the human gate as the only non-automatable step.

```
┌─────────────┐
│   IDEIA     │  Human inputs a raw concept (hardware, absence of hardware,
│             │  biomarker capture, AI-assisted health, robotics training data)
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│  SCAMPER PARALELO    │  N framings of the SAME idea run simultaneously.
│  (vários agentes)    │  Each lens (S/C/A/M/P/E/R) produces raw angles.
│                      │  Output: angle pools, all tagged confidence:"raw"
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  GATE HUMANO         │  ★ ONLY HUMAN STEP ★
│  (revisão de lentes) │  You accept/reject angles per lens.
│                      │  Rejected angles die here. Accepted → timestamped.
└──────┬───────────────┘
       │ accepted lenses only
       ▼
┌──────────────────────┐
│  EVIDÊNCIA CRUZADA    │  Parallel searches: OpenAlex + Crossref + PubMed
│  (multi-fonte)      │  + Semantic Scholar enrichment.
│                      │  Matrices merge: 3+ sources = high weight,
│                      │  1 source = flagged. DOI + URL + abstract required.
│                      │  No DOI = angle excluded from brief.
└──────┬───────────────┘
       │ verified evidence only
       ▼
┌──────────────────────┐
│  ARTEFATOS           │  AI writes what the evidence sustains:
│  (não só papers)     │  - brief técnico
│                      │  - spec de protótipo (CAD/3D print)
│                      │  - relatório de gap
│                      │  - paper formal (LaTeX via PaperOrchestra)
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  DADOS DE CAMPO      │  Real biomarker captures from users/hardware.
│  (biomarcadores)     │  These are the actual training signal for
│                      │  health AI + robotics imitation learning.
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  MÓTRICA DO CICLO    │  Two numbers per iteration:
│                      │  1. % of accepted angles that became verifiable evidence
│                      │  2. biomarkers captured per cycle
│                      │  Both must RISE across iterations or the loop is broken.
└──────┬───────────────┘
       │
       └──────────────► back to IDEIA (next round, richer input)
```

## Key design rules

1. **Human gate is not cosmetic.** No angle reaches evidence search without explicit acceptance. If you reject everything, the run dies — no paper is generated on unvalidated ideas.
2. **Evidence before text.** The article/artifact is written ONLY from DOI-verified sources. Model-invented citations are structurally impossible in this pipeline.
3. **Papers are outputs, not inputs.** Continuity of the business comes from the data layer (biomarkers + accepted angles + evidence matrices), not from the generated text.
4. **Parallel SCAMPER > single SCAMPER.** Multiple framings of the same idea increase the surface area of what the human can accept, without multiplying human effort (one review pass covers all lenses).
5. **Cross-source weighting.** An angle backed by OpenAlex + Crossref + PubMed outranks one backed by a single source. Disagreement between sources is preserved as signal, not averaged away.

## What exists in code today

| Stage | Module | Status |
|-------|--------|--------|
| SCAMPER prompts + session | `server/skills/scamper.ts` | ✅ functional |
| Template versioning | `server/skills/templates/scamper-v1.ts` | ✅ functional |
| OpenAlex connector | `server/connectors/openalex.ts` | ✅ functional (sandbox egress blocked) |
| Literature discovery agent | `server/agents/literatureDiscovery.ts` | ✅ functional |
| Outline bridge | `server/bridges/outlineBridge.ts` | ✅ functional |
| Orchestrator | `server/orchestrator.ts` | ✅ functional |
| E2E test script | `server/tests/e2e-flow.ts` | ✅ added |
| Parallel SCAMPER | — | ❌ not built |
| Crossref/PubMed adapters | — | ❌ not built (repos cloned in `academic-apis/`) |
| Cross-source matrix merge | — | ❌ not built |
| Artifact router (brief/spec/gap/paper) | — | ❌ not built |
| Field data ingestion | — | ❌ not built |
| Metrics dashboard | — | ❌ not built |

## Next build priority

1. **Parallel SCAMPER runner** — fork the session builder N times with varied framings, merge angle pools.
2. **Crossref + PubMed adapters** — same interface as OpenAlex, feed the cross-source merge.
3. **Matrix merge module** — weighted evidence, disagreement flags.
4. **Artifact router** — decide brief vs spec vs gap vs paper from evidence shape.
