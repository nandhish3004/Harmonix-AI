# HARMONIX-AR PyTorch + Hugging Face AI Backend

This microservice powers the advanced AI capabilities of HARMONIX-AR using:
- **`facebook/dinov2-small`** (Self-Supervised Vision Transformer) for PCB/workpiece foreground segmentation
- **`MIT/ast-finetuned-audioset-10-10-0.4593`** (Audio Spectrogram Transformer) for tap-test acoustic resonance & anomaly classification
- **PyTorch `ModalPINNSurrogate`** for standing-wave nodal field & virtual standoff damping simulation

## Run Locally
```bash
cd ai-backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

In your Next.js `.env.local` (or Vercel Environment Variables), set:
```env
NEXT_PUBLIC_AI_BACKEND_URL=http://localhost:8000
```
*(If the Python server is offline, the Next.js frontend automatically falls back to its built-in browser CV/WebAudio/Physics engine.)*
