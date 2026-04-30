import sqlite3

conn = sqlite3.connect('backend/interpretability.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT * FROM evaluations LIMIT 1")
row = cursor.fetchone()

if row:
    print("--- Column Values for First Row ---")
    for key in row.keys():
        print(f"{key}: {row[key]}")
else:
    print("No evaluations found.")

conn.close()
