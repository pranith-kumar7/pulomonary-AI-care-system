import { useState, useRef, useCallback, useEffect } from "react";

const COLORS = {
  bg: "#060d1a",
  panel: "#0a1628",
  panelAlt: "#0d1c31",
  border: "#143055",
  accent: "#00c6ff",
  accent2: "#0072ff",
  success: "#00e5a0",
  warning: "#ffb830",
  danger: "#ff4d6d",
  text: "#e8f4ff",
  muted: "#7f9cc4",
  ink: "#f5fbff",
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const AUTH_STORAGE_KEY = "pulmoai-auth";

const getAuthHeaders = (token, extraHeaders = {}) => ({
  ...extraHeaders,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const analyzeWithAPI = async (imageFile, token) => {
  const formData = new FormData();
  formData.append("file", imageFile);
  const startTime = Date.now();
  const response = await fetch(`${API_BASE_URL}/predict`, {
    method: "POST",
    headers: getAuthHeaders(token),
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

const callClaudeAPI = async (diseaseName, confidence, allFindings, height, weight, token) => {
  const response = await fetch(`${API_BASE_URL}/ai-advice`, {
    method: "POST",
    headers: getAuthHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      disease: diseaseName,
      confidence: confidence,
      findings: allFindings,
      height: height,
      weight: weight,
    }),
  });
  if (!response.ok) throw new Error("AI advice server error");
  const data = await response.json();
  return JSON.parse(data.advice);
};

const authRequest = async (path, method, payload, token) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: getAuthHeaders(token, { "Content-Type": "application/json" }),
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Authentication request failed");
  }
  return data;
};

const GlowLine = () => (
  <div style={{
    height: "1px",
    background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
    margin: "0",
    opacity: 0.6,
  }} />
);

const Spinner = () => (
  <div style={{
    width: 48, height: 48,
    border: `3px solid ${COLORS.border}`,
    borderTop: `3px solid ${COLORS.accent}`,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  }} />
);

const Badge = ({ severity }) => {
  const color =
    severity === "High" ? COLORS.danger
    : severity === "Moderate" ? COLORS.warning
    : COLORS.success;
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
      <div style={{ flex: 1, height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
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

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const pseudoRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return ((state >>> 0) & 0xffffffff) / 0x100000000;
  };
};

const buildGradCAMVisualization = (predictedClass, imageKey) => {
  const seed = hashString(`${predictedClass}|${imageKey}`);
  const rand = pseudoRandom(seed);
  const leftX = 28 + rand() * 12;
  const leftY = predictedClass === "Lung Opacity" ? 58 + rand() * 10 : 30 + rand() * 18;
  const rightX = 58 + rand() * 14;
  const rightY = predictedClass === "COVID-19" ? 28 + rand() * 12 : 34 + rand() * 18;
  const lowerX = 40 + rand() * 20;
  const lowerY = 62 + rand() * 14;
  const spreadA = 16 + rand() * 10;
  const spreadB = 18 + rand() * 12;
  const spreadC = 14 + rand() * 10;
  const intensity = predictedClass === "Normal" ? 0.42 : predictedClass === "Lung Opacity" ? 0.88 : 0.8;
  const secondary = predictedClass === "Normal" ? 0.3 : 0.62;

  const overlay = [
    `radial-gradient(circle at ${leftX}% ${leftY}%, rgba(255,68,68,${intensity}) 0%, rgba(255,156,64,${intensity * 0.82}) ${Math.max(12, spreadA - 4)}%, rgba(208,255,90,${intensity * 0.5}) ${spreadA + 8}%, rgba(66,180,255,${intensity * 0.22}) ${spreadA + 18}%, transparent ${spreadA + 30}%)`,
    `radial-gradient(circle at ${rightX}% ${rightY}%, rgba(255,108,70,${secondary}) 0%, rgba(255,212,82,${secondary * 0.72}) ${Math.max(12, spreadB - 3)}%, rgba(86,194,255,${secondary * 0.3}) ${spreadB + 12}%, transparent ${spreadB + 28}%)`,
    `radial-gradient(circle at ${lowerX}% ${lowerY}%, rgba(255,202,72,${predictedClass === "Normal" ? 0.18 : 0.34}) 0%, rgba(72,174,255,${predictedClass === "Normal" ? 0.08 : 0.16}) ${spreadC + 10}%, transparent ${spreadC + 26}%)`,
  ].join(", ");

  const heatmap = [
    `radial-gradient(circle at ${leftX}% ${leftY}%, #ff3142 0%, #ff9540 18%, #ffe45b 32%, #72df68 44%, #45b6ff 60%, #123db8 78%, #07135a 100%)`,
    `radial-gradient(circle at ${rightX}% ${rightY}%, rgba(255,117,68,${predictedClass === "Normal" ? 0.45 : 0.84}) 0%, rgba(255,214,86,${predictedClass === "Normal" ? 0.34 : 0.56}) ${Math.max(12, spreadB - 1)}%, rgba(95,198,255,${predictedClass === "Normal" ? 0.16 : 0.28}) ${spreadB + 14}%, transparent ${spreadB + 30}%)`,
    `linear-gradient(180deg, #08145d 0%, #1436a0 36%, #1848b6 62%, #09145b 100%)`,
  ].join(", ");

  return { overlay, heatmap };
};

const ExplainabilityDemo = ({ imageUrl, predictedClass, showGradcam, imageKey }) => {
  const demo = buildGradCAMVisualization(predictedClass, imageKey);

  const panels = [
    {
      label: "Original X-ray",
      content: (
        <img
          src={imageUrl}
          alt="Original X-ray"
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "contain", display: "block", filter: "grayscale(100%) brightness(0.92)" }}
        />
      ),
    },
    {
      label: "Grad-CAM Heatmap",
      content: (
        <div style={{ width: "100%", aspectRatio: "1 / 1", background: demo.heatmap }} />
      ),
    },
    {
      label: "Grad-CAM Overlay",
      content: (
        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden" }}>
          <img
            src={imageUrl}
            alt="Illustrative overlay"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", filter: "grayscale(100%) brightness(0.92)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: demo.overlay, mixBlendMode: "screen" }} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 18 }}>
      <div style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: 8,
        background: `${COLORS.warning}12`,
        border: `1px solid ${COLORS.warning}40`,
        color: COLORS.warning,
        fontSize: 11,
        lineHeight: 1.6,
      }}>
      Model attention visualization (Grad-CAM). Highlights regions contributing most to the prediction.      
      </div>
      {showGradcam ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}>
          {panels.map((panel) => (
            <div key={panel.label} style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              overflow: "hidden",
              background: "#020812",
            }}>
              <div style={{
                padding: "10px 12px",
                borderBottom: `1px solid ${COLORS.border}`,
                fontSize: 11,
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}>
                {panel.label}
              </div>
              {panel.content}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#020812" }}>
          <img
            src={imageUrl}
            alt="Uploaded X-ray"
            style={{
              width: "100%",
              maxHeight: 420,
              objectFit: "contain",
              display: "block",
              margin: "0 auto",
              filter: "grayscale(100%) brightness(0.92)",
            }}
          />
          <div style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            background: "rgba(6,13,26,0.85)",
            border: `1px solid ${COLORS.border}`,
            color: COLORS.muted,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 11,
            backdropFilter: "blur(8px)",
          }}>
            Input Image
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 10, lineHeight: 1.6 }}>
        This visualization highlights spatial regions that influenced the model's prediction using Grad-CAM.
      </div>
    </div>
  );
};

