import sqlite3

DB_PATH = './database/asset.db'

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("SELECT id, name FROM devices LIMIT 10")
rows = cursor.fetchall()

if rows:
    print("Available devices:")
    for row in rows:
        print(f"ID: {row[0]}, Name: {row[1]}")
else:
    print("No devices found in the database")

conn.close()