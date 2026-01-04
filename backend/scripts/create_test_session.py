#!/usr/bin/env python3
import os
import uuid
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

mongo = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'trafficwatch')
print('Using MONGO_URL=', mongo)
print('Using DB_NAME=', db_name)
client = MongoClient(mongo)
db = client[db_name]
user = {
    "id": str(uuid.uuid4()),
    "email": "test+autodelete@example.com",
    "name": "AutoDelete Test",
    "created_at": datetime.now(timezone.utc).isoformat()
}
res = db.users.insert_one(user)
print('Inserted user id', user['id'])
session_token = str(uuid.uuid4())
session = {
    "user_id": user['id'],
    "session_token": session_token,
    "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
    "created_at": datetime.now(timezone.utc).isoformat()
}
res2 = db.user_sessions.insert_one(session)
print('Inserted session token:', session_token)
print('Done')
