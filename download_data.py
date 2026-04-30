import pandas as pd
from datasets import load_dataset

print("Loading the civil_comments dataset...")
# Load only a subset (e.g. first 10000 rows of train) to save time and space
dataset = load_dataset("google/civil_comments", split="train[:10000]")

print("Converting to pandas DataFrame...")
df = dataset.to_pandas()

output_path = "backend/data/civil_comments_sample.csv"
print(f"Saving {len(df)} rows to {output_path}...")
df.to_csv(output_path, index=False)

print("Done! Here is a preview of the data:")
print(df.head())
