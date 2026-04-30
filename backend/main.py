import os
import json
import time
import math
import io
import asyncio
import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer
from database import SessionLocal, CommentEvaluation, UploadedFile

load_dotenv()

app = FastAPI(title="Interpretability API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NVIDIA_NIM_API_KEY = os.getenv("nvidia_api")
NIM_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Simple in-memory TTL cache
_cache = {}
CACHE_TTL = 10 

def cache_get(key):
    entry = _cache.get(key)
    if entry and (time.time() - entry['ts']) < CACHE_TTL:
        return entry['val']
    return None

def cache_set(key, val):
    _cache[key] = {'val': val, 'ts': time.time()}

def cache_invalidate_prefix(prefix):
    keys = [k for k in _cache if k.startswith(prefix)]
    for k in keys:
        del _cache[k]

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class ClassificationRequest(BaseModel):
    text: str
    model: str = "meta/llama-3.1-8b-instruct"

class BatchEvaluateRequest(BaseModel):
    file_id: int
    batch_size: int = Field(default=10, ge=1, le=35)
    model: str = "meta/llama-3.1-8b-instruct"

@app.get("/")
def read_root():
    return {"message": "Interpretability API is running."}

@app.get("/files")
def list_files(db: Session = Depends(get_db)):
    files = db.query(UploadedFile).all()
    return [{"id": f.id, "filename": f.filename, "upload_time": f.upload_time} for f in files]

@app.delete("/files/{file_id}")
def delete_file(file_id: int, db: Session = Depends(get_db)):
    file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(file)
    db.commit()
    return {"message": "File and associated comments deleted."}

@app.post("/upload-csv")
async def upload_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV.")

    contents = await file.read()
    try:
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        df.columns = [str(c).strip().lower() for c in df.columns]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    uploaded_file = UploadedFile(filename=file.filename)
    db.add(uploaded_file)
    db.commit()
    db.refresh(uploaded_file)

    inserted_count = 0
    for _, row in df.iterrows():
        text_val = row.get('text') or row.get('comment') or row.get('comment_text')
        if pd.isna(text_val) or not str(text_val).strip(): continue
        
        target_val = -1.0
        for col in ['toxicity', 'target', 'label']:
            if col in df.columns:
                try:
                    val = row[col]
                    target_val = float(val) if not pd.isna(val) else -1.0
                    break
                except: pass

        evaluation = CommentEvaluation(
            file_id=uploaded_file.id,
            text=str(text_val).strip(),
            target=target_val,
            status="pending"
        )
        db.add(evaluation)
        inserted_count += 1

    db.commit()
    return {"message": f"Uploaded {inserted_count} comments.", "file_id": uploaded_file.id}

@app.get("/file-state/{file_id}")
def get_file_state(file_id: int, db: Session = Depends(get_db)):
    cache_key = f"file-state:{file_id}"
    cached = cache_get(cache_key)
    if cached is not None: return cached
    file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not file: return {"error": "File not found"}

    row = db.query(
        func.sum((CommentEvaluation.status == "pending").cast(Integer)).label("pending"),
        func.sum((CommentEvaluation.status == "evaluated").cast(Integer)).label("evaluated"),
        func.count(CommentEvaluation.id).label("total")
    ).filter(CommentEvaluation.file_id == file_id).one()

    pending_count = int(row.pending or 0)
    evaluated_count = int(row.evaluated or 0)
    total_count = int(row.total or 0)

    comments = []
    stats = {"toxic": 0, "non_toxic": 0, "total": evaluated_count, "confidence_bins": [0]*10}
    # Refined auto-reset: only target truly empty responses (API failures)
    all_evaluated = db.query(CommentEvaluation).filter(
        CommentEvaluation.file_id == file_id,
        CommentEvaluation.status == "evaluated"
    ).all()
    
    ghosts = [g for g in all_evaluated if (
        not g.tokens_json or 
        '"raw_response": ""' in g.tokens_json
    )]
    
    if ghosts:
        for g in ghosts: g.status = "pending"
        db.commit()
        # Invalidate caches to reflect the reset
        cache_invalidate_prefix(f"file-state:{file_id}")
        cache_invalidate_prefix(f"evaluated-comments:{file_id}")
        cache_invalidate_prefix(f"metrics:{file_id}")

    if evaluated_count > 0:
        stats["toxic"] = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated", CommentEvaluation.predicted_classification == "Toxic").count()
        stats["non_toxic"] = evaluated_count - stats["toxic"]
        
        all_conf = db.query(CommentEvaluation.confidence).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated").all()
        for (c,) in all_conf:
            if c is not None:
                idx = min(int(c * 10), 9)
                stats["confidence_bins"][idx] += 1

        rows = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated").order_by(CommentEvaluation.id.desc()).limit(100).all()
        comments = [{
            "id": c.id, "text": c.text, "predicted_classification": c.predicted_classification,
            "confidence": c.confidence, "tokens_json": c.tokens_json, "target": c.target,
            "ground_truth_label": "Toxic" if c.target != -1.0 and c.target > 0.5 else "Non-Toxic" if c.target != -1.0 else None,
            "severe_toxicity": c.severe_toxicity, "obscene": c.obscene, "threat": c.threat, "insult": c.insult,
            "identity_prompt": c.identity_prompt, "identity_response": c.identity_response
        } for c in rows]

    result = {
        "id": file.id, "filename": file.filename, "total": total_count,
        "pending": pending_count, "evaluated": evaluated_count,
        "comments": comments, "stats": stats
    }
    cache_set(cache_key, result)
    return result

def robust_json_parse(raw_text: str):
    import re
    match = re.search(r'(\[.*\]|\{.*\})', raw_text, re.DOTALL)
    if not match: return None
    try: return json.loads(match.group())
    except: return None

async def call_nim_logprobs_async(client: httpx.AsyncClient, text: str, model: str = "meta/llama-3.1-8b-instruct"):
    """
    CHAT-BASED DEEP DIVE: Rationale + Generative Proxy Attribution.
    Uses the stable Chat Completion API to avoid 404s.
    """
    if not NVIDIA_NIM_API_KEY: raise HTTPException(status_code=500, detail="API Key missing.")
    
    prompt = f"""You are an AI interpretability auditor. 
Analyze the following text for toxicity.
Break the text into words/tokens and assign an 'attribution' score to each.
Score Scale: 
- Positive (>0): Pushes toward TOXIC (e.g., slurs, threats)
- Negative (<0): Pushes toward NON-TOXIC (e.g., polite words, helpful context)
- Neutral (0): No impact.

Output MUST be valid JSON:
{{
  "classification": "Toxic" or "Non-Toxic",
  "confidence": Float (0-1),
  "rationale": "One sentence explanation",
  "tokens": [
    {{ "token": "word1", "attribution": 0.5 }},
    {{ "token": "word2", "attribution": -0.1 }}
  ]
}}

Text: "{text}"
"""
    
    headers = {"Authorization": f"Bearer {NVIDIA_NIM_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": model, 
        "messages": [{"role": "user", "content": prompt}], 
        "temperature": 0.1, 
        "max_tokens": 1024,
        "response_format": {"type": "json_object"}
    }
    
    try:
        response = await client.post(NIM_API_URL, headers=headers, json=payload, timeout=60.0)
        response.raise_for_status()
        data = response.json()
        content = data['choices'][0]['message']['content']
        res = robust_json_parse(content)
        
        if res:
            return res.get("classification", "Non-Toxic"), float(res.get("confidence", 0.95)), {
                "rationale": res.get("rationale", ""),
                "tokens": res.get("tokens", []),
                "prompt": prompt,
                "raw_output": content
            }
    except Exception as e:
        print(f"Deep Dive Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    return "Non-Toxic", 0.0, {"rationale": "Error", "tokens": []}

async def unified_inference_async(client: httpx.AsyncClient, text: str, model: str = "meta/llama-3.1-8b-instruct"):
    identities = ["male", "female", "christian", "jewish", "muslim", "threat_group"]
    prompt = f"""Task: Perform a high-fidelity audit of the following text for toxicity and protected identities.
Output MUST be a valid JSON object.

Detections Object (Map to 0 or 1):
- Gender: male, female
- Religion: christian, jewish, muslim
- Threat: threat_group (Mentions of extremism or violence)

Output JSON Schema:
{{
  "toxicity": "Toxic" or "Non-Toxic",
  "confidence": Float (0-1),
  "detections": {{ "male": 0, "female": 0, "christian": 0, "jewish": 0, "muslim": 0, "threat_group": 0 }},
  "toxicity_rationale": "Why is it toxic/safe?",
  "identity_rationale": "Why are these identities detected?",
  "tokens": [ {{ "token": "word", "attribution": Float }} ] 
}}

Text: "{text}"
JSON:"""
    try:
        headers = {"Authorization": f"Bearer {NVIDIA_NIM_API_KEY}", "Content-Type": "application/json"}
        payload = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1, "max_tokens": 800, "response_format": {"type": "json_object"}}
        response = await client.post(NIM_API_URL, headers=headers, json=payload, timeout=60.0)
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        data = robust_json_parse(content)
        if data:
            det = data.get("detections", {})
            full_det = {ident: det.get(ident, 0) for ident in identities}
            return {"toxicity": data.get("toxicity", "Non-Toxic"), "confidence": float(data.get("confidence", 0.9)), "detections": full_det, "toxicity_rationale": data.get("rationale", ""), "identity_rationale": data.get("identity_rationale", "")}, prompt, content
    except Exception as e: print(f"Unified Error: {e}")
    return {"toxicity": "Non-Toxic", "confidence": 0.0, "detections": {i: 0 for i in identities}, "toxicity_rationale": "", "identity_rationale": ""}, prompt, ""

@app.post("/classify")
async def classify_text(request: ClassificationRequest, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        try:
            classification, confidence, debug_data = await call_nim_logprobs_async(client, request.text, request.model)
            return {
                "classification": classification, "confidence": confidence, "rationale": debug_data.get("rationale"), "tokens": debug_data.get("tokens"),
                "debug_data": {"deep_dive_prompt": debug_data.get("prompt"), "deep_dive_raw_response": debug_data.get("raw_output")}
            }
        except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/stream-evaluate/{file_id}")
async def stream_evaluate(file_id: int, batch_size: int = 10, model: str = "meta/llama-3.1-8b-instruct", db: Session = Depends(get_db)):
    async def event_generator():
        pending = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "pending").limit(batch_size).all()
        if not pending: yield f"data: {json.dumps({'done': True})}\n\n"; return
        total, processed, semaphore = len(pending), 0, asyncio.Semaphore(5)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
        async with httpx.AsyncClient() as client:
            async def run_one(c):
                nonlocal processed
                async with semaphore:
                    res, prompt, raw_res = await unified_inference_async(client, c.text, model)
                    
                    if res is not None:
                        # Core classification results
                        c.predicted_classification = res["toxicity"]
                        c.confidence = res["confidence"]
                        c.toxicity_rationale = res["toxicity_rationale"]
                        c.identity_rationale = res["identity_rationale"]
                        c.identity_response = raw_res
                        c.identity_prompt = prompt
                        c.status = "evaluated"
                        
                        # Persist identity detections for Fairness Metrics
                        for ident, val in res.get("detections", {}).items():
                            if hasattr(c, ident):
                                setattr(c, ident, float(val))
                        
                        c.tokens_json = json.dumps({
                            "toxicity_rationale": res["toxicity_rationale"], 
                            "prompt": prompt, 
                            "raw_response": raw_res,
                            "tokens": res.get("tokens", [])
                        })
                        
                        db.commit()
                        cache_invalidate_prefix(f"file-state:{file_id}")
                        cache_invalidate_prefix(f"evaluated-comments:{file_id}")
                        cache_invalidate_prefix(f"metrics:{file_id}")
                    processed += 1
            tasks = [run_one(c) for c in pending]
            for coro in asyncio.as_completed(tasks): await coro; yield f"data: {json.dumps({'type': 'progress', 'processed': processed, 'total': total})}\n\n"
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/stream-scan/{file_id}")
async def stream_scan(file_id: int, model: str = "meta/llama-3.1-8b-instruct", db: Session = Depends(get_db)):
    async def event_generator():
        comments = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated").all()
        # Only scan if never scanned before (identity_response is empty)
        to_scan = [c for c in comments if not c.identity_response]
        if not to_scan: yield f"data: {json.dumps({'done': True})}\n\n"; return
        total, processed, semaphore = len(to_scan), 0, asyncio.Semaphore(5)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
        async with httpx.AsyncClient() as client:
            async def scan_one(c):
                nonlocal processed
                async with semaphore:
                    res, prompt, raw_res = await unified_inference_async(client, c.text, model)
                    for ident, val in res["detections"].items():
                        if hasattr(c, ident): setattr(c, ident, float(val))
                    c.identity_prompt, c.identity_response = prompt, raw_res
                    cur = json.loads(c.tokens_json) if c.tokens_json else {}
                    cur.update({"raw_response": raw_res, "prompt": prompt})
                    c.tokens_json = json.dumps(cur)
                    db.commit()
                    cache_invalidate_prefix(f"metrics:{file_id}"); cache_invalidate_prefix(f"file-state:{file_id}"); cache_invalidate_prefix(f"evaluated-comments:{file_id}")
                    processed += 1
            tasks = [scan_one(c) for c in to_scan]
            for coro in asyncio.as_completed(tasks): await coro; yield f"data: {json.dumps({'type': 'progress', 'current': processed, 'total': total})}\n\n"
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/sync-from-logs/{file_id}")
def sync_from_logs(file_id: int, db: Session = Depends(get_db)):
    """Reparse existing LLM logs to populate identity columns without new API calls."""
    comments = db.query(CommentEvaluation).filter(
        CommentEvaluation.file_id == file_id,
        CommentEvaluation.status == "evaluated",
        CommentEvaluation.identity_response.isnot(None)
    ).all()
    
    ids = ["male", "female", "black", "white", "asian", "latino", "christian", "jewish", "muslim", "psychiatric_or_mental_illness", "identity_caste_religion", "gender_based", "threat_group"]
    count = 0
    for c in comments:
        data = robust_json_parse(c.identity_response)
        if data and "detections" in data:
            det = data["detections"]
            for ident in ids:
                if ident in det and hasattr(c, ident):
                    setattr(c, ident, float(det[ident]))
            count += 1
    
    db.commit()
    cache_invalidate_prefix(f"metrics:{file_id}")
    cache_invalidate_prefix(f"file-state:{file_id}")
    return {"message": f"Successfully synced {count} records from existing logs."}

@app.get("/evaluated-comments/{file_id}")
def get_evaluated_comments(file_id: int, limit: int = 100, db: Session = Depends(get_db)):
    ck = f"evaluated-comments:{file_id}:{limit}"
    cached = cache_get(ck)
    if cached is not None: return cached
    comments = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated").limit(limit).all()
    result = [{
        "id": c.id, "text": c.text, "predicted_classification": c.predicted_classification, 
        "confidence": c.confidence, "tokens_json": c.tokens_json, "target": c.target,
        "ground_truth_label": "Toxic" if c.target != -1.0 and c.target > 0.5 else "Non-Toxic" if c.target != -1.0 else None,
        "severe_toxicity": c.severe_toxicity, "obscene": c.obscene, "threat": c.threat, "insult": c.insult,
        "identity_prompt": c.identity_prompt, "identity_response": c.identity_response
    } for c in comments]
    cache_set(ck, result)
    return result

def calculate_metrics(ev, target_col='target'):
    if not ev: return None
    has_labels = any(c.target != -1.0 for c in ev)
    
    def get_stats(subset):
        n = len(subset)
        if n == 0: return {"n": 0, "accuracy": 0, "f1": 0, "tpr": 0, "fpr": 0, "precision": 0, "ppr": 0}
        tp = len([c for c in subset if c.predicted_classification == "Toxic" and c.target > 0.5])
        fp = len([c for c in subset if c.predicted_classification == "Toxic" and c.target <= 0.5])
        fn = len([c for c in subset if c.predicted_classification == "Non-Toxic" and c.target > 0.5])
        tn = len([c for c in subset if c.predicted_classification == "Non-Toxic" and c.target <= 0.5])
        pos_pred = tp + fp
        act_pos = tp + fn
        act_neg = fp + tn
        
        prec = tp / pos_pred if pos_pred > 0 else 0
        rec = tp / act_pos if act_pos > 0 else 0
        
        return {
            "n": n,
            "accuracy": (tp + tn) / n,
            "f1": 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0,
            "tpr": rec,
            "fpr": fp / act_neg if act_neg > 0 else 0,
            "precision": prec,
            "ppr": pos_pred / n
        }

    overall = get_stats(ev)
    ids = ["male", "female", "christian", "jewish", "muslim", "threat_group"]
    ident_res = []
    
    for ident in ids:
        a1_list = [c for c in ev if getattr(c, ident, 0) > 0.5]
        a0_list = [c for c in ev if getattr(c, ident, 0) <= 0.5]
        if not a1_list: continue
        
        s1 = get_stats(a1_list)
        s0 = get_stats(a0_list)
        
        spd = s1["ppr"] - s0["ppr"]
        eopp = (s1["tpr"] - s0["tpr"]) if has_labels else 0
        ratio = s1["ppr"] / s0["ppr"] if s0["ppr"] > 0 else 0
        
        # Samples for the UI
        samples = []
        # Prioritize errors (False Positives or False Negatives)
        errors = [c for c in a1_list if (c.predicted_classification == "Toxic" and c.target <= 0.5) or (c.predicted_classification == "Non-Toxic" and c.target > 0.5)]
        # Collect unique samples (errors + worst-case)
        unique_samples = []
        seen_ids = set()
        for c in (errors + a1_list):
            if c.id not in seen_ids:
                unique_samples.append(c)
                seen_ids.add(c.id)
        
        for c in unique_samples[:5]:
            parsed = robust_json_parse(c.tokens_json) or {}
            # Robust extraction: check multiple keys or raw fallback
            rat = parsed.get("toxicity_rationale") or parsed.get("rationale") or parsed.get("toxicity")
            tks = parsed.get("tokens", [])
            
            # If raw_response exists, try parsing that too
            if not rat and "raw_response" in parsed and parsed["raw_response"]:
                try:
                    inner = json.loads(parsed["raw_response"])
                    rat = inner.get("toxicity_rationale") or inner.get("rationale")
                    tks = inner.get("tokens", [])
                except: pass

            samples.append({
                "id": c.id,
                "text": c.text,
                "predicted": c.predicted_classification,
                "truth": "Toxic" if c.target > 0.5 else "Non-Toxic",
                "type": "False Positive (Bias?)" if (c.predicted_classification == "Toxic" and c.target <= 0.5) else "False Negative" if (c.predicted_classification == "Non-Toxic" and c.target > 0.5) else "Correct",
                "toxicity_rationale": rat or "N/A",
                "tokens": tks
            })

        ident_res.append({
            "name": ident,
            "count": s1["n"],
            "spd": spd,
            "eopp": eopp,
            "selection_rate_ratio": ratio,
            "a1": s1, 
            "a0": s0,
            "samples": samples
        })

    # Worst case summary
    worst = {
        "max_spd": {"identity": "None", "value": 0},
        "max_eopp": {"identity": "None", "value": 0},
        "min_selection_ratio": {"identity": "None", "value": 1.0},
        "worst_accuracy": {"identity": "None", "value": 1.0, "subgroup": "None"}
    }
    
    if ident_res:
        m_spd = max(ident_res, key=lambda x: abs(x["spd"]))
        worst["max_spd"] = {"identity": m_spd["name"], "value": m_spd["spd"]}
        
        if has_labels:
            m_eopp = max(ident_res, key=lambda x: abs(x["eopp"]))
            worst["max_eopp"] = {"identity": m_eopp["name"], "value": m_eopp["eopp"]}
            
        m_sr = min(ident_res, key=lambda x: x["a1"]["ppr"] / (overall["ppr"] or 1))
        worst["min_selection_ratio"] = {"identity": m_sr["name"], "value": m_sr["a1"]["ppr"] / (overall["ppr"] or 1)}
        
        w_acc = min(ident_res, key=lambda x: x["a1"]["accuracy"])
        worst["worst_accuracy"] = {"identity": w_acc["name"], "value": w_acc["a1"]["accuracy"], "subgroup": f"A=1 ({w_acc['name']})"}

    return {
        "has_labels": has_labels,
        "overall": overall,
        "identities": ident_res,
        "worst_case": worst,
        "diagnostics": {"group_counts": {i: len([c for c in ev if getattr(c, i, 0) > 0.5]) for i in ids}, "min_required": 1}
    }

@app.get("/metrics")
def get_metrics(file_id: int = None, db: Session = Depends(get_db)):
    ck = f"metrics:{file_id}"
    cached = cache_get(ck)
    if cached is not None: return cached
    
    q = db.query(CommentEvaluation).filter(CommentEvaluation.status == "evaluated")
    if file_id: q = q.filter(CommentEvaluation.file_id == file_id)
    ev = q.all()
    
    if not ev:
        return {"has_labels": False, "overall": {"total": 0, "accuracy": 0}, "identities": []}
    
    res = calculate_metrics(ev)
    cache_set(ck, res)
    return res
