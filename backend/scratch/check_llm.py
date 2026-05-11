import asyncio
import httpx
import os

NVIDIA_NIM_API_KEY = os.environ.get("NVIDIA_API_KEY", "")

async def main():
    if not NVIDIA_NIM_API_KEY:
        print("Missing NVIDIA_API_KEY")
        return

    text = "You are stupid"
    model = "meta/llama-3.1-8b-instruct"
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
        "max_tokens": 512,
        "response_format": {"type": "json_object"}
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post("https://integrate.api.nvidia.com/v1/chat/completions", headers=headers, json=payload, timeout=60.0)
        print("Status Code:", response.status_code)
        if response.status_code == 200:
            data = response.json()
            content = data['choices'][0]['message']['content']
            print("Raw Output:")
            print(content)
            
            import re, json
            match = re.search(r'(\[.*\]|\{.*\})', content, re.DOTALL)
            if match:
                try:
                    res = json.loads(match.group())
                    print("Parse Success:", res)
                except Exception as e:
                    print("JSON Parse Error:", e)
                    print("Matched Group:")
                    print(match.group())
            else:
                print("No match found")
        else:
            print("Error Response:", response.text)

if __name__ == "__main__":
    asyncio.run(main())
