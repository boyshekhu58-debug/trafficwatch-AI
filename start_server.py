# Small startup wrapper to ensure imports work correctly in all environments
import os
import sys

# Ensure repo root is on sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Import the FastAPI app
from backend.server import app

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('PORT', os.environ.get('PORT', '8000')))
    uvicorn.run(app, host='0.0.0.0', port=port)