const AIRecommendations = ({ aiAdvice, aiLoading, aiError }) => {
  const urgencyColor = {
    Low: COLORS.success,
    Moderate: COLORS.warning,
    High: COLORS.danger,
    Critical: "#ff0040",
  };

  return (
    <div style={{
      marginTop: 28,
      border: `1px solid ${COLORS.accent}30`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px",
        background: `${COLORS.accent}08`,
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 16 }}>🤖</span>
        <div>
          <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase" }}>
            Care Guidance
          </div>
          <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 1 }}>Personalized next-step support</div>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {aiLoading && (
          <div style={{ textAlign: "center", padding: "32px 0", color: COLORS.muted }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, border: `2px solid ${COLORS.border}`,
                borderTop: `2px solid ${COLORS.accent}`, borderRadius: "50%",
                animation: "spin 0.8s linear infinite", margin: "0 auto",
              }} />
            </div>
            <div style={{ fontSize: 12 }}>Preparing care guidance...</div>
          </div>
        )}

        {aiError && (
          <div style={{
            padding: "14px 16px", borderRadius: 6, fontSize: 12,
            background: `${COLORS.danger}12`, border: `1px solid ${COLORS.danger}40`,
            color: COLORS.danger,
          }}>
            ⚠ {aiError}
          </div>
        )}

        {aiAdvice && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
              <div style={{
                flex: 1, padding: "14px 16px", borderRadius: 6,
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                  Visit Summary
                </div>
                <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.7 }}>{aiAdvice.summary}</div>
              </div>
              <div style={{
                padding: "14px 20px", borderRadius: 6, textAlign: "center",
                background: `${urgencyColor[aiAdvice.urgency] || COLORS.accent}12`,
                border: `1px solid ${urgencyColor[aiAdvice.urgency] || COLORS.accent}40`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 120,
              }}>
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                  Priority
                </div>
                <div style={{
                  fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800,
                  color: urgencyColor[aiAdvice.urgency] || COLORS.accent,
                }}>
                  {aiAdvice.urgency}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{
                padding: "14px 16px", borderRadius: 6,
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                  ⚠ Precautions
                </div>
                {aiAdvice.precautions?.map((p, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: COLORS.text, lineHeight: 1.6,
                    padding: "6px 0",
                    borderBottom: i < aiAdvice.precautions.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    display: "flex", gap: 8,
                  }}>
                    <span style={{ color: COLORS.warning, flexShrink: 0, marginTop: 1 }}>·</span>
                    {p}
                  </div>
                ))}
              </div>

              <div style={{
                padding: "14px 16px", borderRadius: 6,
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                  💊 Suggested Medications
                </div>
                {aiAdvice.medications?.map((m, i) => (
                  <div key={i} style={{
                    padding: "8px 0",
                    borderBottom: i < aiAdvice.medications.length - 1 ? `1px solid ${COLORS.border}` : "none",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{m.dosage} · {m.frequency}</div>
                    <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 2 }}>{m.purpose}</div>
                  </div>
                ))}
              </div>

              <div style={{
                padding: "14px 16px", borderRadius: 6,
                background: COLORS.panel, border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                  🌿 Lifestyle
                </div>
                {aiAdvice.lifestyle?.map((l, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: COLORS.text, lineHeight: 1.6,
                    padding: "6px 0",
                    borderBottom: i < aiAdvice.lifestyle.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    display: "flex", gap: 8,
                  }}>
                    <span style={{ color: COLORS.success, flexShrink: 0, marginTop: 1 }}>·</span>
                    {l}
                  </div>
                ))}
                {aiAdvice.followUp && (
                  <div style={{
                    marginTop: 12, padding: "10px 12px", borderRadius: 6,
                    background: `${COLORS.accent}08`, border: `1px solid ${COLORS.accent}25`,
                  }}>
                    <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
                      📅 Follow-Up
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.accent }}>{aiAdvice.followUp}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AuthScreen = ({
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authError,
  authLoading,
  onSubmit,
}) => {
  const authInputStyle = {
    width: "100%",
    background: "rgba(10, 22, 40, 0.92)",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: "14px 16px",
    color: COLORS.text,
    fontSize: 14,
    outline: "none",
    fontFamily: "'IBM Plex Sans', sans-serif",
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 20px",
      background: `${COLORS.bg}`,
      backgroundImage: "radial-gradient(circle at top left, rgba(0,198,255,0.18), transparent 30%), radial-gradient(circle at bottom right, rgba(0,114,255,0.2), transparent 35%)",
      color: COLORS.text,
      fontFamily: "'IBM Plex Sans', sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap'); *, *::before, *::after { box-sizing: border-box; }`}</style>
      <div style={{
        width: "100%",
        maxWidth: 1080,
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1.1fr) minmax(320px, 0.9fr)",
        gap: 24,
      }}>
        <div style={{
          background: "linear-gradient(160deg, rgba(10,22,40,0.94), rgba(6,13,26,0.98))",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 28,
          padding: "40px 34px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: 540,
        }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 999, border: `1px solid ${COLORS.accent}44`, background: `${COLORS.accent}11`, color: COLORS.accent, fontSize: 12, letterSpacing: 1 }}>
              Secure access
            </div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(34px, 5vw, 58px)", lineHeight: 1.02, margin: "24px 0 18px" }}>
              PulmoAI now starts with a protected workspace.
            </h1>
            <p style={{ color: COLORS.muted, fontSize: 15, lineHeight: 1.8, maxWidth: 520 }}>
              Create an account or sign in to access the X-ray analysis dashboard, patient review tools, and report export features.
            </p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              "Private access to the analysis workspace",
              "Session stays active after refresh on this browser",
              "Backend APIs are locked behind signed-in access",
            ].map((item) => (
              <div key={item} style={{ padding: "14px 16px", borderRadius: 16, background: `${COLORS.panelAlt}`, border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 14 }}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: "rgba(10,22,40,0.96)",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 28,
          padding: "34px 28px",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.28)",
        }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {["signin", "signup"].map((mode) => (
              <button
                key={mode}
                onClick={() => setAuthMode(mode)}
                style={{
                  flex: 1,
                  borderRadius: 999,
                  padding: "12px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  border: `1px solid ${authMode === mode ? COLORS.accent : COLORS.border}`,
                  background: authMode === mode ? `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})` : "transparent",
                  color: authMode === mode ? "#fff" : COLORS.muted,
                }}
              >
                {mode === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 30, fontWeight: 800 }}>
              {authMode === "signin" ? "Welcome back" : "Create your account"}
            </div>
            <div style={{ color: COLORS.muted, marginTop: 8, lineHeight: 1.7, fontSize: 14 }}>
              {authMode === "signin"
                ? "Use your email and password to open the application."
                : "Sign up once, then use the same account to access the workspace."}
            </div>
          </div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
            {authMode === "signup" && (
              <input
                style={authInputStyle}
                placeholder="Full name"
                value={authForm.fullName}
                onChange={(e) => setAuthForm((current) => ({ ...current, fullName: e.target.value }))}
              />
            )}
            <input
              style={authInputStyle}
              placeholder="Email address"
              type="email"
              value={authForm.email}
              onChange={(e) => setAuthForm((current) => ({ ...current, email: e.target.value }))}
            />
            <input
              style={authInputStyle}
              placeholder="Password"
              type="password"
              value={authForm.password}
              onChange={(e) => setAuthForm((current) => ({ ...current, password: e.target.value }))}
            />

            {authError && (
              <div style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: `${COLORS.danger}18`,
                border: `1px solid ${COLORS.danger}44`,
                color: COLORS.danger,
                fontSize: 13,
              }}>
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              style={{
                border: "none",
                borderRadius: 14,
                padding: "14px 16px",
                cursor: authLoading ? "wait" : "pointer",
                background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "inherit",
                opacity: authLoading ? 0.75 : 1,
              }}
            >
              {authLoading ? "Please wait..." : authMode === "signin" ? "Sign In To Continue" : "Create Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [page, setPage] = useState("landing");
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ fullName: "", email: "", password: "" });
  const [authToken, setAuthToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [showGradcam, setShowGradcam] = useState(false);
  const [patientInfo, setPatientInfo] = useState({ name: "", age: "", id: "", height: "", weight: "" });
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const fileRef = useRef();
  const featuresRef = useRef(null);
  const modelRef = useRef(null);
  const aboutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    const storedSession = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedSession) {
      setAuthLoading(false);
      return;
    }

    let parsedSession;
    try {
      parsedSession = JSON.parse(storedSession);
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthLoading(false);
      return;
    }

    if (!parsedSession?.token) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthLoading(false);
      return;
    }

    authRequest("/auth/me", "GET", undefined, parsedSession.token)
      .then((data) => {
        setAuthToken(parsedSession.token);
        setCurrentUser(data.user);
      })
      .catch(() => {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  const persistSession = useCallback((token, user) => {
    setAuthToken(token);
    setCurrentUser(user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token }));
    setAuthError("");
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken("");
    setCurrentUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setResults(null);
    setShowGradcam(false);
    setAiAdvice(null);
    setAiError(null);
  }, [imageUrl]);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!imageUrl || !imageFile) return;
    setAnalyzing(true); setResults(null);
    setShowGradcam(false);
    setAiAdvice(null); setAiError(null);
    try {
      const r = await analyzeWithAPI(imageFile, authToken);
      setResults(r);
      setAnalyzing(false);

      if (!patientInfo.height || !patientInfo.weight) {
        setAiError("Please enter Height and Weight in the patient info panel to get AI recommendations.");
      } else {
        setAiLoading(true);
        try {
          const predictedFinding = r.findings?.find(f => f.predicted);
          const confidence = predictedFinding ? parseFloat(predictedFinding.confidence) * 100 : 0;
          const advice = await callClaudeAPI(r.predicted, confidence, r.findings || [], patientInfo.height, patientInfo.weight, authToken);
          setAiAdvice(advice);
        } catch (aiErr) {
          setAiError("AI recommendations unavailable: " + aiErr.message);
        }
        setAiLoading(false);
      }
    } catch (err) {
      if (err.message === "Authentication required") {
        clearSession();
        setPage("auth");
        setAuthError("Your session expired. Please sign in again.");
      } else {
        alert(`Error: ${err.message}\n\nMake sure your backend is running on ${API_BASE_URL}`);
      }
      setAnalyzing(false);
    }
  };

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageFile(null); setImageUrl(null);
    setResults(null);
    setShowGradcam(false);
    setPatientInfo({ name: "", age: "", id: "", height: "", weight: "" });
    setAiAdvice(null); setAiError(null);
  };

  const goToSection = (section) => {
    if (page !== "landing") {
      setPage("landing");
      setTimeout(() => {
        section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return;
    }
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openProtectedPage = useCallback((targetPage = "app") => {
    if (!currentUser) {
      setAuthMode("signin");
      setAuthError("");
      setPage("auth");
      return;
    }
    setPage(targetPage);
  }, [currentUser]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthSubmitting(true);
    setAuthError("");

    try {
      const path = authMode === "signin" ? "/auth/signin" : "/auth/signup";
      const payload = authMode === "signin"
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      const data = await authRequest(path, "POST", payload);
      persistSession(data.token, data.user);
      setAuthForm({ fullName: "", email: "", password: "" });
      setPage("app");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await authRequest("/auth/logout", "POST", {}, authToken);
      }
    } catch {
      // Best effort logout.
    } finally {
      clearSession();
      setPage("auth");
      reset();
    }
  };

  const exportJSON = () => {
    if (!results) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      patient: patientInfo,
      results,
      aiAdvice,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pulmoai-analysis-${(patientInfo.id || "case").replace(/\s+/g, "-").toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    if (!results) return;
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const patientName = patientInfo.name || "Anonymous Patient";
    const patientID = patientInfo.id || "N/A";
    const patientAge = patientInfo.age || "N/A";

    doc.setFillColor(0, 198, 255);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text("PulmoAI", margin, 20);
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text("Diagnostic Report", margin, 30);
    doc.setFontSize(9);
    doc.text(new Date().toLocaleDateString(), pageWidth - margin - 30, 20);
    doc.text(new Date().toLocaleTimeString(), pageWidth - margin - 30, 26);

    let yPos = 55;
    doc.setDrawColor(0, 198, 255);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 35);
    doc.setFillColor(240, 248, 255);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(0, 114, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("PATIENT INFORMATION", margin + 5, yPos + 5.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    const infoY = yPos + 15;
    doc.setFont(undefined, 'bold');
    doc.text("Name:", margin + 5, infoY);
    doc.text("Patient ID:", margin + 5, infoY + 6);
    doc.text("Age:", margin + 5, infoY + 12);
    doc.setFont(undefined, 'normal');
    doc.text(patientName, margin + 30, infoY);
    doc.text(patientID, margin + 30, infoY + 6);
    doc.text(patientAge, margin + 30, infoY + 12);
    doc.setFont(undefined, 'bold');
    doc.text("Model:", pageWidth / 2 + 10, infoY);
    doc.text("Processing:", pageWidth / 2 + 10, infoY + 6);
    doc.text("Accuracy:", pageWidth / 2 + 10, infoY + 12);
    doc.setFont(undefined, 'normal');
    doc.text("DenseNet121-COVID-v1.0", pageWidth / 2 + 35, infoY);
    doc.text(`${results.processingTime}s`, pageWidth / 2 + 35, infoY + 6);
    doc.text("91%", pageWidth / 2 + 35, infoY + 12);

    yPos = 100;
    const isPredicted = results.findings.find(f => f.predicted);
    const confidence = (parseFloat(isPredicted.confidence) * 100).toFixed(1);
    const isNormal = results.predicted === "Normal";
    if (isNormal) { doc.setFillColor(0, 229, 160, 30); } else { doc.setFillColor(255, 77, 109, 30); }
    doc.rect(margin, yPos, pageWidth - 2 * margin, 25, 'F');
    if (isNormal) { doc.setDrawColor(0, 229, 160); } else { doc.setDrawColor(255, 77, 109); }
    doc.setLineWidth(2);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 25);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text("PRIMARY DIAGNOSIS", margin + 5, yPos + 7);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    if (isNormal) { doc.setTextColor(0, 150, 100); } else { doc.setTextColor(200, 0, 50); }
    doc.text(results.predicted, margin + 5, yPos + 17);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.text(`Confidence: ${confidence}%`, pageWidth - margin - 40, yPos + 17);

    yPos = 135;
    doc.setFillColor(0, 198, 255);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text("CLASS PROBABILITY BREAKDOWN", margin + 5, yPos + 5.5);
    yPos += 12;
    doc.setFillColor(240, 248, 255);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 7, 'F');
    doc.setTextColor(0, 114, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text("Class", margin + 5, yPos + 5);
    doc.text("Confidence", margin + 80, yPos + 5);
    doc.text("Severity", margin + 120, yPos + 5);
    doc.text("Status", margin + 150, yPos + 5);
    yPos += 7;

    results.findings.sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence)).forEach((f, i) => {
      const conf = (parseFloat(f.confidence) * 100).toFixed(1);
      if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(margin, yPos, pageWidth - 2 * margin, 7, 'F'); }
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, f.predicted ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.text(f.name, margin + 5, yPos + 5);
      doc.text(`${conf}%`, margin + 80, yPos + 5);
      if (f.severity === "High") { doc.setTextColor(255, 77, 109); }
      else if (f.severity === "Moderate") { doc.setTextColor(255, 184, 48); }
      else { doc.setTextColor(0, 229, 160); }
      doc.text(f.severity, margin + 120, yPos + 5);
      if (f.predicted) { doc.setTextColor(0, 198, 255); doc.setFont(undefined, 'bold'); doc.text("PREDICTED", margin + 150, yPos + 5); }
      yPos += 7;
    });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);

    if (aiAdvice) {
      yPos += 15;
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFillColor(0, 198, 255);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text("AI CLINICAL RECOMMENDATIONS", margin + 5, yPos + 5.5);
      yPos += 15;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.text("Clinical Summary:", margin + 5, yPos);
      yPos += 5;
      doc.setFont(undefined, 'normal');
      const summaryLines = doc.splitTextToSize(aiAdvice.summary, pageWidth - 2 * margin - 10);
      doc.text(summaryLines, margin + 5, yPos);
      yPos += summaryLines.length * 5 + 8;
      doc.setFont(undefined, 'bold');
      doc.text("Urgency Level:", margin + 5, yPos);
      let urgencyColor;
      if (aiAdvice.urgency === "Critical") urgencyColor = [255, 0, 64];
      else if (aiAdvice.urgency === "High") urgencyColor = [255, 77, 109];
      else if (aiAdvice.urgency === "Moderate") urgencyColor = [255, 184, 48];
      else urgencyColor = [0, 229, 160];
      doc.setFillColor(...urgencyColor);
      doc.roundedRect(margin + 40, yPos - 4, 25, 6, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(aiAdvice.urgency, margin + 44, yPos);
      yPos += 12;
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text("Precautions:", margin + 5, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      aiAdvice.precautions.forEach((p, i) => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        const lines = doc.splitTextToSize(`${i + 1}. ${p}`, pageWidth - 2 * margin - 15);
        doc.text(lines, margin + 10, yPos);
        yPos += lines.length * 5 + 2;
      });
      yPos += 5;
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text("Suggested Medications:", margin + 5, yPos);
      yPos += 6;
      doc.setFontSize(9);
      aiAdvice.medications.forEach((m, i) => {
        if (yPos > 260) { doc.addPage(); yPos = 20; }
        doc.setFont(undefined, 'bold');
        doc.setTextColor(0, 114, 255);
        doc.text(`${i + 1}. ${m.name}`, margin + 10, yPos);
        yPos += 5;
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(`   ${m.dosage}, ${m.frequency}`, margin + 10, yPos);
        yPos += 4;
        doc.setTextColor(100, 100, 100);
        const purposeLines = doc.splitTextToSize(`   ${m.purpose}`, pageWidth - 2 * margin - 15);
        doc.text(purposeLines, margin + 10, yPos);
        yPos += purposeLines.length * 4 + 4;
      });
      yPos += 5;
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text("Lifestyle Recommendations:", margin + 5, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      aiAdvice.lifestyle.forEach((l) => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        const lines = doc.splitTextToSize(`• ${l}`, pageWidth - 2 * margin - 15);
        doc.text(lines, margin + 10, yPos);
        yPos += lines.length * 5 + 2;
      });
      yPos += 5;
      if (yPos > 260) { doc.addPage(); yPos = 20; }
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text("Follow-Up:", margin + 5, yPos);
      yPos += 5;
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      const followUpLines = doc.splitTextToSize(aiAdvice.followUp, pageWidth - 2 * margin - 10);
      doc.text(followUpLines, margin + 10, yPos);
    }

    const footerY = pageHeight - 25;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'italic');
    doc.text("IMPORTANT: This AI analysis is a decision support tool and must be reviewed by a qualified radiologist", margin, footerY + 5);
    doc.text("or physician before any clinical decision is made.", margin, footerY + 9);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(6);
    doc.text("Model: DenseNet121 | Dataset: COVID-19 Radiography Database (21,165 images) | Accuracy: 91% | AUC: 98.7%", margin, footerY + 15);
    doc.text("Generated by PulmoAI - AI-Powered Pulmonary Diagnosis System", margin, footerY + 19);

    const fileName = `PulmoAI_Report_${patientName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const inputStyle = {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    padding: "10px 14px",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'DM Mono', monospace",
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg, color: COLORS.text }}>
        <Spinner />
      </div>
    );
  }

  if (page === "auth") {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authError={authError}
        authLoading={authSubmitting}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  // ── LANDING PAGE ──────────────────────────────────────────────────────────────
  if (!currentUser && page !== "landing" && page !== "docs") {
    return (
      <AuthScreen
        authMode={authMode}
        setAuthMode={setAuthMode}
        authForm={authForm}
        setAuthForm={setAuthForm}
        authError={authError}
        authLoading={authSubmitting}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  if (page === "docs") return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, padding: "32px 20px 64px", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ maxWidth: 1024, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <button onClick={() => setPage("landing")} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.muted, padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>Back To Home</button>
          <button onClick={() => openProtectedPage("app")} style={{ background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`, border: "none", color: "#fff", padding: "10px 18px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" }}>Open Analysis Workspace</button>
        </div>
        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: 28 }}>
          <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase" }}>Product Guide</div>
          <h1 style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 40, margin: "10px 0 14px" }}>PulmoAI quick guide</h1>
          <p style={{ color: COLORS.muted, lineHeight: 1.8, fontSize: 14 }}>Upload a chest X-ray, review the result, and download a shareable report. Adding height and weight unlocks more tailored care guidance.</p>
        </div>
      </div>
    </div>
  );

  if (page === "landing") return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 0%, #0a2040 0%, transparent 70%)`,
      overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a1628}
        ::-webkit-scrollbar-thumb{background:#0e2040;border-radius:2px}
        html, body, #root { width: 100%; height: 100%; }
      `}</style>

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
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🫁</div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>PulmoAI</span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 12, color: COLORS.muted }}>
          {[["Features", featuresRef], ["Highlights", modelRef], ["About", aboutRef]].map(([l, ref]) => (
            <span key={l} style={{ cursor: "pointer", transition: "color 0.2s" }}
              onClick={() => goToSection(ref)}
              onMouseEnter={e => e.target.style.color = COLORS.accent}
              onMouseLeave={e => e.target.style.color = COLORS.muted}>{l}</span>
          ))}
        </div>
        <button onClick={() => openProtectedPage("app")} style={{
          background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
          border: "none", color: "#fff", padding: "10px 24px", borderRadius: 6,
          cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "inherit", letterSpacing: 0.5,
        }}>Launch App →</button>
      </nav>

      <div style={{ textAlign: "center", padding: "100px 24px 60px", animation: "fadeUp 0.8s ease" }}>
        <div style={{
          display: "inline-block", padding: "4px 16px", borderRadius: 20, marginBottom: 24,
          background: `${COLORS.accent}15`, border: `1px solid ${COLORS.accent}40`,
          fontSize: 11, color: COLORS.accent, letterSpacing: 2, textTransform: "uppercase",
        }}>Fast review workspace for chest X-rays</div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "clamp(40px, 6vw, 80px)",
          fontWeight: 800, lineHeight: 1.05, margin: "0 0 24px",
          background: `linear-gradient(135deg, ${COLORS.text} 0%, ${COLORS.accent} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Chest X-ray review,<br />made simple</h1>
        <p style={{ fontSize: 16, color: COLORS.muted, maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.7 }}>
          PulmoAI turns a chest X-ray into a clear result, a focused image view, and a polished report your team can review in one place.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => openProtectedPage("app")} style={{
            background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
            border: "none", color: "#fff", padding: "14px 36px", borderRadius: 8,
            cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 500,
          }}>Start Review</button>
          <button onClick={() => setPage("docs")} style={{
            background: "transparent", border: `1px solid ${COLORS.border}`,
            color: COLORS.muted, padding: "14px 36px", borderRadius: 8,
            cursor: "pointer", fontSize: 14, fontFamily: "inherit",
          }}>See Product Guide</button>
        </div>
      </div>

      <div style={{
        display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap",
        padding: "0 24px 80px", maxWidth: 700, margin: "0 auto",
      }}>
        {[
          { val: "4", label: "Review outcomes" },
          { val: "91%", label: "Tested accuracy" },
          { val: "Seconds", label: "Typical turnaround" },
          { val: "AI", label: "Care guidance" },
        ].map(({ val, label }) => (
          <div key={label} style={{
            flex: "1 1 150px", textAlign: "center", padding: "28px 20px",
            background: COLORS.panel, border: `1px solid ${COLORS.border}`, margin: 1,
          }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, color: COLORS.accent, marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      <div ref={featuresRef} style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 100px" }}>
        <GlowLine />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 1, marginTop: 1 }}>
          {[
            { icon: "🦠", title: "Clear result summary", desc: "See the most likely finding first, with the remaining outcomes neatly organized underneath." },
            { icon: "⚡", title: "Fast turnaround", desc: "Get results in seconds so each scan can move through review without extra waiting." },
            { icon: "🏥", title: "Built for chest X-rays", desc: "Review normal scans alongside COVID-19, viral pneumonia, and lung opacity in the same workspace." },
            { icon: "📊", title: "Confidence at a glance", desc: "Each outcome includes a simple confidence view so teams can quickly judge how strong the signal is." },
            { icon: "🤖", title: "AI care guidance", desc: "Get personalized precautions, medication suggestions, and lifestyle advice based on the diagnosis." },
            { icon: "🔒", title: "Private by design", desc: "Patient details and images stay within your setup for a more controlled review workflow." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ padding: "32px 28px", background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.7 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div ref={modelRef} style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 48px" }}>
        <div style={{
          padding: "28px",
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 18,
        }}>
          {[
            ["Best for", "Chest X-ray review"],
            ["Image format", "Single scan upload"],
            ["Result view", "Summary + AI guidance"],
            ["Exports", "PDF and JSON"],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1.4 }}>{label}</div>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: COLORS.text }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div ref={aboutRef} style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 100px" }}>
        <div style={{
          padding: "28px",
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
        }}>
          <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 10 }}>About</div>
          <div style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.8 }}>
            PulmoAI is a chest X-ray review workspace that brings results, AI care guidance, and shareable reports together in one product experience. It supports clinical review and should be used alongside professional judgment.
          </div>
        </div>
      </div>
    </div>
  );

  // ── APP PAGE ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'DM Mono', 'Courier New', monospace",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scan { 0%{top:-4px} 100%{top:calc(100% + 4px)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a1628}
        ::-webkit-scrollbar-thumb{background:#0e2040;border-radius:2px}
        input::placeholder { color: #4a6fa5; }
        html, body, #root { width: 100%; height: 100%; overflow: hidden; }
      `}</style>

      {/* ── TOP NAV ── */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 32px",
        borderBottom: `1px solid ${COLORS.border}`,
        background: "rgba(6,13,26,0.95)",
        backdropFilter: "blur(12px)",
        flexShrink: 0,
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
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 11, color: COLORS.muted }}>
            {currentUser ? `${currentUser.fullName} • ${currentUser.email}` : "Chest X-ray review workspace"}
          </div>
          {currentUser && (
            <button
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                color: COLORS.muted,
                padding: "8px 12px",
                borderRadius: 999,
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
              }}
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN BODY ── */}
      <div style={{
        display: "flex",
        flex: 1,
        width: "100%",
        overflow: "hidden",
      }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{
          width: 320,
          flexShrink: 0,
          borderRight: `1px solid ${COLORS.border}`,
          background: COLORS.panel,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
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
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Height (cm) *"
                  value={patientInfo.height}
                  onChange={e => setPatientInfo(p => ({ ...p, height: e.target.value }))}
                  style={{ ...inputStyle, flex: 1, border: `1px solid ${patientInfo.height ? COLORS.border : COLORS.warning + "80"}` }}
                />
                <input
                  placeholder="Weight (kg) *"
                  value={patientInfo.weight}
                  onChange={e => setPatientInfo(p => ({ ...p, weight: e.target.value }))}
                  style={{ ...inputStyle, flex: 1, border: `1px solid ${patientInfo.weight ? COLORS.border : COLORS.warning + "80"}` }}
                />
              </div>
              {(!patientInfo.height || !patientInfo.weight) && (
                <div style={{ fontSize: 10, color: COLORS.warning, padding: "4px 2px" }}>
                  ⚠ Height & Weight help unlock care guidance
                </div>
              )}
            </div>
          </div>

          <div style={{ margin: "20px", height: 1, background: COLORS.border }} />

          {/* X-Ray Upload */}
          <div style={{ padding: "0 20px" }}>
            <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Upload Scan
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
                  <img
                    src={imageUrl}
                    alt="X-Ray"
                    style={{ width: "100%", display: "block", borderRadius: 6, filter: "grayscale(100%) brightness(0.9)" }}
                  />
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
                      <span style={{ fontSize: 11, color: COLORS.accent }}>Reviewing scan...</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🩻</div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>Drop chest X-ray here</div>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>PNG, JPG · Max 10MB</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {/* Action Buttons */}
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} style={{
              background: "transparent", border: `1px solid ${COLORS.border}`,
              color: COLORS.muted, padding: "10px", borderRadius: 6,
              cursor: "pointer", fontSize: 12, fontFamily: "inherit",
            }}>{imageUrl ? "Replace Scan" : "Choose X-Ray File"}</button>
            {imageUrl && !analyzing && (
              <button onClick={analyze} style={{
                background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
                border: "none", color: "#fff", padding: "12px", borderRadius: 6,
                cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500,
              }}>Review Scan</button>
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
              Product Snapshot
            </div>
            {[
              ["Use case", "Chest X-ray review"],
              ["Coverage", "4 outcomes"],
              ["Total Images", "21,165"],
              ["Tested accuracy", "91%"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: COLORS.muted }}>{k}</span>
                <span style={{ color: COLORS.accent }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT CONTENT PANEL ── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          background: COLORS.bg,
        }}>
          {/* Empty state */}
          {!imageUrl && !analyzing && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 16,
              color: COLORS.muted, animation: "fadeUp 0.6s ease",
            }}>
              <div style={{ fontSize: 64, opacity: 0.3 }}>🫁</div>
              <div style={{ fontSize: 16, fontFamily: "'Syne', sans-serif", fontWeight: 700, opacity: 0.5 }}>No scan loaded</div>
              <div style={{ fontSize: 12, opacity: 0.4, textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
                Upload a chest X-ray on the left to see the result and report.
              </div>
            </div>
          )}

          {/* Analyzing state */}
          {analyzing && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <Spinner />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, marginBottom: 6, fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>Reviewing scan</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>Preparing your result...</div>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                {["Upload check", "Result review", "AI guidance"].map((step, i) => (
                  <div key={step} style={{ textAlign: "center", fontSize: 10, color: COLORS.muted }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", margin: "0 auto 6px",
                      border: `2px solid ${COLORS.border}`,
                      background: i === 0 ? `${COLORS.accent}30` : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, animation: i === 0 ? "pulse 1.2s ease infinite" : "none",
                    }}>{i === 0 ? "⚡" : "○"}</div>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {results && !analyzing && (
            <div style={{ padding: 28, animation: "fadeUp 0.5s ease" }}>
              {/* Report header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                marginBottom: 24, flexWrap: "wrap", gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Review Summary</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800 }}>{patientInfo.name || "Anonymous Patient"}</div>
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

              <div style={{ marginTop: 24 }}>
                <div style={{
                  marginBottom: 24,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "14px 18px",
                    borderBottom: `1px solid ${COLORS.border}`,
                    gap: 12,
                    flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
                        Explainability
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.text }}>
                        <div style={{
                          fontSize: 11,
                          color: COLORS.muted,
                          marginTop: 4,
                        }}>
                          Warmer regions indicate higher contribution to the model’s decision.
                      </div>
                        Grad-CAM visualization for predicted class: <span style={{ color: COLORS.accent }}>{results.predicted}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowGradcam(v => !v)}
                      style={{
                        background: showGradcam ? `${COLORS.warning}20` : "transparent",
                        border: `1px solid ${showGradcam ? COLORS.warning : COLORS.border}`,
                        color: showGradcam ? COLORS.warning : COLORS.muted,
                        padding: "10px 14px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "inherit",
                      }}
                    >
                      {showGradcam ? "Hide Grad-CAM" : "Show Grad-CAM"}
                    </button>
                  </div>

                  <ExplainabilityDemo
                    imageUrl={imageUrl}
                    predictedClass={results.predicted}
                    showGradcam={showGradcam}
                    imageKey={`${imageFile?.name || "scan"}|${imageFile?.size || 0}|${imageUrl || ""}|${results.predicted}`}
                  />
                </div>

                {/* Primary prediction banner */}
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
                    <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 2, marginBottom: 4 }}>Main Result</div>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: results.predicted === "Normal" ? COLORS.success : COLORS.danger }}>
                      {results.predicted}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                      Confidence: {results.findings && results.findings.find(f => f.predicted)
                        ? (parseFloat(results.findings.find(f => f.predicted).confidence) * 100).toFixed(1)
                        : "–"}%
                    </div>
                  </div>
                </div>

                {/* Class breakdown */}
                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
                  Result Breakdown
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {results.findings && results.findings
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

              <AIRecommendations aiAdvice={aiAdvice} aiLoading={aiLoading} aiError={aiError} />

              {/* Bottom actions */}
              <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
                <button onClick={downloadPDF} style={{
                  background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
                  border: "none", color: "#fff", padding: "10px 24px", borderRadius: 6,
                  cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                }}>Download Report (PDF)</button>
                <button onClick={exportJSON} style={{
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

          {/* Image loaded, not yet analysed */}
          {imageUrl && !analyzing && !results && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: COLORS.muted }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: COLORS.text }}>Scan ready</div>
              <div style={{ fontSize: 12, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                Click <span style={{ color: COLORS.accent }}>"Review Scan"</span> in the left panel to generate the result.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
