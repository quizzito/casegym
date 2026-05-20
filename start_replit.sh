#!/bin/bash
set -e

echo "→ Installing Python dependencies..."
cd backend
pip install -r requirements.txt -q

echo "→ Installing frontend dependencies..."
cd ../frontend
npm install --silent

echo "→ Building React frontend..."
npm run build

echo "→ Starting CaseGym..."
cd ../backend
uvicorn main:app --host 0.0.0.0 --port 8080