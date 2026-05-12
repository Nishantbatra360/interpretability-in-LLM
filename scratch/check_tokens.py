import sqlite3
import os

db_path = "backend/interpretability.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, text, tokens_json FROM evaluations WHERE tokens_json IS NOT NULL AND tokens_json NOT LIKE '%\"tokens\": []%' LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(f"ID: {row[0]}")
        print(f"Text: {row[1][:50]}...")
        # print(f"Tokens: {row[2][:100]}...")
    conn.close()
else:
    print("DB not found")
