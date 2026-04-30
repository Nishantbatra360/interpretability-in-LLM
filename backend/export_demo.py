import os
import json
import sqlite3
from pathlib import Path

# Paths
BACKEND_DIR = Path(__file__).parent
DB_PATH = BACKEND_DIR / "interpretability.db"
EXPORT_DIR = BACKEND_DIR.parent / "frontend" / "public" / "demo_data"

def export_to_json():
    print("Starting Demo Data Export...")
    
    if not EXPORT_DIR.exists():
        EXPORT_DIR.mkdir(parents=True)
        print(f"Created directory: {EXPORT_DIR}")

    # Connect to DB
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # 1. Export Files List
        print("Exporting File List...")
        cursor.execute("SELECT id, filename, upload_time FROM uploaded_files")
        files = [dict(row) for row in cursor.fetchall()]
        # Convert datetime objects to string if necessary, but SQLite stores them as strings usually
        with open(EXPORT_DIR / "files.json", "w") as f:
            json.dump(files, f, indent=2)

        for file_info in files:
            file_id = file_info["id"]
            print(f"Exporting Data for File ID: {file_id} ({file_info['filename']})...")

            # 2. Export Evaluated Comments (Top 100)
            cursor.execute("""
                SELECT * FROM evaluations 
                WHERE file_id = ? AND status = 'evaluated' 
                ORDER BY id DESC LIMIT 100
            """, (file_id,))
            comments = [dict(row) for row in cursor.fetchall()]
            with open(EXPORT_DIR / f"evaluated_comments_{file_id}.json", "w") as f:
                json.dump(comments, f, indent=2)

            # 3. Export Summary Stats
            cursor.execute("SELECT COUNT(*) as count FROM evaluations WHERE file_id = ? AND status = 'evaluated'", (file_id,))
            eval_count = cursor.fetchone()["count"]
            cursor.execute("SELECT COUNT(*) as count FROM evaluations WHERE file_id = ? AND status = 'pending'", (file_id,))
            pending_count = cursor.fetchone()["count"]
            
            # Simple stats calc for the state
            toxic_count = sum(1 for c in comments if c["predicted_classification"] == "Toxic")
            
            state = {
                "evaluated_count": eval_count,
                "pending_count": pending_count,
                "stats": {
                    "toxic": toxic_count,
                    "non_toxic": eval_count - toxic_count,
                    "total": eval_count,
                    "confidence_bins": [0] * 10
                }
            }
            with open(EXPORT_DIR / f"file_state_{file_id}.json", "w") as f:
                json.dump(state, f, indent=2)

        print(f"Export Complete! Data saved in: {EXPORT_DIR}")

    finally:
        conn.close()

if __name__ == "__main__":
    export_to_json()
