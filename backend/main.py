"""
AIZEN Backend Entrypoint for Render / Production Deployment.
Exposes the FastAPI `app` object so `uvicorn main:app` runs cleanly
from inside the `backend/` directory or as a module.
"""

import os
import sys
from pathlib import Path

# Ensure repository root and backend dir are in sys.path
CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

# Import the FastAPI application from backend.app.main
from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port)
