"""Start script placed inside `backend/` so Render's default working dir can find it.
This simply imports `app` from `server.py` and runs Uvicorn.
"""
import os

from server import app

if __name__ == '__main__':
    import uvicorn
    port = int(os.environ.get('PORT', '8000'))
    uvicorn.run(app, host='0.0.0.0', port=port)
