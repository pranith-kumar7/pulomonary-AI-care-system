import base64
import io
import os
import re
import secrets
from functools import wraps

import matplotlib
import matplotlib.cm as cm
import numpy as np
import requests as req
import tensorflow as tf
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from PIL import Image
from pymongo import MongoClient
from pymongo.server_api import ServerApi
from werkzeug.security import check_password_hash, generate_password_hash

matplotlib.use("Agg")

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "densenet121_covid_final.keras")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "pulmoai")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")
PORT = int(os.getenv("PORT", "5000"))

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": [origin.strip() for origin in FRONTEND_ORIGIN.split(",")]}}
    if FRONTEND_ORIGIN != "*"
    else {r"/*": {"origins": "*"}},
)


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


def create_mongo_database():
    if not MONGODB_URI:
        raise RuntimeError("MONGODB_URI is not set. Add your MongoDB Atlas connection string.")

    client = MongoClient(MONGODB_URI, server_api=ServerApi("1"))
    database = client[MONGODB_DB_NAME]
    database.users.create_index("email", unique=True)
    database.sessions.create_index("token", unique=True)
    database.sessions.create_index("user_id")
    return database


mongo_db = create_mongo_database()

print("Loading model...")
model = tf.keras.models.load_model(MODEL_PATH, compile=False)
model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
print("Model loaded")


def serialize_user(user_document):
    return {
        "id": str(user_document["_id"]),
        "fullName": user_document["full_name"],
        "email": user_document["email"],
    }


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    mongo_db.sessions.insert_one({"token": token, "user_id": user_id})
    return token


def get_authenticated_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None, None

    session_document = mongo_db.sessions.find_one({"token": token})
    if not session_document:
        return None, None

    user_document = mongo_db.users.find_one({"_id": session_document["user_id"]})
    return (user_document, token) if user_document else (None, None)


def require_auth(route_handler):
    @wraps(route_handler)
    def wrapper(*args, **kwargs):
        user_document, token = get_authenticated_user()
        if not user_document:
            return jsonify({"error": "Authentication required"}), 401

        g.current_user = user_document
        g.current_token = token
        return route_handler(*args, **kwargs)

    return wrapper


def get_gradcam_heatmap(current_model, img_array, pred_index=None):
    try:
        last_conv_layer = None
        for layer in reversed(current_model.layers):
            if isinstance(layer, tf.keras.layers.Conv2D):
                last_conv_layer = layer.name
                break
        if last_conv_layer is None:
            return None

        grad_model = tf.keras.models.Model(
            inputs=current_model.input,
            outputs=[current_model.get_layer(last_conv_layer).output, current_model.output],
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
    except Exception as exc:
        print(f"Grad-CAM error: {exc}")
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
    return np.clip(superimposed, 0, 255).astype(np.uint8)


@app.route("/auth/signup", methods=["POST"])
def sign_up():
    data = request.get_json() or {}
    full_name = (data.get("fullName") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if len(full_name) < 2:
        return jsonify({"error": "Full name must be at least 2 characters"}), 400
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "Please enter a valid email address"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if mongo_db.users.find_one({"email": email}):
        return jsonify({"error": "An account with this email already exists"}), 409

    user_result = mongo_db.users.insert_one(
        {
            "full_name": full_name,
            "email": email,
            "password_hash": generate_password_hash(password),
        }
    )
    user_document = mongo_db.users.find_one({"_id": user_result.inserted_id})
    token = create_session(user_document["_id"])
    return jsonify({"token": token, "user": serialize_user(user_document)}), 201


@app.route("/auth/signin", methods=["POST"])
def sign_in():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user_document = mongo_db.users.find_one({"email": email})
    if not user_document or not check_password_hash(user_document["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_session(user_document["_id"])
    return jsonify({"token": token, "user": serialize_user(user_document)}), 200


@app.route("/auth/me", methods=["GET"])
@require_auth
def auth_me():
    return jsonify({"user": serialize_user(g.current_user)}), 200


@app.route("/auth/logout", methods=["POST"])
@require_auth
def logout():
    mongo_db.sessions.delete_one({"token": g.current_token})
    return jsonify({"message": "Logged out successfully"}), 200


@app.route("/predict", methods=["POST"])
@require_auth
def predict():
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

    gradcam_b64 = None
    try:
        heatmap = get_gradcam_heatmap(model, img_array, pred_index)
        if heatmap is not None:
            original_arr = np.array(img_resized)
            overlaid = overlay_gradcam(original_arr, heatmap)
            pil_img = Image.fromarray(overlaid)
            buffer = io.BytesIO()
            pil_img.save(buffer, format="PNG")
            gradcam_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as exc:
        print(f"Grad-CAM generation failed: {exc}")

    findings = []
    for index, class_name in enumerate(CLASSES):
        findings.append(
            {
                "name": DISPLAY_NAMES[class_name],
                "confidence": f"{float(preds[index]):.4f}",
                "severity": SEVERITY[class_name],
                "predicted": index == pred_index,
            }
        )

    return jsonify(
        {
            "predicted": DISPLAY_NAMES[pred_class],
            "predicted_class_display": DISPLAY_NAMES[pred_class],
            "confidence": float(preds[pred_index]),
            "findings": findings,
            "gradcam": gradcam_b64,
            "model_version": "DenseNet121-COVID-v1.0",
        }
    )


@app.route("/ai-advice", methods=["POST"])
@require_auth
def ai_advice():
    if not OPENROUTER_API_KEY:
        return jsonify({"error": "OPENROUTER_API_KEY is not configured"}), 500

    data = request.get_json() or {}
    disease = data.get("disease", "")
    confidence = data.get("confidence", 0)
    findings = data.get("findings", [])

    predictions_text = ", ".join(
        [f"{finding['name']}: {float(finding['confidence']) * 100:.1f}%" for finding in findings]
    )

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
        "HTTP-Referer": FRONTEND_ORIGIN.split(",")[0] if FRONTEND_ORIGIN != "*" else "http://localhost:5173",
        "X-Title": "PulmoAI",
    }
    body = {
        "model": "google/gemma-3-4b-it:free",
        "messages": [{"role": "user", "content": prompt}],
    }

    response = req.post(
        "https://openrouter.ai/api/v1/chat/completions",
        json=body,
        headers=headers,
        timeout=60,
    )
    result = response.json()

    if "choices" not in result:
        return jsonify({"error": str(result)}), 500

    text = result["choices"][0]["message"]["content"]
    text = re.sub(r"```json|```", "", text).strip()
    match = re.search(r"\{[\s\S]*\}", text)
    advice_json = match.group(0) if match else "{}"
    return jsonify({"advice": advice_json})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": os.path.basename(MODEL_PATH), "database": MONGODB_DB_NAME})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=PORT)
