# ClassNest

ClassNest is a full-stack classroom learning platform built with FastAPI, SQLite, React, and Tailwind CSS. Roles belong to classroom memberships, so one account can teach one class and be a student in another.

## Prerequisites

- Python 3.10+
- Node.js 20+

## Run the backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`. Interactive API docs are at `http://localhost:8000/docs`. The SQLite database and sample records are created automatically on first startup.

## Run the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

To use a different API URL, create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000/api
```

## Sample accounts

| Account | Email | Password |
| --- | --- | --- |
| Teacher | `teacher@classnest.com` | `teacher123` |
| Student | `student@classnest.com` | `student123` |

The seeded **Python Basics** classroom includes three units, a Markdown lesson, and a published five-question MCQ test. Its join code is `PYTHON1`.

## Production note

Set a strong `SECRET_KEY` environment variable before deploying the API. The default key is intended only for local development.
