import { useState, useRef, useCallback } from "react";

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

// ── REAL API CALL ─────────────────────────────────────────────────────────────
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

// ── CLAUDE AI CALL — routed through Flask to avoid CORS ───────────────────────
const callClaudeAPI = async (diseaseName, confidence, allFindings) => {
  const response = await fetch("http://localhost:5000/ai-advice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      disease: diseaseName,
      confidence: confidence,
      findings: allFindings,
    }),
  });
  if (!response.ok) throw new Error("AI advice server error");
  const data = await response.json();
  return JSON.parse(data.advice);
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
      }}>Grad-CAM Active</div>
    </div>
  );
};

// ── AI RECOMMENDATIONS PANEL ──────────────────────────────────────────────────
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
            AI Clinical Recommendations
          </div>
          <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 1 }}>Powered by AI</div>
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
            <div style={{ fontSize: 12 }}>Generating clinical recommendations...</div>
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
                  Clinical Summary
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
                  Urgency
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

export default function App() {
  const [page, setPage] = useState("landing");
  const [dragOver, setDragOver] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [showGradcam, setShowGradcam] = useState(false);
  const [patientInfo, setPatientInfo] = useState({ name: "", age: "", id: "" });
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const fileRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setResults(null);
    setShowGradcam(false);
    setAiAdvice(null);
    setAiError(null);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!imageUrl || !imageFile) return;
    setAnalyzing(true); setResults(null);
    setAiAdvice(null); setAiError(null);
    try {
      const r = await analyzeWithAPI(imageFile);
      setResults(r);
      setAnalyzing(false);

      setAiLoading(true);
      try {
        const predictedFinding = r.findings?.find(f => f.predicted);
        const confidence = predictedFinding ? parseFloat(predictedFinding.confidence) * 100 : 0;
        const advice = await callClaudeAPI(r.predicted, confidence, r.findings || []);
        setAiAdvice(advice);
      } catch (aiErr) {
        setAiError("AI recommendations unavailable: " + aiErr.message);
      }
      setAiLoading(false);
    } catch (err) {
      alert("Error: " + err.message + "\n\nMake sure your Flask backend is running on http://localhost:5000");
      setAnalyzing(false);
    }
  };

  const reset = () => {
    setImageFile(null); setImageUrl(null);
    setResults(null); setShowGradcam(false);
    setPatientInfo({ name: "", age: "", id: "" });
    setAiAdvice(null); setAiError(null);
  };

  const downloadPDF = async () => {
  if (!results) return;
  
  // Import jsPDF
  const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  const patientName = patientInfo.name || "Anonymous Patient";
  const patientID = patientInfo.id || "N/A";
  const patientAge = patientInfo.age || "N/A";
  
  // ═══════════════════════════════════════════════════════════
  // HEADER WITH BACKGROUND
  // ═══════════════════════════════════════════════════════════
  doc.setFillColor(0, 198, 255);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont(undefined, 'bold');
  doc.text("🫁 PulmoAI", margin, 20);
  
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text("Diagnostic Report", margin, 30);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString(), pageWidth - margin - 30, 20);
  doc.text(new Date().toLocaleTimeString(), pageWidth - margin - 30, 26);
  
  // ═══════════════════════════════════════════════════════════
  // PATIENT INFORMATION BOX
  // ═══════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════
  // PRIMARY DIAGNOSIS - HIGHLIGHTED BOX
  // ═══════════════════════════════════════════════════════════
  yPos = 100;
  
  const isPredicted = results.findings.find(f => f.predicted);
  const confidence = (parseFloat(isPredicted.confidence) * 100).toFixed(1);
  const isNormal = results.predicted === "Normal";
  
  // Background color based on diagnosis
  if (isNormal) {
    doc.setFillColor(0, 229, 160, 30);
  } else {
    doc.setFillColor(255, 77, 109, 30);
  }
  doc.rect(margin, yPos, pageWidth - 2 * margin, 25, 'F');
  
  // Border
  if (isNormal) {
    doc.setDrawColor(0, 229, 160);
  } else {
    doc.setDrawColor(255, 77, 109);
  }
  doc.setLineWidth(2);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 25);
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.text("PRIMARY DIAGNOSIS", margin + 5, yPos + 7);
  
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  if (isNormal) {
    doc.setTextColor(0, 150, 100);
  } else {
    doc.setTextColor(200, 0, 50);
  }
  doc.text(results.predicted, margin + 5, yPos + 17);
  
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  doc.text(`Confidence: ${confidence}%`, pageWidth - margin - 40, yPos + 17);
  
  // ═══════════════════════════════════════════════════════════
  // CLASS PROBABILITY BREAKDOWN - TABLE
  // ═══════════════════════════════════════════════════════════
  yPos = 135;
  
  doc.setFillColor(0, 198, 255);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text("CLASS PROBABILITY BREAKDOWN", margin + 5, yPos + 5.5);
  
  yPos += 12;
  
  // Table headers
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
  
  // Table rows
  results.findings.sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence)).forEach((f, i) => {
    const conf = (parseFloat(f.confidence) * 100).toFixed(1);
    
    // Alternating row colors
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 7, 'F');
    }
    
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, f.predicted ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.text(f.name, margin + 5, yPos + 5);
    doc.text(`${conf}%`, margin + 80, yPos + 5);
    
    // Severity badge
    if (f.severity === "High") {
      doc.setTextColor(255, 77, 109);
    } else if (f.severity === "Moderate") {
      doc.setTextColor(255, 184, 48);
    } else {
      doc.setTextColor(0, 229, 160);
    }
    doc.text(f.severity, margin + 120, yPos + 5);
    
    // Status
    if (f.predicted) {
      doc.setTextColor(0, 198, 255);
      doc.setFont(undefined, 'bold');
      doc.text("PREDICTED", margin + 150, yPos + 5);
    }
    
    yPos += 7;
  });
  
  // Bottom border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  
  // ═══════════════════════════════════════════════════════════
  // AI RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════
  if (aiAdvice) {
    yPos += 15;
    
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFillColor(0, 198, 255);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text("🤖 AI CLINICAL RECOMMENDATIONS", margin + 5, yPos + 5.5);
    
    yPos += 15;
    
    // Summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text("Clinical Summary:", margin + 5, yPos);
    yPos += 5;
    
    doc.setFont(undefined, 'normal');
    const summaryLines = doc.splitTextToSize(aiAdvice.summary, pageWidth - 2 * margin - 10);
    doc.text(summaryLines, margin + 5, yPos);
    yPos += summaryLines.length * 5 + 8;
    
    // Urgency badge
    doc.setFont(undefined, 'bold');
    doc.text("Urgency Level:", margin + 5, yPos);
    
    // Urgency color box
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
    
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    // Precautions
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("⚠ Precautions:", margin + 5, yPos);
    yPos += 6;
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    aiAdvice.precautions.forEach((p, i) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(`${i + 1}. ${p}`, pageWidth - 2 * margin - 15);
      doc.text(lines, margin + 10, yPos);
      yPos += lines.length * 5 + 2;
    });
    
    yPos += 5;
    
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    // Medications
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("💊 Suggested Medications:", margin + 5, yPos);
    yPos += 6;
    
    doc.setFontSize(9);
    aiAdvice.medications.forEach((m, i) => {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
      
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
    
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    // Lifestyle
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("🌿 Lifestyle Recommendations:", margin + 5, yPos);
    yPos += 6;
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    aiAdvice.lifestyle.forEach((l, i) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      const lines = doc.splitTextToSize(`• ${l}`, pageWidth - 2 * margin - 15);
      doc.text(lines, margin + 10, yPos);
      yPos += lines.length * 5 + 2;
    });
    
    yPos += 5;
    
    if (yPos > 260) {
      doc.addPage();
      yPos = 20;
    }
    
    // Follow-up
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("📅 Follow-Up:", margin + 5, yPos);
    yPos += 5;
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    const followUpLines = doc.splitTextToSize(aiAdvice.followUp, pageWidth - 2 * margin - 10);
    doc.text(followUpLines, margin + 10, yPos);
  }
  
  // ═══════════════════════════════════════════════════════════
  // FOOTER - DISCLAIMER
  // ═══════════════════════════════════════════════════════════
  const footerY = pageHeight - 25;
  
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.setFont(undefined, 'italic');
  doc.text("⚠ IMPORTANT: This AI analysis is a decision support tool and must be reviewed by a qualified radiologist", margin, footerY + 5);
  doc.text("or physician before any clinical decision is made.", margin, footerY + 9);
  
  doc.setFont(undefined, 'normal');
  doc.setFontSize(6);
  doc.text("Model: DenseNet121 | Dataset: COVID-19 Radiography Database (21,165 images) | Accuracy: 91% | AUC: 98.7%", margin, footerY + 15);
  doc.text("Generated by PulmoAI - AI-Powered Pulmonary Diagnosis System", margin, footerY + 19);
  
  // Download
  const fileName = `PulmoAI_Report_${patientName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
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
          {["Features", "Model", "About"].map(l => (
            <span key={l} style={{ cursor: "pointer", transition: "color 0.2s" }}
              onMouseEnter={e => e.target.style.color = COLORS.accent}
              onMouseLeave={e => e.target.style.color = COLORS.muted}>{l}</span>
          ))}
        </div>
        <button onClick={() => setPage("app")} style={{
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
        }}>DenseNet121 · Grad-CAM · Explainable AI</div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontSize: "clamp(40px, 6vw, 80px)",
          fontWeight: 800, lineHeight: 1.05, margin: "0 0 24px",
          background: `linear-gradient(135deg, ${COLORS.text} 0%, ${COLORS.accent} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>AI-Powered<br />Pulmonary Diagnosis</h1>
        <p style={{ fontSize: 16, color: COLORS.muted, maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.7 }}>
          Detect 4 lung conditions from chest X-rays with deep learning. Visual Grad-CAM explanations
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

      <div style={{
        display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap",
        padding: "0 24px 80px", maxWidth: 700, margin: "0 auto",
      }}>
        {[
          { val: "4", label: "Disease Classes" },
          { val: "91%", label: "Accuracy" },
          { val: "DenseNet121", label: "Architecture" },
          { val: "Grad-CAM", label: "Explainability" },
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

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 100px" }}>
        <GlowLine />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 1, marginTop: 1 }}>
          {[
            { icon: "🦠", title: "COVID-19 Detection", desc: "Identifies COVID-19 patterns in chest X-rays with high sensitivity using fine-tuned DenseNet121." },
            { icon: "🗺️", title: "Grad-CAM Visualization", desc: "Heatmap overlays highlight regions influencing the model's decision, ensuring full clinical transparency." },
            { icon: "⚡", title: "Real-Time Inference", desc: "Fine-tuned DenseNet121 delivers results in seconds, optimized for clinical workflow speed." },
            { icon: "🏥", title: "4-Class Classification", desc: "Distinguishes between COVID-19, Viral Pneumonia, Lung Opacity, and Normal — all from a single X-ray." },
            { icon: "📊", title: "Confidence Scoring", desc: "Softmax probability scores per class help clinicians assess AI certainty and prioritize follow-up." },
            { icon: "🔒", title: "Secure & Private", desc: "Patient data and images never leave your system. Fully on-premise deployable with HIPAA-aligned design." },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ padding: "32px 28px", background: COLORS.panel, border: `1px solid ${COLORS.border}` }}>
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
        <div style={{
          width: 340, borderRight: `1px solid ${COLORS.border}`,
          background: COLORS.panel, display: "flex", flexDirection: "column",
          overflowY: "auto", flexShrink: 0,
        }}>
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
                  {showGradcam
                    ? <GradCAMOverlay imageUrl={imageUrl} gradcamB64={results?.gradcam} />
                    : <img src={imageUrl} alt="X-Ray" style={{ width: "100%", display: "block", borderRadius: 6, filter: "grayscale(100%) brightness(0.9)" }} />
                  }
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
                  <div style={{ fontSize: 11, color: COLORS.muted }}>PNG, JPG · Max 10MB</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {imageUrl && !analyzing && (
              <button onClick={analyze} style={{
                background: `linear-gradient(135deg, ${COLORS.accent2}, ${COLORS.accent})`,
                border: "none", color: "#fff", padding: "12px", borderRadius: 6,
                cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500,
              }}>Run AI Analysis</button>
            )}
            {results && (
              <button onClick={() => setShowGradcam(g => !g)} style={{
                background: showGradcam ? `${COLORS.warning}20` : "transparent",
                border: `1px solid ${showGradcam ? COLORS.warning : COLORS.border}`,
                color: showGradcam ? COLORS.warning : COLORS.muted,
                padding: "10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}>{showGradcam ? "◉ Grad-CAM On" : "○ Show Grad-CAM"}</button>
            )}
            {imageUrl && (
              <button onClick={reset} style={{
                background: "transparent", border: `1px solid ${COLORS.border}`,
                color: COLORS.muted, padding: "10px", borderRadius: 6,
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}>Clear & Reset</button>
            )}
          </div>

          <div style={{ marginTop: "auto", padding: "16px 20px", borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              Model Info
            </div>
            {[
              ["Architecture", "DenseNet121"],
              ["Training", "COVID-19 Radiography DB"],
              ["Total Images", "21,165"],
              ["Accuracy", "91%"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: COLORS.muted }}>{k}</span>
                <span style={{ color: COLORS.accent }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {!imageUrl && !analyzing && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 16,
              color: COLORS.muted, animation: "fadeUp 0.6s ease",
            }}>
              <div style={{ fontSize: 64, opacity: 0.3 }}>🫁</div>
              <div style={{ fontSize: 16, fontFamily: "'Syne', sans-serif", fontWeight: 700, opacity: 0.5 }}>No X-Ray Loaded</div>
              <div style={{ fontSize: 12, opacity: 0.4, textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
                Upload a chest X-ray image in the left panel to begin AI analysis with Grad-CAM explanation.
              </div>
            </div>
          )}

          {analyzing && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
              <Spinner />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, marginBottom: 6, fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>Analyzing X-Ray</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>Running DenseNet121 inference + Grad-CAM generation...</div>
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
                    }}>{i === 0 ? "⚡" : "○"}</div>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && !analyzing && (
            <div style={{ padding: 28, animation: "fadeUp 0.5s ease" }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                marginBottom: 24, flexWrap: "wrap", gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Diagnostic Report</div>
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
                      Confidence: {results.findings && results.findings.find(f => f.predicted)
                        ? (parseFloat(results.findings.find(f => f.predicted).confidence) * 100).toFixed(1)
                        : "–"}%
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
                  Class Probability Breakdown
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

              <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
                <button onClick={downloadPDF} style={{
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

          {imageUrl && !analyzing && !results && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: COLORS.muted }}>
              <div style={{ fontSize: 40 }}>✓</div>
              <div style={{ fontSize: 14, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: COLORS.text }}>X-Ray Loaded</div>
              <div style={{ fontSize: 12, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                Click <span style={{ color: COLORS.accent }}>"Run AI Analysis"</span> in the left panel to begin detection.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
