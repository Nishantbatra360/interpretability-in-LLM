# LLM Interpretability Dashboard

A full-stack web application designed to evaluate explanation consistency in Zero-Shot LLM toxicity classification. The application classifies user comments as toxic or non-toxic and provides complete interpretability, including token-level importance heatmaps and fairness metrics.

## Architecture

- **Backend:** FastAPI (Python), NVIDIA NIM for LLM inference
- **Frontend:** React.js (Vite), Vanilla CSS (Analytical Precision Theme)
- **Data:** HuggingFace Civil Comments Dataset (Sample)

## Setup Instructions

### Backend
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create a Python virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate the virtual environment:
   - **Windows:**
     ```bash
     venv\Scripts\activate
     ```
   - **macOS/Linux:**
     ```bash
     source venv/bin/activate
     ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Add your `.env` file with your `nvidia_api` key.
6. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend
1. Navigate to the `frontend` folder.
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`

## Design Theme
The UI follows the "Analytical Precision" design system, prioritizing information density over decorative elements, using a slate gray and crisp white palette.
