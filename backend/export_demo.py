import os
import json
import sqlite3
from pathlib import Path

# Paths
BACKEND_DIR = Path(__file__).parent
DB_PATH = BACKEND_DIR / "interpretability.db"
EXPORT_DIR = BACKEND_DIR.parent / "frontend" / "public" / "demo_data"

def robust_json_parse(text):
    if not text: return {}
    if isinstance(text, dict): return text
    try: return json.loads(text)
    except: return {}

def extract_tokens(row):
    """Deep search for tokens in any possible column/JSON structure"""
    # 1. Try tokens_json
    t_json = robust_json_parse(row.get("tokens_json", "{}"))
    tokens = t_json.get("tokens", [])
    
    # 2. Try identity_response if tokens is empty
    if not tokens and row.get("identity_response"):
        id_resp = robust_json_parse(row["identity_response"])
        tokens = id_resp.get("tokens", [])
        
    # 3. Try raw_response inside tokens_json
    if not tokens and "raw_response" in t_json:
        raw_resp = robust_json_parse(t_json["raw_response"])
        tokens = raw_resp.get("tokens", [])
        
    return tokens

def export_to_json():
    print("Starting Deep Search Demo Data Export...")
    
    if not EXPORT_DIR.exists():
        EXPORT_DIR.mkdir(parents=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # 1. Export Files List
        cursor.execute("SELECT id, filename, upload_time FROM uploaded_files")
        files = [dict(row) for row in cursor.fetchall()]
        with open(EXPORT_DIR / "files.json", "w") as f:
            json.dump(files, f, indent=2)

        processed_comments = []

        for file_info in files:
            file_id = file_info["id"]
            print(f"Exporting Deep Audit for: {file_info['filename']}")

            # 2. Export Evaluated Comments (Top 100)
            cursor.execute("SELECT * FROM evaluations WHERE file_id = ? AND status = 'evaluated' LIMIT 100", (file_id,))
            rows = cursor.fetchall()
            
            file_comments = []
            for row in rows:
                c = dict(row)
                tokens = extract_tokens(c)
                c["tokens_json"] = json.dumps({"tokens": tokens})
                c["ground_truth_label"] = "Toxic" if (c.get("target") or 0) > 0.5 else "Non-Toxic"
                
                # Mock sub-types for demo if they are missing
                is_toxic = (c.get("target") or 0) > 0.5
                c["severe_toxicity"] = c.get("severe_toxicity") or (0.4 if is_toxic and "suck" in c["text"].lower() else 0.0)
                c["obscene"] = c.get("obscene") or (0.7 if is_toxic and "haha" in c["text"].lower() else 0.0)
                c["threat"] = c.get("threat") or (0.5 if is_toxic and "threat" in c["text"].lower() else 0.0)
                c["insult"] = c.get("insult") or (0.8 if is_toxic and "losers" in c["text"].lower() else 0.0)
                c["identity_attack"] = c.get("identity_attack") or (0.3 if is_toxic and "muslim" in c["text"].lower() else 0.0)
                c["sexual_explicit"] = c.get("sexual_explicit") or 0.0
                
                file_comments.append(c)
                processed_comments.append(c)

            with open(EXPORT_DIR / f"evaluated_comments_{file_id}.json", "w") as f:
                json.dump(file_comments, f, indent=2)

            # 3. Export Summary Stats
            cursor.execute("SELECT COUNT(*) as count FROM evaluations WHERE file_id = ? AND status = 'evaluated'", (file_id,))
            eval_count = cursor.fetchone()["count"]
            toxic_count = sum(1 for c in file_comments if c["predicted_classification"] == "Toxic")
            
            state = {
                "evaluated_count": eval_count, "pending_count": 0,
                "stats": {
                    "toxic": toxic_count, "non_toxic": eval_count - toxic_count, "total": eval_count,
                    "confidence_bins": [0, 2, 5, 10, 15, 20, 25, 15, 5, 3]
                }
            }
            with open(EXPORT_DIR / f"file_state_{file_id}.json", "w") as f:
                json.dump(state, f, indent=2)

            # 4. EXPORT REAL METRICS
            print(f"  Calculating Fairness Metrics for {file_info['filename']}...")
            
            # Calculate Overall Metrics
            cursor.execute("SELECT predicted_classification, target FROM evaluations WHERE file_id = ? AND status='evaluated'", (file_id,))
            all_m_rows = cursor.fetchall()
            
            overall_metrics = {"accuracy": 0, "f1": 0, "precision": 0, "recall": 0, "total": len(all_m_rows)}
            if all_m_rows:
                tp = sum(1 for r in all_m_rows if r[0] == "Toxic" and r[1] > 0.5)
                tn = sum(1 for r in all_m_rows if r[0] == "Non-Toxic" and r[1] <= 0.5)
                fp = sum(1 for r in all_m_rows if r[0] == "Toxic" and r[1] <= 0.5)
                fn = sum(1 for r in all_m_rows if r[0] == "Non-Toxic" and r[1] > 0.5)
                
                overall_metrics["accuracy"] = (tp + tn) / len(all_m_rows)
                precision = tp / (tp + fp) if (tp + fp) > 0 else 0
                recall = tp / (tp + fn) if (tp + fn) > 0 else 0
                overall_metrics["precision"] = precision
                overall_metrics["recall"] = recall
                overall_metrics["tpr"] = recall
                overall_metrics["f1"] = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
                overall_metrics["count"] = len(all_m_rows)
                overall_metrics["ppr"] = sum(1 for r in all_m_rows if r[0] == "Toxic") / len(all_m_rows)
                overall_metrics["fpr"] = fp / (fp + tn) if (fp + tn) > 0 else 0

            identities = ["male", "female", "christian", "jewish", "muslim", "threat_group"]
            metrics_results = []
            
            for ident in identities:
                cursor.execute(f"SELECT COUNT(*) FROM evaluations WHERE file_id = ? AND {ident} > 0.5", (file_id,))
                count = cursor.fetchone()[0]
                if count < 1: continue

                cursor.execute(f"SELECT predicted_classification, target FROM evaluations WHERE file_id = ? AND {ident} > 0.5 AND status='evaluated'", (file_id,))
                m_rows = cursor.fetchall()
                if not m_rows: continue
                
                a1_toxic = sum(1 for r in m_rows if r[0] == "Toxic")
                a1_total = len(m_rows)
                
                # Mock SPD/EOpp for demo if real ones are flat (or use real logic)
                ppr_overall = sum(1 for r in all_m_rows if r[0] == "Toxic") / len(all_m_rows) if all_m_rows else 0
                spd = (a1_toxic / a1_total) - ppr_overall
                
                target_toxic_count = max(sum(1 for r in m_rows if r[1] > 0.5), 1)
                eopp = (sum(1 for r in m_rows if r[0] == "Toxic" and r[1] > 0.5) / target_toxic_count) - (tp / max(tp+fn, 1))
                
                # Calculate a0 (everyone else)
                cursor.execute(f"SELECT predicted_classification, target FROM evaluations WHERE file_id = ? AND {ident} <= 0.5 AND status='evaluated'", (file_id,))
                a0_rows = cursor.fetchall()
                a0_toxic = sum(1 for r in a0_rows if r[0] == "Toxic")
                a0_total = max(len(a0_rows), 1)
                a0_tp = sum(1 for r in a0_rows if r[0] == "Toxic" and r[1] > 0.5)
                a0_fp = sum(1 for r in a0_rows if r[0] == "Toxic" and r[1] <= 0.5)
                a0_fn = sum(1 for r in a0_rows if r[0] == "Non-Toxic" and r[1] > 0.5)
                a0_tn = sum(1 for r in a0_rows if r[0] == "Non-Toxic" and r[1] <= 0.5)
                
                a1_tp = sum(1 for r in m_rows if r[0] == "Toxic" and r[1] > 0.5)
                a1_fp = sum(1 for r in m_rows if r[0] == "Toxic" and r[1] <= 0.5)
                a1_fn = sum(1 for r in m_rows if r[0] == "Non-Toxic" and r[1] > 0.5)
                a1_tn = sum(1 for r in m_rows if r[0] == "Non-Toxic" and r[1] <= 0.5)

                cursor.execute(f"SELECT * FROM evaluations WHERE file_id = ? AND {ident} > 0.5 AND status='evaluated' LIMIT 3", (file_id,))
                s_rows = cursor.fetchall()
                samples = []
                for s_row in s_rows:
                    s = dict(s_row)
                    tkns = extract_tokens(s)
                    samples.append({
                        "text": s["text"], "truth": "Toxic" if s["target"] > 0.5 else "Non-Toxic",
                        "predicted": s["predicted_classification"], "type": "DISPARATE IMPACT" if abs(spd) > 0.1 else "CORRECT",
                        "tokens": tkns, "toxicity_rationale": s["toxicity_rationale"]
                    })

                metrics_results.append({
                    "name": ident, "count": a1_total, "spd": round(spd, 3), "eopp": round(eopp, 3), "di": (a1_toxic/a1_total)/(a0_toxic/a0_total) if a0_toxic > 0 else 1.0,
                    "a1": {"ppr": round(a1_toxic/a1_total, 3), "tpr": round(a1_tp/max(a1_tp+a1_fn, 1), 3), "fpr": round(a1_fp/max(a1_fp+a1_tn, 1), 3), "tp": a1_tp, "fp": a1_fp, "tn": a1_tn, "fn": a1_fn},
                    "a0": {"ppr": round(a0_toxic/a0_total, 3), "tpr": round(a0_tp/max(a0_tp+a0_fn, 1), 3), "fpr": round(a0_fp/max(a0_fp+a0_tn, 1), 3), "tp": a0_tp, "fp": a0_fp, "tn": a0_tn, "fn": a0_fn},
                    "samples": samples,
                    "fp_word_cloud": [{"text": "dummy", "value": 10}]
                })

            # Calculate Worst Case
                worst_spd = max(metrics_results, key=lambda x: abs(x["spd"])) if metrics_results else {"name": "None", "spd": 0}
                worst_eopp = max(metrics_results, key=lambda x: abs(x["eopp"])) if metrics_results else {"name": "None", "eopp": 0}

                with open(EXPORT_DIR / f"metrics_{file_id}.json", "w") as f:
                    json.dump({
                        "overall": overall_metrics,
                        "subgroups": metrics_results, 
                        "worst_case": {
                            "max_spd": {"identity": worst_spd.get("name", "None"), "value": worst_spd.get("spd", 0)},
                            "max_eopp": {"identity": worst_eopp.get("name", "None"), "value": worst_eopp.get("eopp", 0)}
                        }
                    }, f, indent=2)

        # 5. Export Deep Dive Static Sample (Preferred Default)
        featured_sample = {
            "id": 999,
            "text": "You are a good person with bad choices",
            "predicted_classification": "Non-Toxic",
            "confidence": 0.95,
            "rationale": "The text expresses a negative opinion about someone's choices, but does so in a non-attacking and somewhat empathetic manner.",
            "tokens_json": json.dumps({"tokens": [
                {"token": "You", "toxic_score": 0, "safe_score": 0, "attribution": 0},
                {"token": "are", "toxic_score": 0, "safe_score": 0, "attribution": 0},
                {"token": "a", "toxic_score": 0, "safe_score": 0, "attribution": 0},
                {"token": "good", "toxic_score": 0, "safe_score": 0.8, "attribution": -0.8},
                {"token": "person", "toxic_score": 0, "safe_score": 0.4, "attribution": -0.4},
                {"token": "with", "toxic_score": 0, "safe_score": 0, "attribution": 0},
                {"token": "bad", "toxic_score": 0.4, "safe_score": 0, "attribution": 0.4},
                {"token": "choices", "toxic_score": 0.2, "safe_score": 0, "attribution": 0.2}
            ]}),
            "debug_data": {
                "deep_dive_prompt": "You are an AI interpretability auditor performing a DETAILED token-level analysis...",
                "deep_dive_raw_response": "{\"classification\": \"Non-Toxic\", \"confidence\": 0.95, ...}"
            }
        }
        
        with open(EXPORT_DIR / "deep_dive_sample.json", "w") as f:
            json.dump(featured_sample, f, indent=2)

        print(f"DONE! Static Assets fully populated in: {EXPORT_DIR}")

    finally:
        conn.close()

if __name__ == "__main__":
    export_to_json()
