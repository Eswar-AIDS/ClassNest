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

## Completed features

### Authentication and user profiles

- User registration and login with JWT authentication.
- Neutral user accounts: users do not have a fixed global student/teacher role.
- Classroom-based roles through `ClassMember.role`, so the same user can teach one class and learn in another.
- Profile dropdown in the navbar with Profile, Settings, My Classes, and Logout.
- Profile page with user details, bio/avatar fields, account date, teaching count, and learning count.
- Account settings page for updating name, bio, and avatar URL.

### Classroom management

- Teacher classroom creation with automatic teacher membership.
- Student classroom joining by join code.
- Invite-link classroom joining with `/join/:joinCode`.
- Dashboard separated into Teaching and Learning sections based on classroom membership role.
- Classroom detail page with clean class header, join code, invite link copy, units, and teacher management actions.
- Teacher-only classroom edit support.
- Teacher-only classroom delete/archive support.
- Archived classrooms are hidden from normal dashboard lists.
- Teacher-only class members page.
- Teacher-only member removal from a classroom without deleting the user account or old submissions.

### Units and learning materials

- Teacher-only unit creation, editing, and deletion.
- Unit cards with teacher-only Edit/Delete controls and student-safe navigation.
- Markdown material reader with clean documentation-style display.
- Teacher material creation with title, Markdown description, optional resource URL, and file attachments.
- Multiple material attachments per material with validation for supported file types and size limits.
- Attachment metadata stored in the database; files are stored locally under `backend/uploads/materials/{material_id}/`.
- Material attachment download/open support for class members.
- Teacher-only material edit, delete, upload additional attachments, and delete attachment controls.

### Assessments and tests

- Teacher assessment creation from Excel workbooks.
- Assessment import wired for the clean ClassNest assessment template.
- Supports MCQ, fill-up, and coding questions from the import workflow.
- Teacher assessment management page with tabs for Question Paper, Answer Key, Attempts, Evaluation, Results, and Templates.
- Student-facing Question Paper preview hides answer-key/private fields.
- Teacher-only Answer Key view shows correct answers, accepted answers, explanations, and hidden coding test data.
- Teacher-only assessment edit, delete/archive, manage, and preview controls.
- Assessment delete archives instead of hard-deleting when submissions exist.
- Download buttons for assessment import and answer-key/evaluation templates.

### Coding assessments

- Student coding questions use Monaco Editor for Python answers.
- Starter code is pre-filled for coding questions.
- Student code answers are saved as `code_answer`.
- Run Code flow checks visible test cases only.
- Backend `POST /coding/run` executes Python code with a development-only subprocess timeout and basic dangerous-import/function blocking.
- Output panel shows stdout, stderr, error type, syntax/indentation/runtime errors, and visible test-case results.
- Hidden test cases and private answer fields are not exposed to students.

### Evaluation and result publishing

- Answer-key import support for teacher evaluation.
- MCQ and fill-up auto-evaluation using imported answer keys.
- Wrong answers are clearly marked in the teacher Evaluation tab.
- Evaluation statuses include Correct, Incorrect, Needs Manual Review, Not Answered, and Answer Key Missing.
- Teacher can manually override marks and feedback.
- Save All Marks support for saving a student's full evaluation at once.
- Per-student result publishing support.
- Publish All Results unlocks only when every submitted student is fully evaluated.
- Student results are visible only after that student's result is published.
- Student result review page shows clear correct, incorrect, reviewed/partial, and not answered indicators.
- Result summary includes score, percentage, correct count, incorrect count, reviewed/partial count, and not answered count.

### Results and notifications

- Class results page upgraded into a performance dashboard.
- Teacher can review assessment-level and class-level performance data.
- Email notification support for teachers to send custom messages to class students.
- Environment example file documents email configuration values.

### UI and UX polish

- Modern classroom/SaaS-style UI using React and Tailwind CSS.
- Clean white/neutral layout, professional cards, focused assessment pages, and readable Markdown material pages.
- Mobile-friendly layouts for major pages.
- Teacher controls are shown only for classroom teachers.
- Student actions are simplified and hidden from teacher-only management controls.

## Production note

Set a strong `SECRET_KEY` environment variable before deploying the API. The default key is intended only for local development.
