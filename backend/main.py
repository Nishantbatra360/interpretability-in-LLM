import os
import json
import time
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import pandas as pd
import io
import httpx
import asyncio
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

# Simple in-memory TTL cache to avoid repeated DB reads
_cache = {}
CACHE_TTL = 10  # seconds

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
    model: str = "meta/llama-3.1-70b-instruct"

class BatchEvaluateRequest(BaseModel):
    file_id: int
    batch_size: int = Field(default=10, ge=1, le=35, description="Max 35 comments per batch")
    model: str = "meta/llama-3.1-70b-instruct"

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
        # Normalise all column names: strip whitespace, lowercase
        df.columns = [str(c).strip().lower() for c in df.columns]
        print(f"Loaded CSV — shape: {df.shape} | columns: {list(df.columns)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    # ── Column mapping ───────────────────────────────────────────────────────
    # Support Civil Comments schema as well as generic CSVs
    TEXT_COLS    = ['text', 'comment', 'comment_text', 'comments']
    TARGET_COLS  = ['toxicity', 'target', 'label', 'is_toxic']
    IDENTITY_COLS = ['male', 'female', 'black', 'white', 'asian', 'latino',
                     'christian', 'jewish', 'muslim', 'psychiatric_or_mental_illness']
    SUBTOXIC_COLS = ['severe_toxicity', 'obscene', 'threat', 'insult',
                     'identity_attack', 'sexual_explicit']

    col_set = set(df.columns)

    text_col = next((c for c in TEXT_COLS if c in col_set), None)
    if text_col is None:
        # Fall back to first column
        text_col = df.columns[0]

    target_col = next((c for c in TARGET_COLS if c in col_set), None)
    has_target = target_col is not None

    print(f"text_col={text_col} | target_col={target_col} | has_target={has_target}")

    def safe_float(row, col, fallback=None):
        try:
            v = row.get(col)
            return float(v) if v is not None and not pd.isna(v) else fallback
        except (ValueError, TypeError):
            return fallback

    # Create file record
    uploaded_file = UploadedFile(filename=file.filename)
    db.add(uploaded_file)
    db.commit()
    db.refresh(uploaded_file)

    inserted_count = 0
    for _, row in df.iterrows():
        text_val = row.get(text_col)
        if pd.isna(text_val) or not str(text_val).strip():
            continue

        # Ground truth toxicity score (raw, not binarized — we keep as float)
        # Binarization (>0.5 = Toxic) happens in /metrics at query time
        target_val = safe_float(row, target_col, fallback=-1.0) if has_target else -1.0

        # Civil Comments sub-scores
        severe_toxicity = safe_float(row, 'severe_toxicity')
        obscene         = safe_float(row, 'obscene')
        threat          = safe_float(row, 'threat')
        insult          = safe_float(row, 'insult')
        identity_attack = safe_float(row, 'identity_attack')
        sexual_explicit = safe_float(row, 'sexual_explicit')

        # Identity columns — use dataset values when available, else None (not random)
        male    = safe_float(row, 'male')
        female  = safe_float(row, 'female')
        black   = safe_float(row, 'black')
        white   = safe_float(row, 'white')
        asian   = safe_float(row, 'asian')
        latino  = safe_float(row, 'latino')

        evaluation = CommentEvaluation(
            file_id=uploaded_file.id,
            text=str(text_val).strip(),
            target=target_val,
            severe_toxicity=severe_toxicity,
            obscene=obscene,
            threat=threat,
            insult=insult,
            identity_attack=identity_attack,
            sexual_explicit=sexual_explicit,
            male=male,
            female=female,
            black=black,
            white=white,
            asian=asian,
            latino=latino,
            status="pending"
        )
        db.add(evaluation)
        inserted_count += 1

    db.commit()
    print(f"Inserted {inserted_count} rows.")
    return {
        "message": f"Successfully uploaded and queued {inserted_count} comments.",
        "has_labels": has_target,
        "columns_detected": list(col_set)
    }

@app.get("/file-state/{file_id}")
def get_file_state(file_id: int, db: Session = Depends(get_db)):
    """Single endpoint that returns status counts + evaluated comments in one DB round-trip."""
    cache_key = f"file-state:{file_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    # Single query: count pending and evaluated using conditional aggregation
    row = db.query(
        func.sum((CommentEvaluation.status == "pending").cast(Integer)).label("pending"),
        func.sum((CommentEvaluation.status == "evaluated").cast(Integer)).label("evaluated")
    ).filter(CommentEvaluation.file_id == file_id).one()

    pending = int(row.pending or 0)
    evaluated_count = int(row.evaluated or 0)

    comments = []
    if evaluated_count > 0:
        rows = db.query(CommentEvaluation).filter(
            CommentEvaluation.file_id == file_id,
            CommentEvaluation.status == "evaluated"
        ).limit(100).all()
        comments = [
            {
                "id": c.id,
                "text": c.text,
                "predicted_classification": c.predicted_classification,
                "confidence": c.confidence,
                "tokens_json": c.tokens_json,
                # Ground truth
                "target": c.target,
                "ground_truth_label": ("Toxic" if c.target > 0.5 else "Non-Toxic") if (c.target is not None and c.target >= 0) else None,
                # Civil Comments sub-scores
                "severe_toxicity": c.severe_toxicity,
                "obscene":         c.obscene,
                "threat":          c.threat,
                "insult":          c.insult,
                "identity_attack": c.identity_attack,
                "sexual_explicit": c.sexual_explicit,
            } for c in rows
        ]

    result = {"pending": pending, "evaluated": evaluated_count, "comments": comments}
    cache_set(cache_key, result)
    return result

def call_nim_api(prompt: str, model: str = "meta/llama-3.1-70b-instruct"):
    """Synchronous NIM caller — used by /classify endpoint only."""
    if not NVIDIA_NIM_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA NIM API Key not configured.")
    
    headers = {
        "Authorization": f"Bearer {NVIDIA_NIM_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 1024,  # tightened from 8192
        "response_format": {"type": "json_object"}
    }
    import requests as _req
    response = _req.post(NIM_API_URL, headers=headers, json=payload)
    response.raise_for_status()
    data = response.json()
    return json.loads(data['choices'][0]['message']['content'])

def map_tokens_to_objects(tokens_array):
    if not isinstance(tokens_array, list):
        return []
    mapped = []
    for t in tokens_array:
        if isinstance(t, list) and len(t) >= 2:
            try:
                # Multiply by -1 because the LLM naturally associates negative numbers with toxicity
                # and positive numbers with safety, but our UI math uses positive for Toxicity.
                mapped.append({"token": str(t[0]), "attribution": -float(t[1])})
            except (ValueError, TypeError):
                mapped.append({"token": str(t[0]), "attribution": 0.0})
        elif isinstance(t, dict) and "token" in t and "attribution" in t:
            try:
                t["attribution"] = -float(t["attribution"])
            except:
                t["attribution"] = 0.0
            mapped.append(t)
    return mapped

async def call_nim_api_async(client: httpx.AsyncClient, prompt: str, model: str = "meta/llama-3.1-70b-instruct"):
    if not NVIDIA_NIM_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA NIM API Key not configured.")
    
    headers = {
        "Authorization": f"Bearer {NVIDIA_NIM_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 1024,
        "response_format": {"type": "json_object"}
    }
    response = await client.post(NIM_API_URL, headers=headers, json=payload, timeout=60.0)
    response.raise_for_status()
    data = response.json()
    raw_content = data['choices'][0]['message']['content']
    return json.loads(raw_content), raw_content, prompt

async def call_nim_logprobs_async(client: httpx.AsyncClient, text: str, model: str = "meta/llama-3.1-70b-instruct"):
    """
    Implements true Zero-Shot Logprob Scoring Rule: s(x) = log p(toxic|x) - log p(non-toxic|x).
    """
    if not NVIDIA_NIM_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA NIM API Key not configured.")
    
    headers = {
        "Authorization": f"Bearer {NVIDIA_NIM_API_KEY}",
        "Content-Type": "application/json"
    }
    prompt = f"Please classify the following text. You must only provide the classification in your response, which can be either 'Toxic' or 'Non-Toxic'.\n\nText: \"{text}\"\n\nClassification:"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 10,
        "logprobs": True,
        "top_logprobs": 5
    }
    
    # Robust retry loop for 429 Too Many Requests
    import asyncio
    max_retries = 6
    for attempt in range(max_retries):
        response = await client.post(NIM_API_URL, headers=headers, json=payload, timeout=30.0)
        if response.status_code == 429:
            if attempt < max_retries - 1:
                print(f"[RATE LIMIT] 429 Hit. Backing off for {2 ** attempt + 1}s...")
                await asyncio.sleep(2 ** attempt + 1)  # 2s, 3s, 5s, 9s, 17s
                continue
        response.raise_for_status()
        break
        
    data = response.json()
    
    # Extract logprobs from the first token generated
    top_logprobs = data['choices'][0]['logprobs']['content'][0]['top_logprobs']
    
    # DEBUG: See what the API is actually returning in the terminal
    print(f"[DEBUG LOGPROBS] text[:30]: {text[:30]} | tokens: {[(lp['token'], lp['logprob']) for lp in top_logprobs]}")
    
    logp_toxic = -999.0
    logp_nontoxic = -999.0
    
    for lp in top_logprobs:
        tok = lp['token'].strip().lower().replace('"', '').replace("'", "")
        if tok.startswith("non") or tok == "n":
            if lp['logprob'] > logp_nontoxic:
                logp_nontoxic = lp['logprob']
        elif tok.startswith("to") or tok == "t" or tok.startswith("tox"):
            if lp['logprob'] > logp_toxic:
                logp_toxic = lp['logprob']
            
    if logp_toxic == -999.0 and logp_nontoxic == -999.0:
        classification = "Unknown"
        s_x = 0
    else:
        # Calculate difference
        s_x = logp_toxic - logp_nontoxic
        classification = "Toxic" if s_x > 0 else "Non-Toxic"
    
    import math
    try:
        # Softmax confidence
        prob_toxic = math.exp(logp_toxic) / (math.exp(logp_toxic) + math.exp(logp_nontoxic))
    except:
        prob_toxic = 1.0 if s_x > 0 else 0.0
        
    confidence = prob_toxic if classification == "Toxic" else (1.0 - prob_toxic)
    if classification == "Unknown":
        confidence = 0.0
    
    raw_response_text = data['choices'][0]['message']['content'].strip()
        
    debug_data = {
        "prompt": prompt,
        "raw_response": raw_response_text,
        "logprobs": top_logprobs
    }
    return classification, confidence, debug_data

