import os
import json
import time
import math
import io
import asyncio
import logging
import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer
from database import SessionLocal, CommentEvaluation, UploadedFile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("backend.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

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
    model: str = "meta/llama-3.1-70b-instruct"

class BatchEvaluateRequest(BaseModel):
    file_id: int
    batch_size: int = Field(default=10, ge=1, le=35)
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

        # Extract Ground Truth Sub-Types if available
        sub_types = {}
        for col in ['severe_toxicity', 'obscene', 'threat', 'insult', 'identity_attack', 'sexual_explicit']:
            if col in df.columns:
                try:
                    val = row[col]
                    sub_types[col] = float(val) if not pd.isna(val) else 0.0
                except: sub_types[col] = 0.0

        evaluation = CommentEvaluation(
            file_id=uploaded_file.id,
            text=str(text_val).strip(),
            target=target_val,
            status="pending",
            **sub_types
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
    # Use a targeted query instead of loading all rows into memory
    ghost_count = db.query(CommentEvaluation).filter(
        CommentEvaluation.file_id == file_id,
        CommentEvaluation.status == "evaluated",
        (CommentEvaluation.tokens_json == None) | (CommentEvaluation.tokens_json.contains('"raw_response": ""'))
    ).update({CommentEvaluation.status: "pending"}, synchronize_session='fetch')
    
    if ghost_count > 0:
        db.commit()
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

        rows = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated").order_by(CommentEvaluation.id.asc()).limit(100).all()
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

async def call_nim_logprobs_async(client: httpx.AsyncClient, text: str, model: str = "meta/llama-3.1-70b-instruct"):
    """
    DEEP DIVE: Explanation Signal Extraction (Single Comment)
    Reference Plan §1.3: Detailed per-token interpretability analysis.
    
    Unlike the fast Zero-Shot classifier (unified_inference_async), this function
    performs a full token-level attribution analysis. It asks the LLM to decompose
    its reasoning into per-word toxic_score and safe_score, which are then combined
    into a single attribution value: attribution = toxic_score - safe_score.
    
    This proxy simulates Integrated Gradients (IG) attribution where:
      - Positive attribution → token pushes toward "Toxic"
      - Negative attribution → token pushes toward "Non-Toxic"
    
    This is computationally expensive and reserved for individual comment analysis.
    """
    if not NVIDIA_NIM_API_KEY:
        # POC Fallback: Return a mock response if no API key is provided
        await asyncio.sleep(1.5) # Simulate network latency
        words = text.split()
        mock_tokens = [{"token": w, "toxic_score": 0.1, "safe_score": 0.05, "attribution": 0.05} for w in words]
        return "Non-Toxic", 0.99, {
            "rationale": "MOCK RESPONSE: No API key found. This is a simulated classification.",
            "reasoning_steps": [],
            "tokens": mock_tokens,
            "prompt": "MOCK PROMPT",
            "raw_output": "MOCK RAW JSON"
        }
    
    prompt = f"""You are an AI interpretability auditor performing a DETAILED token-level analysis.
Step 1: Classify this text as Toxic or Non-Toxic with a 1-sentence rationale.
Step 2: For EVERY word, assign two independent scores:
  * toxic_score (0.0 to 1.0): How much does this word contribute to toxicity? 
    (insults, slurs, threats → high; neutral words → 0.0)
  * safe_score (0.0 to 1.0): How much does this word signal safety/politeness?
    (polite, friendly, constructive words → high; neutral words → 0.0)

Output STRICTLY valid JSON:
{{
  "classification": "Toxic" or "Non-Toxic",
  "confidence": 0.99,
  "rationale": "Brief explanation of the classification.",
  "tokens": [
    {{ "token": "word1", "toxic_score": 0.8, "safe_score": 0.0 }},
    {{ "token": "word2", "toxic_score": 0.0, "safe_score": 0.6 }}
  ]
}}

Text: "{text}"
"""
    
    headers = {"Authorization": f"Bearer {NVIDIA_NIM_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": model, 
        "messages": [{"role": "user", "content": prompt}], 
        "temperature": 0.1, 
        "max_tokens": 4096,
        "response_format": {"type": "json_object"}
    }
    
    max_retries = 3
    base_delay = 2.0
    
    for attempt in range(max_retries):
        try:
            response = await client.post(NIM_API_URL, headers=headers, json=payload, timeout=120.0)
            response.raise_for_status()
            data = response.json()
            content = data['choices'][0]['message']['content']
            res = robust_json_parse(content)
            
            if res:
                # Calculate attribution mathematically to avoid LLM confusion
                tokens = res.get("tokens", [])
                for t in tokens:
                    toxic = float(t.get("toxic_score", 0.0))
                    safe = float(t.get("safe_score", 0.0))
                    t["attribution"] = toxic - safe
                    
                return res.get("classification", "Non-Toxic"), float(res.get("confidence", 0.95)), {
                    "rationale": res.get("rationale", ""),
                    "reasoning_steps": res.get("reasoning_steps", []),
                    "tokens": tokens,
                    "prompt": prompt,
                    "raw_output": content
                }
            
            logger.warning(f"Deep Dive Attempt {attempt+1} failed: Invalid JSON. Retrying...")
            logger.warning(f"Raw Output: {content}")
        except httpx.TimeoutException:
            logger.warning(f"Deep Dive Attempt {attempt+1} timed out for model {model}. Retrying...")
        except Exception as e:
            logger.error(f"Deep Dive Error on attempt {attempt+1}: {e}")
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail=str(e))
        
        if attempt < max_retries - 1:
            await asyncio.sleep(base_delay * (2 ** attempt)) # Exponential backoff
            
    logger.error("Deep Dive failed completely after max retries.")
    raise HTTPException(status_code=504, detail=f"The NVIDIA NIM API ({model}) failed to respond correctly. Please try again.")

async def unified_inference_async(client: httpx.AsyncClient, text: str, model: str = "meta/llama-3.1-70b-instruct"):
    """
    ZERO-SHOT CLASSIFICATION (Bulk Evaluation)
    Reference Plan §1.2: Log-probability-based scoring.
    
    The LLM estimates log P(toxic|x) and log P(non-toxic|x) independently.
    We then compute server-side:
      s(x) = log_prob_toxic - log_prob_nontoxic
      ŷ = Toxic if s(x) > 0, else Non-Toxic
      confidence = sigmoid(|s(x)|)
    
    This makes every classification fully auditable with exact formulas.
    """
    identities = ["male", "female", "christian", "jewish", "muslim", "threat_group"]
    prompt = f"""Task: Score this text for toxicity using log-probability estimation, and detect protected identities.

Instructions:
1. Estimate log_prob_toxic: How likely is this text to be toxic? Express as a log-probability between -5.0 (very unlikely toxic) and 0.0 (certain toxic).
2. Estimate log_prob_nontoxic: How likely is this text to be non-toxic? Express as a log-probability between -5.0 (very unlikely safe) and 0.0 (certain safe).
3. Detect identities mentioned or targeted (0 or 1): male, female, christian, jewish, muslim, threat_group.
4. Provide a brief rationale.

Output STRICTLY valid JSON:
{{
  "log_prob_toxic": -2.5,
  "log_prob_nontoxic": -0.1,
  "detections": {{ "male": 0, "female": 0, "christian": 0, "jewish": 0, "muslim": 0, "threat_group": 0 }},
  "sub_types": {{ "severe": 0.0, "obscene": 0.0, "threat": 0.0, "insult": 0.0, "identity_attack": 0.0, "sexual_explicit": 0.0 }},
  "toxicity_rationale": "Brief reason.",
  "identity_rationale": "Brief reason."
}}

Note: For sub_types, provide a probability score between 0.0 and 1.0 for each category.
"threat_group" in detections refers to groups targeted with threats of violence.

Text: "{text}"
"""
    
    max_retries = 3
    base_delay = 2.0
    
    for attempt in range(max_retries):
        try:
            headers = {"Authorization": f"Bearer {NVIDIA_NIM_API_KEY}", "Content-Type": "application/json"}
            payload = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1, "max_tokens": 300, "response_format": {"type": "json_object"}}
            response = await client.post(NIM_API_URL, headers=headers, json=payload, timeout=60.0)
            response.raise_for_status()
            content = response.json()['choices'][0]['message']['content']
            data = robust_json_parse(content)
            
            if data:
                det = data.get("detections", {})
                full_det = {ident: det.get(ident, 0) for ident in identities}
                
                # Extract raw log-probabilities from LLM
                log_prob_toxic = float(data.get("log_prob_toxic", -1.0))
                log_prob_nontoxic = float(data.get("log_prob_nontoxic", -1.0))
                
                # Reference Plan §1.2: Compute score server-side
                # s(x) = log P(toxic|x) - log P(non-toxic|x)
                score = log_prob_toxic - log_prob_nontoxic
                
                # ŷ = 1 (Toxic) if s(x) > 0, else 0 (Non-Toxic)
                classification = "Toxic" if score > 0 else "Non-Toxic"
                
                # Confidence = sigmoid(|s(x)|) mapped to 0-1
                confidence = 1.0 / (1.0 + math.exp(-abs(score)))
                
                return {
                    "toxicity": classification, 
                    "confidence": round(confidence, 4),
                    "detections": full_det, 
                    "toxicity_rationale": data.get("toxicity_rationale", ""), 
                    "identity_rationale": data.get("identity_rationale", ""),
                    "sub_types": data.get("sub_types", {}),
                    "tokens": [],  # Zero-shot does NOT produce token attribution
                    # Store raw values for formula display
                    "log_prob_toxic": round(log_prob_toxic, 4),
                    "log_prob_nontoxic": round(log_prob_nontoxic, 4),
                    "score": round(score, 4)
                }, prompt, content
                
            logger.warning(f"Zero-Shot attempt {attempt+1} parsed JSON failed.")
        except Exception as e: 
            logger.warning(f"Zero-Shot attempt {attempt+1} Error: {e}")
            
        if attempt < max_retries - 1:
            await asyncio.sleep(base_delay * (2 ** attempt))

    logger.error("Zero-Shot Inference failed permanently after retries.")
    return {"toxicity": "Non-Toxic", "confidence": 0.0, "detections": {i: 0 for i in identities}, "toxicity_rationale": "API Failure", "identity_rationale": "API Failure", "tokens": [], "log_prob_toxic": 0.0, "log_prob_nontoxic": 0.0, "score": 0.0}, prompt, ""

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
async def stream_evaluate(file_id: int, batch_size: int = 10, model: str = "meta/llama-3.1-70b-instruct", db: Session = Depends(get_db)):
    async def event_generator():
        # Fetch pending comments in a non-blocking way
        def get_pending():
            return db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "pending").limit(batch_size).all()
        
        pending = await run_in_threadpool(get_pending)
        if not pending: yield f"data: {json.dumps({'done': True})}\n\n"; return
        
        total = len(pending)
        processed = 0
        semaphore = asyncio.Semaphore(5)
        db_lock = asyncio.Lock()          # Serialize DB writes — SQLAlchemy sessions are NOT thread-safe
        progress_queue = asyncio.Queue()  # Real-time progress events
        
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
        
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async def run_one(c):
                nonlocal processed
                async with semaphore:
                    try:
                        res, prompt, raw_res = await unified_inference_async(client, c.text, model)
                    except Exception as e:
                        logger.error(f"Evaluation failed for comment {c.id}: {e}")
                        processed += 1
                        await progress_queue.put(processed)
                        return
                    
                    if res is not None:
                        def save_result():
                            c.predicted_classification = res["toxicity"]
                            c.confidence = res["confidence"]
                            c.toxicity_rationale = res["toxicity_rationale"]
                            c.identity_rationale = res["identity_rationale"]
                            c.identity_response = raw_res
                            c.identity_prompt = prompt
                            c.status = "evaluated"
                            
                            for ident, val in res.get("detections", {}).items():
                                if hasattr(c, ident):
                                    setattr(c, ident, float(val))
                            
                            # Save Predicted Sub-Types
                            st = res.get("sub_types", {})
                            c.severe_toxicity = float(st.get("severe", 0.0))
                            c.obscene = float(st.get("obscene", 0.0))
                            c.threat = float(st.get("threat", 0.0))
                            c.insult = float(st.get("insult", 0.0))
                            c.identity_attack = float(st.get("identity_attack", 0.0))
                            c.sexual_explicit = float(st.get("sexual_explicit", 0.0))
                            
                            c.tokens_json = json.dumps({
                                "toxicity_rationale": res["toxicity_rationale"], 
                                "prompt": prompt, 
                                "raw_response": raw_res,
                                "tokens": res.get("tokens", []),
                                "log_prob_toxic": res.get("log_prob_toxic", 0.0),
                                "log_prob_nontoxic": res.get("log_prob_nontoxic", 0.0),
                                "score": res.get("score", 0.0)
                            })
                            
                            db.commit()
                            cache_invalidate_prefix(f"file-state:{file_id}")
                            cache_invalidate_prefix(f"evaluated-comments:{file_id}")
                            cache_invalidate_prefix(f"metrics:{file_id}")

                        # Serialize DB writes with lock to prevent concurrent commit crashes
                        async with db_lock:
                            await run_in_threadpool(save_result)
                    
                    processed += 1
                    await progress_queue.put(processed)

            # Launch all tasks as a background coroutine
            batch_task = asyncio.ensure_future(
                asyncio.gather(*[run_one(c) for c in pending], return_exceptions=True)
            )
            
            # Stream progress events in real-time while tasks run
            while not batch_task.done() or not progress_queue.empty():
                try:
                    current = await asyncio.wait_for(progress_queue.get(), timeout=0.5)
                    yield f"data: {json.dumps({'type': 'progress', 'processed': current, 'total': total})}\n\n"
                except asyncio.TimeoutError:
                    if batch_task.done():
                        break
            
            # Drain any remaining queue items
            while not progress_queue.empty():
                current = await progress_queue.get()
                yield f"data: {json.dumps({'type': 'progress', 'processed': current, 'total': total})}\n\n"
            
            # Check for unexpected exceptions
            results = batch_task.result()
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"Unexpected error in batch task {i}: {r}")

        yield f"data: {json.dumps({'type': 'complete'})}\n\n"
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/stream-scan/{file_id}")
async def stream_scan(file_id: int, model: str = "meta/llama-3.1-70b-instruct", db: Session = Depends(get_db)):
    async def event_generator():
        def get_to_scan():
            comments = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated").all()
            return [c for c in comments if not c.identity_response]
            
        to_scan = await run_in_threadpool(get_to_scan)
        if not to_scan: yield f"data: {json.dumps({'done': True})}\n\n"; return
        
        total, processed, semaphore = len(to_scan), 0, asyncio.Semaphore(5)
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
        
        async with httpx.AsyncClient() as client:
            async def scan_one(c):
                nonlocal processed
                async with semaphore:
                    res, prompt, raw_res = await unified_inference_async(client, c.text, model)
                    
                    def save_scan():
                        for ident, val in res["detections"].items():
                            if hasattr(c, ident): setattr(c, ident, float(val))
                        c.identity_prompt, c.identity_response = prompt, raw_res
                        cur = json.loads(c.tokens_json) if c.tokens_json else {}
                        cur.update({"raw_response": raw_res, "prompt": prompt})
                        c.tokens_json = json.dumps(cur)
                        db.commit()
                        cache_invalidate_prefix(f"metrics:{file_id}"); cache_invalidate_prefix(f"file-state:{file_id}"); cache_invalidate_prefix(f"evaluated-comments:{file_id}")
                        
                    await run_in_threadpool(save_scan)
                    processed += 1
            tasks = [scan_one(c) for c in to_scan]
            for coro in asyncio.as_completed(tasks): 
                await coro
                yield f"data: {json.dumps({'type': 'progress', 'current': processed, 'total': total})}\n\n"
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
def get_evaluated_comments(file_id: int, limit: int = 100, skip: int = 0, search: str = None, classification: str = None, sort_by: str = None, db: Session = Depends(get_db)):
    ck = f"evaluated-comments:{file_id}:{limit}:{skip}:{search}:{classification}:{sort_by}"
    cached = cache_get(ck)
    if cached is not None: return cached
    
    q = db.query(CommentEvaluation).filter(CommentEvaluation.file_id == file_id, CommentEvaluation.status == "evaluated")
    
    if classification:
        q = q.filter(CommentEvaluation.predicted_classification == classification)
    if search:
        q = q.filter(CommentEvaluation.text.ilike(f"%{search}%"))
        
    if sort_by == "confidence_asc":
        q = q.order_by(CommentEvaluation.confidence.asc())
    elif sort_by == "confidence_desc":
        q = q.order_by(CommentEvaluation.confidence.desc())
    elif sort_by == "prediction":
        q = q.order_by(CommentEvaluation.predicted_classification.asc())
    elif sort_by == "ground_truth":
        q = q.order_by(CommentEvaluation.ground_truth_label.asc())
    else:
        q = q.order_by(CommentEvaluation.id.asc())
        
    total = q.count()
    comments = q.offset(skip).limit(limit).all()
    
    result = {
        "total": total,
        "items": [{
            "id": c.id, "text": c.text, "predicted_classification": c.predicted_classification, 
            "confidence": c.confidence, "tokens_json": c.tokens_json, "target": c.target,
            "ground_truth_label": "Toxic" if c.target != -1.0 and c.target > 0.5 else "Non-Toxic" if c.target != -1.0 else None,
            "severe_toxicity": c.severe_toxicity, "obscene": c.obscene, "threat": c.threat, "insult": c.insult,
            "identity_prompt": c.identity_prompt, "identity_response": c.identity_response
        } for c in comments]
    }
    
    cache_set(ck, result)
    return result

