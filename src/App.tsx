import React, { useEffect, useState } from "react";

interface UploadedFigure {
  name: string;
  caption: string;
  previewUrl: string;
  dataBase64?: string;
  examplePath?: string;
}

interface RunState {
  id: string;
  running: boolean;
  currentStep: number;
  failed: boolean;
  errorMessage: string;
  selectedModel: string;
  selectedTemplate: string;
  enablePlotting: boolean;
  idea: string;
  log: string;
  figures: Array<{ name: string; caption: string; url: string }>;
  logs: {
    "Outline Generation": string;
    "Literature Review": string;
    "Figure Plotting": string;
    "Section Writing": string;
    "Content Refinement": string;
  };
}

interface RunArtifacts {
  outline: any | null;
  citationMap: Record<string, any> | null;
  generatedFigures: Array<{
    figure_id?: string;
    title?: string;
    caption?: string;
    imageUrl?: string | null;
  }>;
  hasFinalPdf: boolean;
  hasLatexDir: boolean;
  hasInitialPdf: boolean;
  v0Snapshots: string[];
  contentVersions: Record<string, any>;
  formatV0Snapshots: string[];
  formatVersions: Record<string, any>;
}

const MODELS = ["gemini-3.1-pro-preview", "gemini-3-flash-preview"];
const TEMPLATES = ["cvpr2025", "iclr2025"];
const STEPS = [
  "Outline Generation",
  "Literature Review",
  "Section Writing",
  "Content Refinement",
] as const;

const TABS = [
  "📊 Progress Timeline",
  "📥 Inputs",
  "🖼️ Figures Gallery",
  "📝 Outline",
  "🔗 Citation Map",
  "📈 Refinement Progress",
] as const;

