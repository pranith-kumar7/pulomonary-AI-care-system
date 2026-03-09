import { useState, useRef, useCallback } from "react";

const DISEASES = [
  "COVID-19", "Normal", "Viral Pneumonia", "Lung Opacity"
];

const COLORS = {
  bg: "#060d1a",
  panel: "#0a1628",
  border: "#0e2040",
  accent: "#00c6ff",
  accent2: "#0072ff",
  success: "#00e5a0",
  warning: "#ffb830",
  danger: "#ff4d6d",
  text: "#e8f4ff",
  muted: "#4a6fa5",
};

const analyzeWithAPI = async (imageFile) => {
  const formData = new FormData();
  formData.append("file", imageFile);
  const startTime = Date.now();
  const response = await fetch("http://localhost:5000/predict", {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Server error");
  }
  const data = await response.json();
  data.processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
  return data;
};

const GlowLine = () => (
  <div style={{
    height: "1px", background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
    margin: "0", opacity: 0.6,
  }} />
);

const Spinner = () => (
  <div style={{
    width: 48, height: 48, border: `3px solid ${COLORS.border}`,
    borderTop: `3px solid ${COLORS.accent}`, borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  }} />
);

const Badge = ({ severity }) => {
  const color = severity === "High" ? COLORS.danger : severity === "Moderate" ? COLORS.warning : COLORS.success;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
      background: color + "22", color, border: `1px solid ${color}55`,
      letterSpacing: 1, textTransform: "uppercase",
    }}>{severity}</span>
  );
};

const ConfidenceBar = ({ value }) => {
  const pct = Math.round(parseFloat(value) * 100);
  const color = pct > 80 ? COLORS.danger : pct > 65 ? COLORS.warning : COLORS.success;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg, ${COLORS.accent2}, ${color})`,
          transition: "width 1s ease",
        }} />
      </div>
      <span style={{ fontSize: 12, color: COLORS.muted, minWidth: 36 }}>{pct}%</span>
    </div>
  );
};

const GradCAMOverlay = ({ imageUrl, gradcamB64 }) => {
  if (gradcamB64) {
    return (
      <div style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
        <img src={`data:image/png;base64,${gradcamB64}`} alt="Grad-CAM"
          style={{ width: "100%", display: "block", borderRadius: 6 }} />
        <div style={{
          position: "absolute", bottom: 8, right: 8,
          background: "rgba(6,13,26,0.85)", padding: "4px 10px", borderRadius: 4,
          fontSize: 11, color: COLORS.accent, border: `1px solid ${COLORS.border}`,
          backdropFilter: "blur(8px)",
        }}>Grad-CAM Active</div>
      </div>
    );
  }
  return (
    <div style={{ position: "relative", borderRadius: 8, overflow: "hidden" }}>
      <img src={imageUrl} alt="X-Ray" style={{ width: "100%", display: "block", filter: "grayscale(100%) brightness(0.9)" }} />
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(ellipse 40% 30% at 52% 45%, rgba(255,80,80,0.55) 0%, rgba(255,160,0,0.3) 40%, transparent 70%)`,
        mixBlendMode: "screen",
      }} />
      <div style={{
        position: "absolute", bottom: 8, right: 8,
        background: "rgba(6,13,26,0.85)", padding: "4px 10px", borderRadius: 4,
        fontSize: 11, color: COLORS.accent, border: `1px solid ${COLORS.border}`,
        backdropFilter: "blur(8px)",
      }}>Grad-CAM (Simulated)</div>
    </div>
  );
};

