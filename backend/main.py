import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import Base, engine, DB_TYPE, ensure_assessment_attempt_columns, ensure_assessment_columns, ensure_classroom_columns, ensure_unit_columns, ensure_user_profile_columns
from seed import seed_database
from routes import assessment_routes, auth_routes, classroom_routes, coding_routes, notification_routes, template_routes, unit_routes, material_routes, test_routes, result_routes, user_routes

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Log database initialization
    print(f"🗄️  Initializing {DB_TYPE} database...")
    
    Base.metadata.create_all(bind=engine)
    ensure_user_profile_columns()
    ensure_assessment_columns()
    ensure_assessment_attempt_columns()
    ensure_unit_columns()
    ensure_classroom_columns()
    seed_database()
    
    print(f"✅ Database ready ({DB_TYPE})")
    yield
    print(f"🛑 Shutting down...")


app = FastAPI(title="ClassNest API", version="1.0.0", lifespan=lifespan)

# Configure CORS from environment
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
allow_origins = [
    FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in [auth_routes.router, user_routes.router, classroom_routes.router, unit_routes.router, material_routes.router, assessment_routes.router, coding_routes.router, notification_routes.router, template_routes.router, test_routes.router, result_routes.router]:
    app.include_router(router, prefix="/api")


@app.get("/api/health")
def health(): return {"status": "ok"}