export default function App() {
  // Sidebar configuration state
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [enablePlotting, setEnablePlotting] = useState<"Yes" | "No">("Yes");
  const [emailInput, setEmailInput] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [emailWarning, setEmailWarning] = useState("");
  const [exampleStatus, setExampleStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Input Materials state
  const [ideaInputType, setIdeaInputType] = useState<"Text" | "Upload">("Text");
  const [logInputType, setLogInputType] = useState<"Text" | "Upload">("Text");
  const [ideaText, setIdeaText] = useState("");
  const [logText, setLogText] = useState("");

  // Figure uploader state
  const [pendingFigureFile, setPendingFigureFile] = useState<File | null>(null);
  const [pendingFigureCaption, setPendingFigureCaption] = useState("");
  const [figureAddedNotice, setFigureAddedNotice] = useState("");
  const [figures, setFigures] = useState<UploadedFigure[]>([]);

  // Pipeline & Phase 2 state
  const [locked, setLocked] = useState(false);
  const [hideInputs, setHideInputs] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeTab, setActiveTab] = useState<number>(0);

  const [runId, setRunId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);

  // Poll backend every 2s while running (mirrors Streamlit rerun polling)
  useEffect(() => {
    if (!runId) return;
    let active = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setRunState(data.state);
        setArtifacts(data.artifacts);
        if (!data.state.running) {
          setLocked(false);
        }
      } catch {
        // Keep polling on transient network error
      }
    };

    void fetchStatus();
    const interval = setInterval(() => {
      if (runState && !runState.running) return;
      void fetchStatus();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [runId, runState?.running]);

  const handleLoadCvprExample = async () => {
    setExampleStatus(null);
    try {
      const res = await fetch("/api/examples/cvpr");
      if (!res.ok) throw new Error("Failed to load example");
      const data = await res.json();
      setIdeaText(data.idea ?? "");
      setLogText(data.log ?? "");
      setIdeaInputType("Text");
      setLogInputType("Text");
      if (data.figureUrl) {
        setFigures([
          {
            name: data.figureName || "cvpr_example_figure.png",
            caption: data.figureCaption || "",
            previewUrl: data.figureUrl,
            examplePath: data.figureName || "cvpr_example_figure.png",
          },
        ]);
      }
      setExampleStatus({
        type: "success",
        text: "🎉 Example loaded successfully!",
      });
    } catch (err) {
      setExampleStatus({
        type: "error",
        text: `Error loading example: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  };

  const handleConfirmEmail = () => {
    if (emailInput.trim()) {
      setEmailConfirmed(true);
      setEmailWarning("");
    } else {
      setEmailConfirmed(false);
      setEmailWarning("⚠️ Please enter an email address first.");
    }
  };

  const handleTextFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setter(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleAddFigure = () => {
    if (!pendingFigureFile || !pendingFigureCaption.trim()) return;
    const file = pendingFigureFile;
    const caption = pendingFigureCaption.trim();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setFigures((prev) => [
        ...prev,
        {
          name: file.name,
          caption,
          previewUrl: dataUrl,
          dataBase64: dataUrl,
        },
      ]);
      setPendingFigureFile(null);
      setPendingFigureCaption("");
      setFigureAddedNotice(
        "🎉 Figure added successfully! Check the Gallery tab."
      );
      setTimeout(() => setFigureAddedNotice(""), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleBeginWriting = async () => {
    if (!ideaText.trim() || !logText.trim() || !emailInput.trim()) {
      setErrorMessage(
        "❌ Please fill in all required fields (Idea, Log, and Email)."
      );
      setLocked(false);
      setHideInputs(false);
      return;
    }

    setErrorMessage("");
    setLocked(true);
    setHideInputs(true);
    setActiveTab(0);

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: ideaText,
          log: logText,
          email: emailInput.trim(),
          selectedModel,
          selectedTemplate,
          enablePlotting: enablePlotting === "Yes",
          figures: figures.map((f) => ({
            name: f.name,
            caption: f.caption,
            dataBase64: f.dataBase64,
            examplePath: f.examplePath,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to start pipeline.");
        setLocked(false);
        setHideInputs(false);
        return;
      }
      setRunId(data.id);
      setRunState(data.state);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start pipeline."
      );
      setLocked(false);
      setHideInputs(false);
    }
  };

  const renderPdfAndSnapshots = (
    versionKey: string,
    snapshots: string[],
    hasPdf: boolean,
    label = "📥 Download PDF"
  ) => {
    if (!runId || !hasPdf) return null;
    return (
      <div style={{ marginTop: "0.75rem" }}>
        <a
          className="btn btn-emerald"
          style={{ width: "auto", marginBottom: "0.75rem" }}
          href={`/api/runs/${runId}/download/pdf?version=${encodeURIComponent(
            versionKey
          )}`}
        >
          {label}
        </a>
        {snapshots.length > 0 && (
          <div>
            <strong>Snapshots:</strong>
            <div className="three-col-grid">
              {snapshots.slice(0, 3).map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`Snapshot ${idx + 1}`}
                  className="preview-img"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const isRunning = Boolean(runState?.running);
  const currentStep = runState?.currentStep ?? 0;
  const hasAnyLogs = Boolean(
    runState && Object.values(runState.logs).some((v) => v.length > 0)
  );

  const contentWorklogEntries = Object.entries(
    artifacts?.contentVersions ?? {}
  );
  const finalSelectedVersion =
    contentWorklogEntries.find(([, entry]) =>
      ["ACCEPTED_SCORE_INCREASE", "ACCEPTED_NEUTRAL_IMPROVEMENT"].includes(
        entry?.outcome
      )
    )?.[0]?.toUpperCase() ?? "V0 (Initial)";

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h2 className="sidebar-title">🎻 Configuration</h2>

        <button
          type="button"
          className="btn btn-emerald"
          disabled={locked}
          onClick={handleLoadCvprExample}
        >
          Load CVPR Example
        </button>

        {exampleStatus && (
          <div
            className={`alert ${
              exampleStatus.type === "success" ? "alert-success" : "alert-error"
            }`}
            style={{ marginBottom: 0 }}
          >
            {exampleStatus.text}
          </div>
        )}

        <div className="field-group">
          <label className="field-label" htmlFor="select-model">
            Select Model
          </label>
          <select
            id="select-model"
            className="select-input"
            value={selectedModel}
            disabled={locked}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="select-template">
            Select Template
          </label>
          <select
            id="select-template"
            className="select-input"
            value={selectedTemplate}
            disabled={locked}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="enable-plotting">
            Enable Figure Generation
          </label>
          <select
            id="enable-plotting"
            className="select-input"
            value={enablePlotting}
            disabled={locked}
            onChange={(e) => setEnablePlotting(e.target.value as "Yes" | "No")}
          >
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="email-input">
            Your Email (for notification){" "}
            <span className="required-star">*</span>
          </label>
          <input
            id="email-input"
            type="email"
            className="text-input"
            value={emailInput}
            disabled={locked}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="researcher@institute.edu"
          />
        </div>

        <button
          type="button"
          className="btn btn-emerald"
          disabled={locked}
          onClick={handleConfirmEmail}
        >
          Confirm Email
        </button>

        {emailWarning && (
          <div className="alert alert-warning" style={{ marginBottom: 0 }}>
            {emailWarning}
          </div>
        )}
        {emailConfirmed && (
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            📧 Email confirmed successfully!
          </div>
        )}

        {hideInputs && !isRunning && (
          <button
            type="button"
            className="btn btn-emerald"
            onClick={() => {
              setHideInputs(false);
              setLocked(false);
            }}
          >
            ← Back to Inputs
          </button>
        )}
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <h1 className="main-title">🎻 Paper Orchestra Demo</h1>
        <p className="main-subtitle">
          Demonstrating the automated paper writing process as detailed in{" "}
          <a
            href="https://arxiv.org/abs/2604.05018"
            target="_blank"
            rel="noreferrer"
          >
            PaperOrchestra
          </a>
          .
        </p>

        {!hideInputs ? (
          <div>
            {errorMessage && (
              <div className="alert alert-error">{errorMessage}</div>
            )}

            <h2>📝 Input Materials</h2>
            <div className="two-col-grid">
              <div className="card">
                <h3 style={{ marginTop: 0 }}>💡 Research Idea</h3>
                <div className="radio-row">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="ideaInputType"
                      checked={ideaInputType === "Text"}
                      disabled={locked}
                      onChange={() => setIdeaInputType("Text")}
                    />
                    Text
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="ideaInputType"
                      checked={ideaInputType === "Upload"}
                      disabled={locked}
                      onChange={() => setIdeaInputType("Upload")}
                    />
                    Upload
                  </label>
                </div>

                {ideaInputType === "Text" ? (
                  <div className="field-group">
                    <label className="field-label" htmlFor="idea-textarea">
                      Enter your idea here{" "}
                      <span className="required-star">*</span>
                    </label>
                    <textarea
                      id="idea-textarea"
                      className="text-area"
                      value={ideaText}
                      disabled={locked}
                      onChange={(e) => setIdeaText(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="field-group">
                    <label className="field-label" htmlFor="idea-file">
                      Upload Idea file (.md/.txt){" "}
                      <span className="required-star">*</span>
                    </label>
                    <input
                      id="idea-file"
                      type="file"
                      accept=".md,.txt"
                      className="file-drop"
                      disabled={locked}
                      onChange={(e) => handleTextFileUpload(e, setIdeaText)}
                    />
                  </div>
                )}
              </div>

              <div className="card">
                <h3 style={{ marginTop: 0 }}>📊 Experimental Log</h3>
                <div className="radio-row">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="logInputType"
                      checked={logInputType === "Text"}
                      disabled={locked}
                      onChange={() => setLogInputType("Text")}
                    />
                    Text
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="logInputType"
                      checked={logInputType === "Upload"}
                      disabled={locked}
                      onChange={() => setLogInputType("Upload")}
                    />
                    Upload
                  </label>
                </div>

                {logInputType === "Text" ? (
                  <div className="field-group">
                    <label className="field-label" htmlFor="log-textarea">
                      Enter experimental log here{" "}
                      <span className="required-star">*</span>
                    </label>
                    <textarea
                      id="log-textarea"
                      className="text-area"
                      value={logText}
                      disabled={locked}
                      onChange={(e) => setLogText(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="field-group">
                    <label className="field-label" htmlFor="log-file">
                      Upload Exp Log file (.md/.txt){" "}
                      <span className="required-star">*</span>
                    </label>
                    <input
                      id="log-file"
                      type="file"
                      accept=".md,.txt"
                      className="file-drop"
                      disabled={locked}
                      onChange={(e) => handleTextFileUpload(e, setLogText)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>🖼️ Upload Figures</h3>
              <div className="figure-upload-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="figure-upload">
                    Upload figure
                  </label>
                  <input
                    id="figure-upload"
                    type="file"
                    accept=".png,.jpg,.jpeg,.pdf"
                    className="file-drop"
                    disabled={locked}
                    onChange={(e) =>
                      setPendingFigureFile(e.target.files?.[0] ?? null)
                    }
                  />
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="figure-caption">
                    Figure Caption
                  </label>
                  <input
                    id="figure-caption"
                    type="text"
                    className="text-input"
                    value={pendingFigureCaption}
                    disabled={locked}
                    onChange={(e) => setPendingFigureCaption(e.target.value)}
                  />
                  <div>
                    <button
                      type="button"
                      className="btn btn-indigo"
                      disabled={
                        locked ||
                        !pendingFigureFile ||
                        !pendingFigureCaption.trim()
                      }
                      onClick={handleAddFigure}
                    >
                      Add Figure
                    </button>
                  </div>
                </div>
              </div>

              {figureAddedNotice && (
                <div className="alert alert-success">{figureAddedNotice}</div>
              )}

              {figures.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <strong>Queued Figures ({figures.length}):</strong>
                  <ul style={{ marginBottom: 0 }}>
                    {figures.map((fig, idx) => (
                      <li key={idx}>
                        <strong>{fig.name}</strong> — {fig.caption}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={locked}
              onClick={handleBeginWriting}
            >
              🚀 Begin Writing
            </button>
          </div>
        ) : (
          <div>
            {isRunning ? (
              <div className="alert alert-info">
                🚀 Paper generation in progress! This may take several minutes.
                Please do not close this tab.
              </div>
            ) : currentStep === STEPS.length ? (
              <div className="alert alert-success">
                🎉 Paper writing complete!
              </div>
            ) : runState?.failed || (currentStep < STEPS.length && hasAnyLogs) ? (
              <div className="alert alert-error">
                ❌ Paper writing failed or stopped unexpectedly. Check logs.
              </div>
            ) : null}

            <div className="tabs-bar">
              {TABS.map((tab, idx) => (
                <button
                  key={tab}
                  type="button"
                  className={`tab-btn ${activeTab === idx ? "active" : ""}`}
                  onClick={() => setActiveTab(idx)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* 1. Timeline Tab */}
            {activeTab === 0 && (
              <div>
                <h3>Writing Progress</h3>
                {STEPS.map((step, index) => {
                  const isFinished = index < currentStep;
                  const isActive = index === currentStep && isRunning;
                  const stateClass = isFinished
                    ? "finished"
                    : isActive
                    ? "active"
                    : "";
                  const icon = isFinished ? "✓" : isActive ? "⏳" : "○";

                  if (step === "Literature Review" && enablePlotting === "Yes") {
                    return (
                      <React.Fragment key={step}>
                        <div className={`timeline-item ${stateClass}`}>
                          <div className="timeline-icon">{icon}</div>
                          <p style={{ fontWeight: "bold", margin: "0 0 0.25rem" }}>
                            Literature Review
                          </p>
                          <details
                            className="expander"
                            open={index === currentStep}
                          >
                            <summary>View Literature Logs</summary>
                            <div className="expander-body">
                              <pre className="code-block">
                                {runState?.logs["Literature Review"] ||
                                  "No logs yet."}
                              </pre>
                            </div>
                          </details>
                        </div>

                        <div className={`timeline-item ${stateClass}`}>
                          <div className="timeline-icon">{icon}</div>
                          <p style={{ fontWeight: "bold", margin: "0 0 0.25rem" }}>
                            Figure Generation
                          </p>
                          <details
                            className="expander"
                            open={index === currentStep}
                          >
                            <summary>View Figure Logs</summary>
                            <div className="expander-body">
                              <pre className="code-block">
                                {runState?.logs["Figure Plotting"] ||
                                  "No logs yet."}
                              </pre>
                            </div>
                          </details>
                        </div>
                      </React.Fragment>
                    );
                  }

                  return (
                    <div key={step} className={`timeline-item ${stateClass}`}>
                      <div className="timeline-icon">{icon}</div>
                      <p style={{ fontWeight: "bold", margin: "0 0 0.25rem" }}>
                        {step}
                      </p>
                      <details className="expander" open={index === currentStep}>
                        <summary>View Logs for {step}</summary>
                        <div className="expander-body">
                          <pre className="code-block">
                            {runState?.logs[step] || "No logs yet."}
                          </pre>
                        </div>
                      </details>
                    </div>
                  );
                })}

                {!isRunning &&
                  runId &&
                  (artifacts?.hasFinalPdf || artifacts?.hasLatexDir) && (
                    <div className="card">
                      <h3 style={{ marginTop: 0 }}>📥 Download Results</h3>
                      <div className="two-col-grid" style={{ marginBottom: 0 }}>
                        {artifacts?.hasFinalPdf && (
                          <a
                            className="btn btn-emerald"
                            href={`/api/runs/${runId}/download/pdf?version=final`}
                          >
                            📄 Download Final PDF
                          </a>
                        )}
                        {artifacts?.hasLatexDir && (
                          <a
                            className="btn btn-emerald"
                            href={`/api/runs/${runId}/download/latex`}
                          >
                            📦 Download LaTeX Source
                          </a>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* 2. Inputs Tab */}
            {activeTab === 1 && (
              <div>
                <h2>📥 User Inputs</h2>
                <h3 className="idea-header">Idea</h3>
                <div className="pre-text">
                  {runState?.idea ||
                    ideaText ||
                    "(No input provided or process not started)"}
                </div>
                <h3 className="log-header">Experimental Log</h3>
                <div className="pre-text">
                  {runState?.log ||
                    logText ||
                    "(No input provided or process not started)"}
                </div>
              </div>
            )}

            {/* 3. Gallery Tab */}
            {activeTab === 2 && (
              <div>
                <h3>Uploaded Figures</h3>
                {figures.length === 0 ? (
                  <p style={{ color: "#64748b", fontStyle: "italic" }}>
                    No figures uploaded yet. Add figures from the input
                    materials section.
                  </p>
                ) : (
                  figures.map((fig, index) => (
                    <div key={index} className="card">
                      <div className="gallery-item">
                        <strong>{fig.name}</strong>
                      </div>
                      <img
                        src={fig.previewUrl}
                        alt={fig.name}
                        className="preview-img"
                        style={{ marginBottom: "0.75rem" }}
                      />
                      <div className="field-group">
                        <label className="field-label">Edit Caption</label>
                        <input
                          type="text"
                          className="text-input"
                          value={fig.caption}
                          disabled={locked}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFigures((prev) =>
                              prev.map((item, idx) =>
                                idx === index ? { ...item, caption: val } : item
                              )
                            );
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger-outline"
                        style={{ marginTop: "0.75rem" }}
                        disabled={locked}
                        onClick={() =>
                          setFigures((prev) =>
                            prev.filter((_, idx) => idx !== index)
                          )
                        }
                      >
                        🗑️ Delete Image
                      </button>
                    </div>
                  ))
                )}

                <h3>Generated Figures</h3>
                {artifacts?.generatedFigures &&
                artifacts.generatedFigures.length > 0 ? (
                  artifacts.generatedFigures.map((fig, idx) => (
                    <div key={idx} className="card">
                      <p style={{ fontWeight: "bold", marginTop: 0 }}>
                        {fig.title || "Figure"}
                      </p>
                      {fig.imageUrl && (
                        <img
                          src={fig.imageUrl}
                          alt={fig.title || "Generated figure"}
                          className="preview-img"
                        />
                      )}
                      {fig.caption && (
                        <p style={{ color: "#475569", marginBottom: 0 }}>
                          {fig.caption}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ color: "#64748b" }}>
                    No generated figures available yet.
                  </p>
                )}
              </div>
            )}

            {/* 4. Outline Tab */}
            {activeTab === 3 && (
              <div>
                <h3>Paper Outline</h3>
                {artifacts?.outline ? (
                  <pre className="json-block">
                    {JSON.stringify(artifacts.outline, null, 2)}
                  </pre>
                ) : (
                  <div className="alert alert-info">
                    No outline generated yet.
                  </div>
                )}
              </div>
            )}

            {/* 5. Citation Map Tab */}
            {activeTab === 4 && (
              <div>
                <h3>Citation Map</h3>
                {artifacts?.citationMap ? (
                  <pre className="json-block">
                    {JSON.stringify(artifacts.citationMap, null, 2)}
                  </pre>
                ) : (
                  <div className="alert alert-info">
                    No citation map generated yet.
                  </div>
                )}
              </div>
            )}

            {/* 6. Refinement Tab */}
            {activeTab === 5 && (
              <div>
                <h2>Content & Format Refinement Progress</h2>
                {!runId ? (
                  <div className="alert alert-info">
                    No refinement progress available yet.
                  </div>
                ) : (
                  <div>
                    <h3>Content Refinement</h3>
                    <div className="two-col-grid">
                      {artifacts?.hasInitialPdf && (
                        <details className="expander" open>
                          <summary>Content Refinement V0 (Initial)</summary>
                          <div className="expander-body">
                            <p style={{ marginTop: 0 }}>
                              Initial draft compiled.
                            </p>
                            {renderPdfAndSnapshots(
                              "initial",
                              artifacts.v0Snapshots ?? [],
                              artifacts.hasInitialPdf
                            )}
                          </div>
                        </details>
                      )}

                      {contentWorklogEntries.map(([versionKey, entry]) => (
                        <details key={versionKey} className="expander" open>
                          <summary>
                            Content Refinement {versionKey.toUpperCase()}
                          </summary>
                          <div className="expander-body">
                            <p style={{ marginTop: 0 }}>
                              <strong>Outcome:</strong> {entry.outcome}
                            </p>
                            <p>
                              <strong>Total Gain:</strong> {entry.total_gain} |{" "}
                              <strong>Total Drop:</strong> {entry.total_drop}
                            </p>
                            {entry.scores_before && entry.scores_after && (
                              <div>
                                <strong>Scores:</strong>
                                <ul>
                                  {[
                                    "Overall",
                                    "Originality",
                                    "Quality",
                                    "Clarity",
                                  ].map((axis) => (
                                    <li key={axis}>
                                      {axis}: {entry.scores_before[axis] ?? 0}{" "}
                                      -&gt; {entry.scores_after[axis] ?? 0}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {renderPdfAndSnapshots(
                              versionKey,
                              entry.snapshots ?? [],
                              Boolean(entry.hasPdf)
                            )}
                          </div>
                        </details>
                      ))}
                    </div>

                    {Object.keys(artifacts?.formatVersions ?? {}).length > 0 && (
                      <div>
                        <div className="alert alert-info">
                          💡 <code>Content Refinement {finalSelectedVersion}</code>{" "}
                          is selected as the output of content refinement, now
                          proceeding to formatting refinement...
                        </div>
                        <h3>Format Refinement</h3>
                        <div className="two-col-grid">
                          <details className="expander">
                            <summary>Format Refinement V0 (Initial)</summary>
                            <div className="expander-body">
                              <p style={{ marginTop: 0 }}>
                                Input from content refinement phase.
                              </p>
                              {renderPdfAndSnapshots(
                                "fmt_v0",
                                artifacts?.formatV0Snapshots ?? [],
                                true
                              )}
                            </div>
                          </details>

                          {Object.entries(artifacts?.formatVersions ?? {}).map(
                            ([versionKey, entry]) => (
                              <details key={versionKey} className="expander">
                                <summary>
                                  Format Refinement {versionKey.toUpperCase()}
                                </summary>
                                <div className="expander-body">
                                  <strong>Formatting Feedback:</strong>
                                  <pre className="json-block">
                                    {JSON.stringify(
                                      entry.formatting_feedback ?? {},
                                      null,
                                      2
                                    )}
                                  </pre>
                                  {renderPdfAndSnapshots(
                                    `fmt_${versionKey}`,
                                    entry.snapshots ?? [],
                                    Boolean(entry.hasPdf)
                                  )}
                                </div>
                              </details>
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
