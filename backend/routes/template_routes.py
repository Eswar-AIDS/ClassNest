from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from auth import get_current_user

router = APIRouter(tags=["Templates"])

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
ASSETS_DIR = WORKSPACE_ROOT / "assets"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def template_response(file_name: str):
    path = (ASSETS_DIR / file_name).resolve()
    if ASSETS_DIR.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "Template file not found")
    return FileResponse(path, media_type=XLSX_MIME, filename=file_name)


@router.get("/templates/assessment-import")
def assessment_import_template(_user=Depends(get_current_user)):
    return template_response("ClassNest_Assessment_Clean_Template.xlsx")


@router.get("/templates/answer-key-evaluation")
def answer_key_evaluation_template(_user=Depends(get_current_user)):
    return template_response("ClassNest_AnswerKey_Evaluation_Template.xlsx")