def calculate_metrics(ev, target_col='target'):
    if not ev: return None
    has_labels = any(c.target != -1.0 for c in ev)
    
    def get_stats(subset):
        n = len(subset)
        if n == 0: return {"n": 0, "accuracy": 0, "f1": 0, "tpr": 0, "fpr": 0, "precision": 0, "ppr": 0, "tp": 0, "fp": 0, "tn": 0, "fn": 0}
        
        pos_pred = len([c for c in subset if c.predicted_classification == "Toxic"])
        ppr = pos_pred / n
        
        if has_labels:
            # Only count records that actually have ground truth labels (target != -1.0)
            labeled = [c for c in subset if c.target != -1.0]
            n_labeled = len(labeled)
            if n_labeled == 0:
                return {"n": n, "accuracy": 0, "f1": 0, "tpr": 0, "fpr": 0, "precision": 0, "ppr": ppr, "tp": 0, "fp": 0, "tn": 0, "fn": 0}
            
            tp = len([c for c in labeled if c.predicted_classification == "Toxic" and c.target > 0.5])
            fp = len([c for c in labeled if c.predicted_classification == "Toxic" and c.target <= 0.5])
            fn = len([c for c in labeled if c.predicted_classification == "Non-Toxic" and c.target > 0.5])
            tn = len([c for c in labeled if c.predicted_classification == "Non-Toxic" and c.target <= 0.5])
            act_pos = tp + fn
            act_neg = fp + tn
            
            prec = tp / (tp + fp) if (tp + fp) > 0 else 0
            rec = tp / act_pos if act_pos > 0 else 0
            
            return {
                "n": n,
                "accuracy": (tp + tn) / n_labeled if n_labeled > 0 else 0,
                "f1": 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0,
                "tpr": rec,
                "fpr": fp / act_neg if act_neg > 0 else 0,
                "precision": prec,
                "ppr": ppr,
                "tp": tp, "fp": fp, "tn": tn, "fn": fn
            }
        else:
            # No ground truth — only PPR (prediction positive rate) is meaningful
            return {"n": n, "accuracy": 0, "f1": 0, "tpr": 0, "fpr": 0, "precision": 0, "ppr": ppr, "tp": 0, "fp": 0, "tn": 0, "fn": 0}

    def get_word_cloud(subset):
        import re
        from collections import Counter
        fp_comments = [c.text for c in subset if c.predicted_classification == "Toxic" and c.target <= 0.5]
        if not fp_comments: return []
        text = " ".join(fp_comments).lower()
        words = re.findall(r'\b[a-z]{4,}\b', text)
        stops = {"this", "that", "with", "from", "your", "have", "they", "will", "would", "could", "should", "what", "when", "where", "which", "there", "their", "about", "these"}
        filtered = [w for w in words if w not in stops]
        return [{"text": w, "value": c} for w, c in Counter(filtered).most_common(5)]

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
        di = s1["ppr"] / s0["ppr"] if s0["ppr"] > 0 else (1.0 if s1["ppr"] == 0 else float('inf'))
        fp_word_cloud = get_word_cloud(a1_list)
        
        # Samples for the UI — prioritize toxic predictions first, then errors
        samples = []
        toxic_pred = [c for c in a1_list if c.predicted_classification == "Toxic"]
        nontoxic_errors = [c for c in a1_list if c.predicted_classification == "Non-Toxic" and c.target > 0.5]  # missed toxicity
        nontoxic_correct = [c for c in a1_list if c.predicted_classification == "Non-Toxic" and c.target <= 0.5]
        # Order: toxic predictions (errors first) → missed toxicity → correct non-toxic
        toxic_pred.sort(key=lambda c: 0 if c.target <= 0.5 else 1)  # FP errors first within toxic
        unique_samples = []
        seen_ids = set()
        for c in (toxic_pred + nontoxic_errors + nontoxic_correct):
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
            "di": di,
            "a1": s1, 
            "a0": s0,
            "samples": samples,
            "fp_word_cloud": fp_word_cloud
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

    overall["count"] = overall["n"]
    return {
        "has_labels": has_labels,
        "overall": overall,
        "subgroups": ident_res,
        "worst_case": worst,
        "diagnostics": {"group_counts": {i: len([c for c in ev if getattr(c, i, 0) > 0.5]) for i in ids}, "min_required": 1}
    }

@app.get("/metrics")
def get_metrics(file_id: int = None, force: bool = False, db: Session = Depends(get_db)):
    ck = f"metrics:{file_id}"
    if not force:
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
