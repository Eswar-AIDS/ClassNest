from datetime import datetime


def normalize_code(value: str | None, case_sensitive: bool) -> str:
    normalized = "\n".join(line.rstrip() for line in (value or "").replace("\r\n", "\n").replace("\r", "\n").strip().split("\n"))
    return normalized if case_sensitive else normalized.casefold()


def accepted_answer_values(value: str | None) -> list[str]:
    if not value:
        return []
    parts = []
    for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        for item in line.split("||"):
            stripped = item.strip()
            if stripped:
                parts.append(stripped)
    return parts


def evaluate_submission(submission, task):
    key = task.answer_key
    max_marks = int(task.marks or 0)
    submission.evaluated_at = datetime.utcnow()
    if key is None:
        submission.auto_marks = None
        submission.final_marks = None
        submission.is_correct = None
        submission.evaluation_status = "needs_review"
        submission.evaluation_feedback = "No answer key has been imported. Manual review required."
        return submission

    mode = (key.evaluation_mode or "MANUAL").upper()
    if mode == "MANUAL":
        submission.auto_marks = None
        submission.final_marks = None
        submission.is_correct = None
        submission.evaluation_status = "needs_review"
        submission.evaluation_feedback = "Manual review required."
        return submission

    submitted = normalize_code(submission.code, key.case_sensitive)
    references = []
    if key.correct_answer:
        references.append(key.correct_answer)
    references.extend(accepted_answer_values(key.accepted_answers))
    normalized_references = [normalize_code(reference, key.case_sensitive) for reference in references]
    if submitted and submitted in normalized_references:
        submission.auto_marks = max_marks
        submission.final_marks = max_marks
        submission.marks_awarded = max_marks
        submission.is_correct = True
        submission.status = "evaluated"
        submission.evaluation_status = "auto_evaluated"
        submission.evaluation_feedback = "Auto evaluated by exact answer match."
        return submission

    if key.expected_output:
        submission.auto_marks = None
        submission.final_marks = None
        submission.is_correct = None
        submission.evaluation_status = "needs_review"
        submission.evaluation_feedback = "Code submitted. Expected output available. Compiler execution not enabled yet."
        return submission

    submission.auto_marks = 0
    submission.final_marks = 0
    submission.marks_awarded = 0
    submission.is_correct = False
    submission.status = "evaluated"
    submission.evaluation_status = "auto_evaluated"
    submission.evaluation_feedback = "Auto evaluated by static answer matching. No reference matched."
    return submission
