"""
MediChat AI — FastAPI Backend
Serves the fine-tuned TinyLlama model and handles auth + chat.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""

import os
import re
import json
import uuid
import hashlib
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import jwt

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "fallback-dev-key")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_HOURS = 24

# Path to your exported model ZIP (or already-extracted folder)


# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="MediChat AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://YOUR-APP.vercel.app",   # ← your Vercel frontend URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ── Simple in-memory user store (replace with SQLite/Postgres in prod) ────────
# Structure: { email: { password_hash, gender, age, weight, created_at } }
USERS: dict = {}

# ── Model globals ─────────────────────────────────────────────────────────────
model     = None
tokenizer = None
device    = None

SYSTEM_PROMPT = (
    "You are a knowledgeable and compassionate medical assistant. "
    "Provide clear, accurate, and concise answers to patient questions. "
    "Always remind patients to consult a qualified doctor for diagnosis and treatment."
)

RESPONSE_OPENERS = [
    "hi there ~", "hi there,", "hello there,", "hi,", "hello,",
    "hi. i am happy to help.", "hi. i hope i can help you today.",
    "hi. thanks for writing in.", "hi,thanks for writing in.",
    "thanks for writing in.", "thank you for writing in.",
    "hi, i understand your concern.", "hello, i understand your concern.",
]

SPECIFIC_DRUGS = [
    "ibuprofen", "diclofenac", "paracetamol", "acetaminophen",
    "aspirin", "naproxen", "amoxicillin", "azithromycin",
    "metformin", "lisinopril", "atorvastatin", "omeprazole",
    "pantoprazole", "prednisone", "dexamethasone", "metoclopramide",
]

DISCLAIMER = (
    " Please do not take any medication without consulting your doctor first, "
    "as the right treatment depends on your specific condition and medical history."
)

# ── Model loading ─────────────────────────────────────────────────────────────

BASE_MODEL   = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
ADAPTER_REPO = "Vivekumar454/medichat"  # HF model repo

def load_model():
    global model, tokenizer, device
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype  = torch.float16 if device == "cuda" else torch.float32

    print("📥 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(ADAPTER_REPO)
    tokenizer.pad_token = tokenizer.eos_token

    print("📥 Loading base model...")
    base_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=dtype,
        device_map="auto" if device == "cuda" else None,
    )

    print("🔗 Applying LoRA adapter...")
    model = PeftModel.from_pretrained(base_model, ADAPTER_REPO)
    model.eval()

    if device == "cpu":
        model = model.to(device)

    print("✅ Model ready!")

def strip_opener(text: str) -> str:
    lower = text.lower()
    for opener in RESPONSE_OPENERS:
        if lower.startswith(opener):
            text = text[len(opener):].strip()
            if text:
                text = text[0].upper() + text[1:]
            break
    return text


def clean_response(text: str) -> str:
    text = strip_opener(text)

    cutoff_phrases = [
        "Best regards", "Thank you for", "Take care", "Good luck",
        "Hope this helps", "Feel free to", "Do not hesitate",
        "I hope I have", "Regards,", "Thanks for writing",
        "Sara Berman", "Let me know if",
    ]
    for phrase in cutoff_phrases:
        if phrase.lower() in text.lower():
            idx = text.lower().index(phrase.lower())
            text = text[:idx].strip()
            break

    # Remove trailing incomplete sentence
    if text and not text[-1] in ".!?":
        last_period = max(text.rfind("."), text.rfind("!"), text.rfind("?"))
        if last_period > len(text) // 2:
            text = text[:last_period + 1]

    return text.strip()


def build_user_context(user_data: dict) -> str:
    """Build a context string from user profile to personalize responses."""
    parts = []
    if user_data.get("age"):
        parts.append(f"Patient age: {user_data['age']} years old")
    if user_data.get("gender"):
        parts.append(f"Patient gender: {user_data['gender']}")
    if user_data.get("weight"):
        parts.append(f"Patient weight: {user_data['weight']} kg")
    return ". ".join(parts) + "." if parts else ""


def generate_response(question: str, user_context: str = "", max_new_tokens: int = 250) -> str:
    """Generate a response using the fine-tuned model."""
    if model is None or tokenizer is None:
        # Demo mode — return a placeholder
        return (
            "I'm currently running in demo mode without the AI model loaded. "
            "Please ensure the model ZIP file is placed at ./medical-chatbot-model.zip "
            "and restart the server. For now, always consult a qualified healthcare professional "
            "for any medical concerns."
        )

    # Personalise system prompt with user context
    system = SYSTEM_PROMPT
    if user_context:
        system += f" Context about the patient: {user_context}"

    prompt = (
        f"<|system|>\n{system}</s>\n"
        f"<|user|>\n{question.strip()}</s>\n"
        f"<|assistant|>\n"
    )

    inputs = tokenizer(prompt, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
            top_k=50,
            repetition_penalty=1.2,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    new_tokens = outputs[0][inputs["input_ids"].shape[1]:]
    response = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    response = clean_response(response)

    if any(drug in response.lower() for drug in SPECIFIC_DRUGS):
        response += DISCLAIMER

    return response


# ── Auth helpers ──────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def create_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": email, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email not in USERS:
            raise HTTPException(status_code=401, detail="User not found")
        return {"email": email, **USERS[email]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    gender: str
    age: int
    weight: float


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    load_model()


@app.get("/")
def root():
    return {"status": "MediChat AI is running", "model_loaded": model is not None}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "device": str(device) if device else "none",
    }


@app.post("/auth/signup", status_code=201)
def signup(req: SignupRequest):
    if req.email in USERS:
        raise HTTPException(status_code=400, detail="Email already registered")

    if req.age < 1 or req.age > 120:
        raise HTTPException(status_code=400, detail="Invalid age")
    if req.weight < 1 or req.weight > 500:
        raise HTTPException(status_code=400, detail="Invalid weight")

    USERS[req.email] = {
        "password_hash": hash_password(req.password),
        "gender": req.gender,
        "age": req.age,
        "weight": req.weight,
        "created_at": datetime.utcnow().isoformat(),
    }

    token = create_token(req.email)
    return {
        "token": token,
        "user": {
            "email": req.email,
            "gender": req.gender,
            "age": req.age,
            "weight": req.weight,
        },
    }


@app.post("/auth/login")
def login(req: LoginRequest):
    user = USERS.get(req.email)
    if not user or user["password_hash"] != hash_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(req.email)
    return {
        "token": token,
        "user": {
            "email": req.email,
            "gender": user["gender"],
            "age": user["age"],
            "weight": user["weight"],
        },
    }


@app.get("/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "email": current_user["email"],
        "gender": current_user["gender"],
        "age": current_user["age"],
        "weight": current_user["weight"],
    }


@app.post("/chat")
def chat(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_context = build_user_context(current_user)
    response = generate_response(req.message, user_context)

    return {
        "response": response,
        "timestamp": datetime.utcnow().isoformat(),
    }
