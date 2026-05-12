import json
from pathlib import Path

DATA_DIR = Path("frontend/public/demo_data")
SAMPLE_PATH = DATA_DIR / "deep_dive_sample.json"

if SAMPLE_PATH.exists():
    with open(SAMPLE_PATH, "r") as f:
        data = json.load(f)
    
    # Inject dummy tokens for better demo visualization
    text = data.get("text", "")
    words = text.split()
    tokens = []
    for i, word in enumerate(words):
        # Semi-random attribution to make it look realistic
        attr = 0.0
        if "cool" in word.lower(): attr = 0.4
        if "mother" in word.lower(): attr = 0.2
        if "idea" in word.lower(): attr = 0.3
        if "done" in word.lower(): attr = 0.5
        if "suck" in word.lower(): attr = 0.8
        if "fuck" in word.lower(): attr = 0.9
        
        tokens.append({"token": word + " ", "attribution": attr})
    
    data["tokens_json"] = json.dumps({"tokens": tokens})
    
    with open(SAMPLE_PATH, "w") as f:
        json.dump(data, f, indent=2)
    print("Injected tokens into deep_dive_sample.json")
else:
    print("Sample not found")
