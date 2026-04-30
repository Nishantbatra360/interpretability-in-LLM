import sqlite3

conn = sqlite3.connect('backend/interpretability.db')
cursor = conn.cursor()

identities = ["male", "female", "black", "white", "asian", "latino"]

print("--- Identity Sample Counts (A=1) ---")
for ident in identities:
    cursor.execute(f"SELECT count(*) FROM evaluations WHERE {ident} > 0.5 AND status='evaluated'")
    count = cursor.fetchone()[0]
    print(f"{ident}: {count}")

print("\n--- Identity Sample Counts (A=0) ---")
for ident in identities:
    cursor.execute(f"SELECT count(*) FROM evaluations WHERE ({ident} <= 0.5 OR {ident} IS NULL) AND status='evaluated'")
    count = cursor.fetchone()[0]
    print(f"{ident}: {count}")

cursor.execute("SELECT count(*) FROM evaluations WHERE status='evaluated'")
total = cursor.fetchone()[0]
print(f"\nTotal evaluated: {total}")

conn.close()