@app.post("/evaluate-batch")
async def evaluate_batch(request: BatchEvaluateRequest, db: Session = Depends(get_db)):
    pending_comments = db.query(CommentEvaluation).filter(
        CommentEvaluation.file_id == request.file_id,
        CommentEvaluation.status == "pending"
    ).limit(request.batch_size).all()
    if not pending_comments:
        return {"message": "No pending comments to evaluate.",
                "pending": 0, "evaluated": 0, "batch_size": 0}

    # Lock ensures DB commits don't interleave across concurrent coroutines
    db_lock = asyncio.Lock()
    # Semaphore limits concurrent API requests to avoid 429 rate limits
    # NVIDIA NIM free tier is extremely strict, so we force sequential processing (1)
    semaphore = asyncio.Semaphore(1)
    processed_count = 0

    async def evaluate_single_comment(client, comment):
        async with semaphore:
            nonlocal processed_count
            try:
                # For Bulk Evaluation (Zero-Shot), we ONLY fetch the Logprobs to maximize speed
                # and adhere strictly to the statistical zero-shot methodology.
                # We do NOT ask the LLM for explanations here.
                true_classification, true_confidence, debug_data = await call_nim_logprobs_async(client, comment.text, request.model)
                
                comment.predicted_classification = true_classification
                comment.confidence = true_confidence
                
                # Save debug data into tokens_json so the UI can display the prompt/logprobs
                comment.tokens_json = json.dumps(debug_data)
                comment.status = "evaluated"
                # Commit immediately so /progress can reflect real-time state
                async with db_lock:
                    db.commit()
                    cache_invalidate_prefix(f"file-state:{request.file_id}")
                processed_count += 1
                
                # Add a mandatory sleep to respect free-tier rate limits
                await asyncio.sleep(1.0)
                
                return True
            except Exception as e:
                import traceback
                print(f"Error evaluating comment ID {comment.id}:")
                traceback.print_exc()
                return False

    async with httpx.AsyncClient() as client:
        tasks = [evaluate_single_comment(client, comment) for comment in pending_comments]
        await asyncio.gather(*tasks)

    # Final cache invalidation for metrics
    cache_invalidate_prefix(f"metrics:{request.file_id}")
    cache_invalidate_prefix("metrics:None")

    row = db.query(
        func.sum((CommentEvaluation.status == "pending").cast(Integer)).label("pending"),
        func.sum((CommentEvaluation.status == "evaluated").cast(Integer)).label("evaluated")
    ).filter(CommentEvaluation.file_id == request.file_id).one()

    return {
        "message": f"Successfully evaluated {processed_count} out of {len(pending_comments)} comments.",
        "batch_size": len(pending_comments),
        "pending": int(row.pending or 0),
        "evaluated": int(row.evaluated or 0)
    }


