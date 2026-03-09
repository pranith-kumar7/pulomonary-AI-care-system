import os
import io
import re
import base64
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import tensorflow as tf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import requests as req

app = Flask(__name__)
CORS(app)

# ── CONFIG ────────────────────────────────────────────────────────────────────
MODEL_PATH = "densenet121_covid_final.keras"
OPENROUTER_API_KEY = "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"   # ← paste your key here

CLASSES = ["COVID", "Lung_Opacity", "Normal", "Viral Pneumonia"]
DISPLAY_NAMES = {
    "COVID": "COVID-19",
    "Lung_Opacity": "Lung Opacity",
    "Normal": "Normal",
    "Viral Pneumonia": "Viral Pneumonia",
}
SEVERITY = {
    "COVID": "High",
    "Lung_Opacity": "Moderate",
    "Normal": "Low",
    "Viral Pneumonia": "High",
}

# ── LOAD MODEL ────────────────────────────────────────────────────────────────
print("Loading model...")
model = tf.keras.models.load_model(MODEL_PATH, compile=False)
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
print("Model loaded ✓")


# ── GRAD-CAM ──────────────────────────────────────────────────────────────────
def get_gradcam_heatmap(model, img_array, pred_index=None):
    try:
        last_conv_layer = None
        for layer in reversed(model.layers):
            if isinstance(layer, tf.keras.layers.Conv2D):
                last_conv_layer = layer.name
                break
        if last_conv_layer is None:
            return None

        grad_model = tf.keras.models.Model(
            inputs=model.input,
            outputs=[model.get_layer(last_conv_layer).output, model.output]
        )

        img_tensor = tf.cast(img_array, tf.float32)
        with tf.GradientTape() as tape:
            tape.watch(img_tensor)
            conv_outputs, predictions = grad_model(img_tensor)
            tape.watch(conv_outputs)
            class_channel = predictions[:, pred_index]

        grads = tape.gradient(class_channel, conv_outputs)
        if grads is None:
            return None

        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        conv_outputs = conv_outputs[0]
        heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
        heatmap = tf.squeeze(heatmap)
        heatmap = tf.maximum(heatmap, 0) / (tf.math.reduce_max(heatmap) + 1e-8)
        return heatmap.numpy()
    except Exception as e:
        print(f"Grad-CAM error: {e}")
        return None


def overlay_gradcam(original_img, heatmap, alpha=0.4):
    heatmap_resized = np.uint8(255 * heatmap)
    jet = cm.get_cmap("jet")
    jet_colors = jet(np.arange(256))[:, :3]
    jet_heatmap = jet_colors[heatmap_resized]
    jet_heatmap = tf.keras.preprocessing.image.array_to_img(jet_heatmap)
    jet_heatmap = jet_heatmap.resize((original_img.shape[1], original_img.shape[0]))
    jet_heatmap = tf.keras.preprocessing.image.img_to_array(jet_heatmap)
    superimposed = jet_heatmap * alpha + original_img
    superimposed = np.clip(superimposed, 0, 255).astype(np.uint8)
    return superimposed


# ── PREDICT ROUTE ─────────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    print("✅ Predict request received!")
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    img = Image.open(file.stream).convert("RGB")
    img_resized = img.resize((224, 224))
    img_array = np.array(img_resized) / 255.0
    img_array = np.expand_dims(img_array, axis=0)

    preds = model.predict(img_array)[0]
    pred_index = int(np.argmax(preds))
    pred_class = CLASSES[pred_index]

    print(f"Raw predictions: {preds}")
    print(f"Predicted index: {pred_index}")
    print(f"Predicted class: {pred_class}")

    # Grad-CAM
    gradcam_b64 = None
    try:
        heatmap = get_gradcam_heatmap(model, img_array, pred_index)
        if heatmap is not None:
            original_arr = np.array(img_resized)
            overlaid = overlay_gradcam(original_arr, heatmap)
            pil_img = Image.fromarray(overlaid)
            buf = io.BytesIO()
            pil_img.save(buf, format="PNG")
            gradcam_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"Grad-CAM generation failed: {e}")

    findings = []
    for i, cls in enumerate(CLASSES):
        findings.append({
            "name": DISPLAY_NAMES[cls],
            "confidence": f"{float(preds[i]):.4f}",
            "severity": SEVERITY[cls],
            "predicted": i == pred_index,
        })

    return jsonify({
        "predicted": DISPLAY_NAMES[pred_class],
        "predicted_class_display": DISPLAY_NAMES[pred_class],
        "confidence": float(preds[pred_index]),
        "findings": findings,
        "gradcam": gradcam_b64,
        "model_version": "DenseNet121-COVID-v1.0",
    })


# ── AI ADVICE ROUTE (OpenRouter - Free, works in India) ───────────────────────
@app.route("/ai-advice", methods=["POST"])
def ai_advice():
    data = request.get_json()
    disease = data.get("disease", "")
    confidence = data.get("confidence", 0)
    findings = data.get("findings", [])

    predictions_text = ", ".join([
        f"{f['name']}: {float(f['confidence']) * 100:.1f}%"
        for f in findings
    ])

    prompt = f"""You are a clinical AI assistant helping a radiologist interpret a chest X-ray analysis result. A DenseNet121 model has analyzed the X-ray with the following results:

Primary Diagnosis: {disease} ({confidence:.1f}% confidence)
All predictions: {predictions_text}

Provide a structured clinical response in this exact JSON format only. No markdown, no text outside the JSON:
{{
  "summary": "2-3 sentence clinical summary of the condition",
  "urgency": "Low | Moderate | High | Critical",
  "precautions": [
    "Precaution 1",
    "Precaution 2",
    "Precaution 3",
    "Precaution 4",
    "Precaution 5"
  ],
  "medications": [
    {{"name": "Drug name", "dosage": "e.g. 500mg", "frequency": "e.g. twice daily", "purpose": "brief purpose"}},
    {{"name": "Drug name", "dosage": "...", "frequency": "...", "purpose": "..."}}
  ],
  "lifestyle": [
    "Lifestyle recommendation 1",
    "Lifestyle recommendation 2",
    "Lifestyle recommendation 3"
  ],
  "followUp": "When and what kind of follow-up is recommended"
}}

For Normal findings provide general wellness advice. For diseases provide clinically appropriate guidance."""

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "PulmoAI",
    }
    body = {
        "model": "google/gemma-3-4b-it:free",
        "messages": [{"role": "user", "content": prompt}],
    }

    resp = req.post("https://openrouter.ai/api/v1/chat/completions", json=body, headers=headers)
    result = resp.json()
    print("OpenRouter response:", result)

    if "choices" not in result:
        print("OpenRouter error:", result)
        return jsonify({"error": str(result)}), 500

    text = result["choices"][0]["message"]["content"]
    text = re.sub(r"```json|```", "", text).strip()
    match = re.search(r'\{[\s\S]*\}', text)
    advice_json = match.group(0) if match else "{}"

    return jsonify({"advice": advice_json})


# ── HEALTH CHECK ──────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL_PATH})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
