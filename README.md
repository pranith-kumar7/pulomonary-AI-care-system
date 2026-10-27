# PulmoAI

PulmoAI is an experimental chest X-ray review application with a React frontend and Flask API. It uses a DenseNet121 model for four-class image classification and can request optional AI-generated explanatory content.

**Important:** This is a portfolio project, not a medical device. Model outputs and generated content are not a diagnosis and must not be used to make treatment decisions.

## Project layout

- `backend/` — Flask API, model inference, authentication, and optional AI advice
- `pulmoai/` — Vite + React frontend
- `render.yaml` — Render backend service configuration
- `pulmoai/vercel.json` — Vercel frontend configuration

## Environment variables

Configure these on the backend host:

- `MONGODB_URI` — MongoDB connection string
- `MONGODB_DB_NAME` — database name (defaults to `pulmoai`)
- `OPENROUTER_API_KEY` — optional key for AI-generated advice
- `OPENROUTER_MODEL` — optional model override
- `OPENROUTER_FALLBACK_MODELS` — optional comma-separated fallback models
- `FRONTEND_ORIGIN` — allowed frontend origin(s)
- `PORT` — server port (defaults to `5000`)

The backend environment template is [`backend/.env.example`](backend/.env.example). Do not commit real credentials.

For the Vite frontend, create a local `pulmoai/.env.local` containing:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Set `VITE_API_BASE_URL` to the deployed backend URL in the Vercel project settings.

## Run locally

### Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python app.py
```

The API defaults to `http://localhost:5000`. A valid model file and any required database configuration must be available for the relevant features.

### Frontend

In a separate terminal:

```powershell
cd pulmoai
npm install
npm run dev
```

Vite prints the local frontend URL when the development server starts.

## Deployment outline

1. Create a MongoDB database and configure the backend environment variables.
2. Deploy the `backend/` directory to Render using [`render.yaml`](render.yaml).
3. Deploy the `pulmoai/` directory to Vercel using [`pulmoai/vercel.json`](pulmoai/vercel.json).
4. Set `VITE_API_BASE_URL` in Vercel to the deployed API URL.
5. Set `FRONTEND_ORIGIN` on the backend to the exact deployed frontend origin and verify CORS.
6. Test authentication, image upload, model inference, and the health endpoint after deployment.

## Model evaluation and limitations

Before making performance claims, document the dataset source, train/validation/test split, preprocessing, class-wise precision/recall/F1, and confusion matrix. Avoid data leakage between splits. Predictions may be wrong and should be reviewed by qualified medical professionals.

## Current limitations

- This README does not claim a verified clinical performance level.
- AI advice requires a configured external provider; provider responses may be unavailable or incorrect.
- Deployment status and live endpoints should be verified before sharing as a working demo.
