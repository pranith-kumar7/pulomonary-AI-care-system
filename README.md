# PulmoAI

PulmoAI is a React + Flask chest X-ray review application. This repo is now prepared for:

- `MongoDB Atlas` for authentication data
- `Render` for the Flask backend
- `Vercel` for the React frontend

## Project Layout

- `backend/` Flask API, model loading, auth, AI advice
- `pulmoai/` Vite React frontend

## Required Environment Variables

Backend on Render:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `OPENROUTER_API_KEY`
- `FRONTEND_ORIGIN`

Frontend on Vercel:

- `VITE_API_BASE_URL`

Example env files are included at:

- [backend/.env.example](/abs/path/c:/Users/prani/Pulmonary AI care system - Copy/backend/.env.example:1)
- [pulmoai/.env.example](/abs/path/c:/Users/prani/Pulmonary AI care system - Copy/pulmoai/.env.example:1)

## Deploy Order

1. Create a MongoDB Atlas cluster.
2. Create a database user and copy the Python connection string.
3. Deploy the backend to Render from this repo using [render.yaml](/abs/path/c:/Users/prani/Pulmonary AI care system - Copy/render.yaml:1).
4. Set `MONGODB_URI`, `MONGODB_DB_NAME`, `OPENROUTER_API_KEY`, and `FRONTEND_ORIGIN` in Render.
5. Deploy the frontend from the `pulmoai/` directory to Vercel using [pulmoai/vercel.json](/abs/path/c:/Users/prani/Pulmonary AI care system - Copy/pulmoai/vercel.json:1).
6. Set `VITE_API_BASE_URL` in Vercel to your Render backend URL.
7. Update `FRONTEND_ORIGIN` in Render to your final Vercel domain and redeploy if needed.

## Local Development

Backend:

```powershell
cd backend
pip install -r requirements.txt
python app.py
```

Frontend:

```powershell
cd pulmoai
npm install
npm run dev
```
