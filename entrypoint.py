# Lightweight entrypoint to make the backend importable from repo root
import sys
import os

# Ensure repo root is on sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Import app from backend package
from backend.server import app