@app.get("/progress/{file_id}")
def get_progress(file_id: int, db: Session = Depends(get_db)):
    """Lightweight endpoint polled by frontend during active batch evaluation.
    Returns only counts — no heavy comments payload."""
    row = db.query(
        func.sum((CommentEvaluation.status == "pending").cast(Integer)).label("pending"),
        func.sum((CommentEvaluation.status == "evaluated").cast(Integer)).label("evaluated")
    ).filter(CommentEvaluation.file_id == file_id).one()
    return {
        "pending":   int(row.pending  or 0),
        "evaluated": int(row.evaluated or 0),
    }

@app.get("/evaluated-comments/{file_id}")
def get_evaluated_comments(file_id: int, limit: int = 100, db: Session = Depends(get_db)):
    cache_key = f"evaluated-comments:{file_id}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    
    comments = db.query(CommentEvaluation).filter(
        CommentEvaluation.file_id == file_id,
        CommentEvaluation.status == "evaluated"
    ).limit(limit).all()
    
    result = [
        {
            "id": c.id,
            "text": c.text,
            "predicted_classification": c.predicted_classification,
            "confidence": c.confidence,
            "tokens_json": c.tokens_json
        } for c in comments
    ]
    cache_set(cache_key, result)
    return result


@app.post("/classify")
async def classify_text(request: ClassificationRequest, db: Session = Depends(get_db)):
    # Fetch few-shot examples from DB
    toxic_example = db.query(CommentEvaluation).filter(
        CommentEvaluation.status == "evaluated", 
        CommentEvaluation.predicted_classification == "Toxic"
    ).first()
    
    nontoxic_example = db.query(CommentEvaluation).filter(
        CommentEvaluation.status == "evaluated", 
        CommentEvaluation.predicted_classification == "Non-Toxic"
    ).first()

    few_shot_prompt = "You are an AI auditor trained to classify comments as \"Toxic\" or \"Non-Toxic\" and provide an interpretable explanation.\n"
    if toxic_example:
        few_shot_prompt += f"\nExample Toxic Comment: \"{toxic_example.text}\"\n"
    if nontoxic_example:
        few_shot_prompt += f"Example Non-Toxic Comment: \"{nontoxic_example.text}\"\n"
        
    few_shot_prompt += f"""
Analyze the following text based on the examples above.
Output MUST be a valid JSON object with EXACTLY three fields:
1. "classification": either "Toxic" or "Non-Toxic"
2. "confidence": a float between 0.0 and 1.0
3. "tokens": an array of objects. Break the text into tokens (words). For each token, assign an "attribution" score between -1.0 (highly toxic/offensive) and 1.0 (highly safe/positive). A score of 0.0 means neutral.

Text to analyze: "{request.text}"

JSON Output:
"""
    try:
        async with httpx.AsyncClient() as client:
            json_task = call_nim_api_async(client, few_shot_prompt, request.model)
            logprob_task = call_nim_logprobs_async(client, request.text, request.model)
            
            result_json_tuple, logprob_result = await asyncio.gather(json_task, logprob_task)
            
            result_json, raw_response, sent_prompt = result_json_tuple
            true_classification, true_confidence, zero_shot_debug = logprob_result
            
            result_json["classification"] = true_classification
            result_json["confidence"] = true_confidence
            
            # CRITICAL: Apply the polarity inversion so that positive attribution = Toxic in the UI.
            # The LLM prompt defines: +1.0 = safe, -1.0 = toxic.
            # map_tokens_to_objects flips the sign so: +1.0 in UI = Toxic (red), -1.0 = Non-Toxic (green).
            if "tokens" in result_json and isinstance(result_json["tokens"], list):
                result_json["tokens"] = map_tokens_to_objects(result_json["tokens"])
            
            result_json["debug_data"] = {
                "deep_dive_prompt": sent_prompt,
                "deep_dive_raw_response": raw_response,
                "zero_shot_prompt": zero_shot_debug.get("prompt"),
                "zero_shot_raw_response": zero_shot_debug.get("raw_response"),
                "zero_shot_logprobs": zero_shot_debug.get("logprobs")
            }
        
        # We also return the examples used so the UI can show them
        examples_used = []
        if toxic_example:
             examples_used.append({"text": toxic_example.text, "label": "Toxic"})
        if nontoxic_example:
             examples_used.append({"text": nontoxic_example.text, "label": "Non-Toxic"})
             
        result_json["examples_used"] = examples_used
        return result_json
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/metrics")
def get_metrics(file_id: int = None, db: Session = Depends(get_db)):
    """
    Computes fairness metrics per identity group using the correct reference formulas:
      SPD  = P(Ŷ=1 | A=1) − P(Ŷ=1 | A=0)
      EOpp = TPR(A=1)      − TPR(A=0)
    Both compare A=1 subgroup vs. A=0 subgroup for each identity.
    """
    cache_key = f"metrics:{file_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    query = db.query(CommentEvaluation).filter(CommentEvaluation.status == "evaluated")
    if file_id is not None:
        query = query.filter(CommentEvaluation.file_id == file_id)
        
    evaluated = query.all()
    if not evaluated:
        return {"error": "No evaluated comments in database for this file."}

    # ── Check whether ground-truth labels are present ────────────────────────
    # sentinel -1.0 means the CSV had no target column
    has_labels = any(c.target is not None and c.target >= 0 for c in evaluated)

    # ── Overall classification metrics ──────────────────────────────────────
    total = len(evaluated)
    tp_all = fp_all = fn_all = tn_all = 0

    for c in evaluated:
        actual   = c.target > 0.5
        pred_pos = c.predicted_classification == "Toxic"
        if actual and pred_pos:      tp_all += 1
        elif not actual and pred_pos: fp_all += 1
        elif actual and not pred_pos: fn_all += 1
        else:                         tn_all += 1

    accuracy_overall = (tp_all + tn_all) / total
    precision_overall = tp_all / (tp_all + fp_all) if (tp_all + fp_all) > 0 else 0
    recall_overall    = tp_all / (tp_all + fn_all) if (tp_all + fn_all) > 0 else 0
    f1_overall = (2 * precision_overall * recall_overall / (precision_overall + recall_overall)
                  if (precision_overall + recall_overall) > 0 else 0)
    tpr_overall = recall_overall
    fpr_overall = fp_all / (fp_all + tn_all) if (fp_all + tn_all) > 0 else 0
    ppr_overall = (tp_all + fp_all) / total  # overall positive prediction rate

    # ── Per-identity subgroup metrics ───────────────────────────────────────
    identities = ["male", "female", "black", "white", "asian", "latino"]

    def empty_stats():
        return {"tp": 0, "fp": 0, "tn": 0, "fn": 0}

    # For each identity: collect A=1 and A=0 subgroup stats separately
    group_stats = {ident: {"a1": empty_stats(), "a0": empty_stats()} for ident in identities}

    for c in evaluated:
        actual   = c.target > 0.5
        pred_pos = c.predicted_classification == "Toxic"
        for ident in identities:
            val = getattr(c, ident) or 0.0
            subgroup = "a1" if val > 0.5 else "a0"
            s = group_stats[ident][subgroup]
            if actual and pred_pos:       s["tp"] += 1
            elif not actual and pred_pos: s["fp"] += 1
            elif actual and not pred_pos: s["fn"] += 1
            else:                         s["tn"] += 1

    def compute_group_metrics(s):
        n = s["tp"] + s["fp"] + s["tn"] + s["fn"]
        if n == 0:
            return None
        acc  = (s["tp"] + s["tn"]) / n
        prec = s["tp"] / (s["tp"] + s["fp"]) if (s["tp"] + s["fp"]) > 0 else 0
        rec  = s["tp"] / (s["tp"] + s["fn"]) if (s["tp"] + s["fn"]) > 0 else 0
        f1   = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
        tpr  = rec
        fpr  = s["fp"] / (s["fp"] + s["tn"]) if (s["fp"] + s["tn"]) > 0 else 0
        ppr  = (s["tp"] + s["fp"]) / n
        return {"n": n, "accuracy": acc, "f1": f1, "tpr": tpr, "fpr": fpr, "ppr": ppr, "precision": prec, "recall": rec}

    MIN_GROUP_SIZE = 5  # filter tiny groups for stable estimates

    identity_results = []
    worst = {
        "max_spd":         {"identity": "None", "value": 0.0},
        "max_eopp":        {"identity": "None", "value": 0.0},
        "worst_accuracy":  {"identity": "None", "value": 1.0,  "subgroup": ""},
        "worst_f1":        {"identity": "None", "value": 1.0,  "subgroup": ""},
    }

    for ident in identities:
        m1 = compute_group_metrics(group_stats[ident]["a1"])
        m0 = compute_group_metrics(group_stats[ident]["a0"])

        if m1 is None or m0 is None:
            continue
        if m1["n"] < MIN_GROUP_SIZE or m0["n"] < MIN_GROUP_SIZE:
            continue

        # Reference formulas (equations 3 & 4 from use_case.txt)
        spd  = m1["ppr"] - m0["ppr"]   # P(Ŷ=1|A=1) − P(Ŷ=1|A=0)
        eopp = m1["tpr"] - m0["tpr"]   # TPR(A=1) − TPR(A=0)

        row = {
            "name":  ident.capitalize(),
            "spd":   spd,
            "eopp":  eopp,
            "a1": {**m1, "label": f"{ident.capitalize()} = 1"},
            "a0": {**m0, "label": f"{ident.capitalize()} = 0"},
        }
        identity_results.append(row)

        if abs(spd) > abs(worst["max_spd"]["value"]):
            worst["max_spd"] = {"identity": ident.capitalize(), "value": spd}
        if abs(eopp) > abs(worst["max_eopp"]["value"]):
            worst["max_eopp"] = {"identity": ident.capitalize(), "value": eopp}

        # Track worst accuracy across both subgroups
        for subg, m in [("A=1", m1), ("A=0", m0)]:
            if m["accuracy"] < worst["worst_accuracy"]["value"]:
                worst["worst_accuracy"] = {"identity": ident.capitalize(), "value": m["accuracy"], "subgroup": subg}
            if m["f1"] < worst["worst_f1"]["value"]:
                worst["worst_f1"] = {"identity": ident.capitalize(), "value": m["f1"], "subgroup": subg}

    result = {
        "has_labels": has_labels,
        "overall": {
            "accuracy":  accuracy_overall  if has_labels else None,
            "f1":        f1_overall        if has_labels else None,
            "precision": precision_overall if has_labels else None,
            "recall":    recall_overall    if has_labels else None,
            "tpr":       tpr_overall       if has_labels else None,
            "fpr":       fpr_overall       if has_labels else None,
            "ppr":       ppr_overall,   # always valid (based on predictions, not ground truth)
            "total":     total,
        },
        "identities": identity_results if has_labels else [],
        "worst_case": worst if has_labels else {},
    }
    cache_set(cache_key, result)
    return result