export default function App() {
  const [page, setPage] = useState("landing");
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [showGradcam, setShowGradcam] = useState(false);
  const [patientInfo, setPatientInfo] = useState({ name: "", age: "", id: "" });
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setResults(null);
    setShowGradcam(false);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!imageUrl || !imageFile) return;
    setAnalyzing(true); setResults(null);
    try {
      const r = await analyzeWithAPI(imageFile);
      setResults(r);
    } catch (err) {
      alert("Error: " + err.message + "\n\nMake sure your Flask backend is running on http://localhost:5000");
    }
    setAnalyzing(false);
  };

  const reset = () => {
    setImageFile(null); setImageUrl(null);
    setResults(null); setShowGradcam(false);
    setPatientInfo({ name: "", age: "", id: "" });
  };

  const inputStyle = {
    background: COLORS.panel, border: `1px solid ${COLORS.border}`,
    color: COLORS.text, padding: "10px 14px", borderRadius: 6, fontSize: 13,
    outline: "none", width: "100%", boxSizing: "border-box",
    fontFamily: "'DM Mono', monospace",
  };

  // ---- LANDING PAGE ----
  if (page === "landing") return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, color: COLORS.text,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 0%, #0a2040 0%, transparent 70%)`,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(400%)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a1628}
        ::-webkit-scrollbar-thumb{background:#0e2040;border-radius:2px}
      `}</style>

      {/* Nav */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "20px 48px", borderBottom: `1px solid ${COLORS.border}`,
        background: "rgba(6,13,26,0.8)", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🫁</div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
            PulmoAI
          </span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 12, color: COLORS.muted }}>
          {["Features", "Model", "About"].map(l => (
            <span key={l} style={{ cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={e => e.target.style.color = COLORS.accent}
              onMouseLeave={e => e.target.style.color = COLORS.muted}>{l}</span>
          ))}
        </div>
        <button onClick={() => setPage("app")} style={{
          background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
          border: "none", color: "#fff", padding: "10px 24px", borderRadius: 6,
          cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit",
          letterSpacing: 0.5,
        }}>Launch App →</button>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "100px 24px 60px", animation: "fadeUp 0.8s ease" }}>
        <div style={{
          display: "inline-block", padding: "4px 16px", borderRadius: 20, marginBottom: 24,
          background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}40`,
          fontSize: 11, color: COLORS.accent, letterSpacing: 2, textTransform: "uppercase",
        }}>DenseNet121 · Grad-CAM · Explainable AI</div>

        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "clamp(40px, 6vw, 80px)",
          fontWeight: 800, lineHeight: 1.05, margin: "0 0 24px",
          background: `linear-gradient(135deg, ${COLORS.text} 0%, ${COLORS.accent} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          AI-Powered<br />Pulmonary Diagnosis
        </h1>

        <p style={{
          fontSize: 16, color: COLORS.muted, maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.7,
        }}>
          Detect 14 lung diseases from chest X-rays with deep learning. Visual Grad-CAM explanations 
          ensure clinical transparency — bridging AI and real-world healthcare.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => setPage("app")} style={{
            background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
            border: "none", color: "#fff", padding: "14px 36px", borderRadius: 8,
            cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 500,
          }}>Analyze X-Ray</button>
          <button style={{
            background: "transparent", border: `1px solid ${COLORS.border}`,
            color: COLORS.muted, padding: "14px 36px", borderRadius: 8,
            cursor: "pointer", fontSize: 14, fontFamily: "inherit",
          }}>View Model Docs</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap",
        padding: "0 24px 80px", maxWidth: 700, margin: "0 auto",
      }}>
        {[
          { val: "4", label: "Disease Classes" },
          { val: "95.8%", label: "AUC Score" },
          { val: "DenseNet121", label: "Architecture" },
          { val: "Grad-CAM", label: "Explainability" },
        ].map(({ val, label }) => (
          <div key={label} style={{
            flex: "1 1 150px", textAlign: "center", padding: "28px 20px",
            background: COLORS.panel, border: `1px solid ${COLORS.border}`,
            margin: 1,
          }}>
            <div style={{
              fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800,
              color: COLORS.accent, marginBottom: 4,
            }}>{val}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 100px" }}>
        <GlowLine />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 1, marginTop: 1 }}>
          {[
            { icon: "🦠", title: "COVID-19 Detection", desc: "Identifies COVID-19 patterns in chest X-rays with high sensitivity using fine-tuned DenseNet121." },
            { icon: "🗺️", title: "Grad-CAM Visualization", desc: "Heatmap overlays highlight regions influencing the model's decision, ensuring full clinical transparency." },
            { icon: "⚡", title: "Real-Time Inference", desc: "Fine-tuned DenseNet121 delivers results in under 2 seconds, optimized for clinical workflow speed." },
            { icon: "🏥", title: "4-Class Classification", desc: "Distinguishes between COVID-19, Viral Pneumonia, Lung Opacity, and Normal — all from a single X-ray." },
            { icon: "📊", title: "Confidence Scoring", desc: "Softmax probability scores per class help clinicians assess AI certainty and prioritize follow-up." },
            { icon: "🔒", title: "Secure & Private", desc: "Patient data and images never leave your system. Fully on-premise deployable with HIPAA-aligned design." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{
              padding: "32px 28px", background: COLORS.panel, border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.7 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ---- APP PAGE ----
  return (
    <div style={{
      minHeight: "100vh", background: COLORS.bg, color: COLORS.text,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scan { 0%{top:-4px} 100%{top:calc(100% + 4px)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a1628}
        ::-webkit-scrollbar-thumb{background:#0e2040;border-radius:2px}
        input::placeholder { color: #4a6fa5; }
      `}</style>

      {/* Top Bar */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 32px", borderBottom: `1px solid ${COLORS.border}`,
        background: "rgba(6,13,26,0.95)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setPage("landing")} style={{
            background: "none", border: "none", color: COLORS.muted,
            cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: 0,
          }}>← Back</button>
          <div style={{ width: 1, height: 16, background: COLORS.border }} />
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16 }}>🫁 PulmoAI</span>
          <div style={{
            padding: "2px 10px", borderRadius: 20, fontSize: 10,
            background: `${COLORS.success}20`, color: COLORS.success,
            border: `1px solid ${COLORS.success}40`, letterSpacing: 1,
          }}>● SYSTEM ONLINE</div>
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted }}>DenseNet121-COVID-v1.0 · COVID-19 Radiography DB</div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left Panel - Upload & Patient */}
        <div style={{
          width: 340, borderRight: `1px solid ${COLORS.border}`,
          background: COLORS.panel, display: "flex", flexDirection: "column",
          overflowY: "auto", flexShrink: 0,
        }}>
          {/* Patient Info */}
          <div style={{ padding: "20px 20px 0" }}>
            <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Patient Information
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={inputStyle} placeholder="Patient Name" value={patientInfo.name}
                onChange={e => setPatientInfo(p => ({ ...p, name: e.target.value }))} />
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="Age" value={patientInfo.age}
                  onChange={e => setPatientInfo(p => ({ ...p, age: e.target.value }))} />
                <input style={{ ...inputStyle, flex: 1.5 }} placeholder="Patient ID" value={patientInfo.id}
                  onChange={e => setPatientInfo(p => ({ ...p, id: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ margin: "20px", height: 1, background: COLORS.border }} />

          {/* Upload Zone */}
          <div style={{ padding: "0 20px" }}>
            <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Chest X-Ray Upload
            </div>
            <div
              onClick={() => !imageUrl && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? COLORS.accent : imageUrl ? COLORS.success + "60" : COLORS.border}`,
                borderRadius: 8, padding: imageUrl ? 0 : "40px 20px",
                textAlign: "center", cursor: imageUrl ? "default" : "pointer",
                transition: "all 0.2s", background: dragOver ? `${COLORS.accent}08` : "transparent",
                position: "relative", overflow: "hidden",
              }}
            >
              {imageUrl ? (
                <div style={{ position: "relative" }}>
                  {showGradcam ? <GradCAMOverlay imageUrl={imageUrl} gradcamB64={results?.gradcam} /> : (
                    <img src={imageUrl} alt="X-Ray" style={{
                      width: "100%", display: "block", borderRadius: 6,
                      filter: "grayscale(100%) brightness(0.9)",
                    }} />
                  )}
                  {analyzing && (
                    <div style={{
                      position: "absolute", inset: 0, background: "rgba(6,13,26,0.7)",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", gap: 12, borderRadius: 6,
                    }}>
                      <div style={{
                        position: "absolute", left: 0, right: 0, height: 2,
                        background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
                        animation: "scan 1.5s linear infinite",
                      }} />
                      <Spinner />
                      <span style={{ fontSize: 11, color: COLORS.accent }}>Analyzing...</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🩻</div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>Drop X-Ray image here</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>PNG, JPG, DICOM · Max 10MB</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {/* Controls */}
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {imageUrl && !analyzing && (
              <button onClick={analyze} style={{
                background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
                border: "none", color: "#fff", padding: "12px", borderRadius: 6,
                cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500,
              }}>
                Run AI Analysis
              </button>
            )}
            {results && (
              <button onClick={() => setShowGradcam(g => !g)} style={{
                background: showGradcam ? `${COLORS.warning}20` : "transparent",
                border: `1px solid ${showGradcam ? COLORS.warning : COLORS.border}`,
                color: showGradcam ? COLORS.warning : COLORS.muted,
                padding: "10px", borderRadius: 6, cursor: "pointer",
                fontSize: 12, fontFamily: "inherit",
              }}>
                {showGradcam ? "◉ Grad-CAM On" : "○ Show Grad-CAM"}
              </button>
            )}
            {imageUrl && (
              <button onClick={reset} style={{
                background: "transparent", border: `1px solid ${COLORS.border}`,
                color: COLORS.muted, padding: "10px", borderRadius: 6,
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}>Clear & Reset</button>
            )}
          </div>

          {/* Model Info */}
          <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              Model Info
            </div>
            {[
              ["Architecture", "DenseNet121"],
              ["Training", "COVID-19 Radiography DB"],
              ["Total Images", "21,165"],
              ["Classes", "4"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: COLORS.muted }}>{k}</span>
                <span style={{ color: COLORS.accent }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* No image state */}
          {!imageUrl && !analyzing && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 16,
              color: COLORS.muted, animation: "fadeUp 0.6s ease",
            }}>
              <div style={{ fontSize: 64, opacity: 0.3 }}>🫁</div>
              <div style={{ fontSize: 16, fontFamily: "'Syne', sans-serif", fontWeight: 700, opacity: 0.5 }}>
                No X-Ray Loaded
              </div>
              <div style={{ fontSize: 12, opacity: 0.4, textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
                Upload a chest X-ray image in the left panel to begin multi-disease AI analysis with Grad-CAM explanation.
              </div>
            </div>
          )}

          {/* Analyzing state */}
          {analyzing && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 20,
            }}>
              <Spinner />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, marginBottom: 6, fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>
                  Analyzing X-Ray
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>
                  Running DenseNet121 inference + Grad-CAM generation...
                </div>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                {["Feature Extraction", "Classification", "Grad-CAM"].map((step, i) => (
                  <div key={step} style={{ textAlign: "center", fontSize: 10, color: COLORS.muted }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", margin: "0 auto 6px",
                      border: `2px solid ${COLORS.border}`,
                      background: i === 0 ? `${COLORS.accent}30` : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, animation: i === 0 ? "pulse 1.2s ease infinite" : "none",
                    }}>
                      {i === 0 ? "⚡" : "○"}
                    </div>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {results && !analyzing && (
            <div style={{ padding: 28, animation: "fadeUp 0.5s ease" }}>
              {/* Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                marginBottom: 24, flexWrap: "wrap", gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
                    Diagnostic Report
                  </div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 }}>
                    {patientInfo.name || "Anonymous Patient"}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    {patientInfo.id && `ID: ${patientInfo.id} · `}
                    {patientInfo.age && `Age: ${patientInfo.age} · `}
                    {new Date().toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Processing", val: `${results.processingTime}s` },
                    { label: "Predicted", val: results.predicted.split(" ")[0] },
                    { label: "Model", val: "v1.0" },
                  ].map(({ label, val }) => (
                    <div key={label} style={{
                      textAlign: "center", padding: "12px 20px",
                      background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 6,
                    }}>
                      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: COLORS.accent }}>{val}</div>
                      <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <GlowLine />

              {/* Class Probabilities */}
              <div style={{ marginTop: 24 }}>
              <div style={{
                marginBottom: 24, padding: "20px 24px",
                background: results.predicted === "Normal" ? `${COLORS.success}12` : `${COLORS.danger}12`,
                border: `1px solid ${results.predicted === "Normal" ? COLORS.success + "40" : COLORS.danger + "40"}`,
                borderRadius: 8, display: "flex", alignItems: "center", gap: 16,
              }}>
                <div style={{ fontSize: 36 }}>
                  {results.predicted === "Normal" ? "✅" : results.predicted === "COVID-19" ? "🦠" : results.predicted === "Viral Pneumonia" ? "🫁" : "🌫️"}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Primary Prediction</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: results.predicted === "Normal" ? COLORS.success : COLORS.danger }}>
                    {results.predicted}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                    Confidence: {(parseFloat(results.findings.find(f => f.predicted).confidence) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
                  Class Probability Breakdown
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {results.findings
                    .sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence))
                    .map((f, i) => (
                      <div key={f.name} style={{
                        background: COLORS.panel,
                        border: `1px solid ${f.predicted ? COLORS.accent + "60" : COLORS.border}`,
                        borderLeft: `3px solid ${f.predicted ? COLORS.accent : f.severity === "High" ? COLORS.danger : f.severity === "Moderate" ? COLORS.warning : COLORS.success}`,
                        padding: "16px 20px", borderRadius: 2,
                        animation: `fadeUp 0.4s ease ${i * 0.1}s both`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>{f.name}</span>
                            {f.predicted && <span style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 20,
                              background: `${COLORS.accent}20`, color: COLORS.accent,
                              border: `1px solid ${COLORS.accent}40`, letterSpacing: 1,
                            }}>PREDICTED</span>}
                            <Badge severity={f.severity} />
                          </div>
                          <span style={{ fontSize: 11, color: COLORS.muted }}>
                            {(parseFloat(f.confidence) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <ConfidenceBar value={f.confidence} />
                      </div>
                    ))}
                </div>
              </div>

              {/* Disclaimer */}
              <div style={{
                marginTop: 28, padding: "16px 20px",
                background: `${COLORS.warning}08`, border: `1px solid ${COLORS.warning}30`,
                borderRadius: 6, fontSize: 11, color: COLORS.warning, lineHeight: 1.7,
              }}>
                ⚠ Clinical Disclaimer: This AI analysis is a decision support tool and must be reviewed by a qualified radiologist or physician before any clinical decision is made. The model's predictions should not replace professional medical judgment.
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                <button style={{
                  background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
                  border: "none", color: "#fff", padding: "10px 24px", borderRadius: 6,
                  cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                }}>Download Report (PDF)</button>
                <button style={{
                  background: "transparent", border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted, padding: "10px 24px", borderRadius: 6,
                  cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                }}>Export JSON</button>
                <button onClick={reset} style={{
                  background: "transparent", border: `1px solid ${COLORS.border}`,
                  color: COLORS.muted, padding: "10px 24px", borderRadius: 6,
                  cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                }}>New Analysis</button>
              </div>
            </div>
          )}

          {/* Image uploaded, not yet analyzed */}
          {imageUrl && !analyzing && !results && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              color: COLORS.muted,
            }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: COLORS.text }}>
                X-Ray Loaded
              </div>
              <div style={{ fontSize: 12, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                Click <span style={{ color: COLORS.accent }}>"Run AI Analysis"</span> in the left panel to begin multi-disease detection.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
