from auth import hash_password
from database import SessionLocal
import models


DEMO_ASSESSMENT_TITLE = "Python Foundations Check"
DEMO_QUESTIONS = [
    ("Which function displays output?", "input()", "print()", "show()", "write()", "B", "print() writes values to standard output."),
    ("Which extension is used for Python files?", ".py", ".pt", ".js", ".python", "A", "Python source files conventionally use .py."),
    ("Which value is a Boolean?", "'True'", "1.0", "True", "TRUE", "C", "True is one of Python's two Boolean values."),
    ("How do you start a comment?", "//", "#", "<!--", "--", "B", "A hash starts a single-line comment."),
    ("Which symbol assigns a value?", "==", ":=", "=", "=>", "C", "The equals sign is the assignment operator."),
]


def create_standard_assessment(db, unit, teacher, legacy_test=None):
    """Create the seeded assessment using the same models as uploaded assessments."""
    assessment = models.Assessment(
        unit_id=unit.id,
        title=legacy_test.title if legacy_test else DEMO_ASSESSMENT_TITLE,
        description=legacy_test.description if legacy_test else "Check your understanding of Python basics.",
        duration_minutes=legacy_test.duration_minutes if legacy_test else 10,
        is_published=legacy_test.is_published if legacy_test else True,
        is_accepting_responses=not bool(legacy_test and legacy_test.attempts),
        results_published=bool(legacy_test and legacy_test.attempts),
        created_by_user_id=teacher.id,
    )
    db.add(assessment)
    db.flush()

    source_questions = legacy_test.questions if legacy_test else []
    question_rows = [
        (item.question, item.option_a, item.option_b, item.option_c, item.option_d, item.correct_option, item.explanation, item.marks)
        for item in source_questions
    ] or [(*item, 1) for item in DEMO_QUESTIONS]
    question_map = {}
    for order, row in enumerate(question_rows, start=1):
        question = models.AssessmentQuestion(
            assessment_id=assessment.id,
            question_id_from_excel=f"DEMO-{order}",
            question_type="MCQ",
            question_text=row[0],
            option_a=row[1], option_b=row[2], option_c=row[3], option_d=row[4],
            marks=row[7], order_number=order,
        )
        question.answer_key = models.AssessmentAnswerKey(correct_answer=row[5], explanation=row[6])
        db.add(question)
        if source_questions:
            question_map[source_questions[order - 1].id] = question
    db.flush()

    if legacy_test:
        migrated_students = set()
        for old_attempt in sorted(legacy_test.attempts, key=lambda item: item.submitted_at, reverse=True):
            if old_attempt.student_id in migrated_students:
                continue
            migrated_students.add(old_attempt.student_id)
            attempt = models.AssessmentAttempt(
                assessment_id=assessment.id, student_id=old_attempt.student_id,
                status="published", score=old_attempt.score, total_marks=old_attempt.total_marks,
                submitted_at=old_attempt.submitted_at, evaluated_at=old_attempt.submitted_at,
                published_at=old_attempt.submitted_at,
            )
            db.add(attempt)
            db.flush()
            for old_answer in old_attempt.answers:
                question = question_map.get(old_answer.question_id)
                if question:
                    db.add(models.AssessmentResponse(
                        attempt_id=attempt.id, question_id=question.id,
                        selected_option=old_answer.selected_option,
                        awarded_marks=question.marks if old_answer.is_correct else 0,
                        is_correct=old_answer.is_correct,
                        feedback=question.answer_key.explanation,
                    ))
        db.delete(legacy_test)
    return assessment


def seed_database():
    db = SessionLocal()
    try:
        teacher = db.query(models.User).filter_by(email="teacher@classnest.com").first()
        if teacher:
            # One-time upgrade for databases seeded before the standard assessment system.
            legacy = db.query(models.MCQTest).filter_by(title=DEMO_ASSESSMENT_TITLE, created_by_user_id=teacher.id).first()
            if legacy:
                existing = db.query(models.Assessment).filter_by(unit_id=legacy.unit_id, title=legacy.title).first()
                if not existing:
                    create_standard_assessment(db, legacy.unit, teacher, legacy)
                    db.commit()
            return

        teacher = models.User(name="Maya Teacher", email="teacher@classnest.com", password_hash=hash_password("teacher123"))
        student = models.User(name="Alex Student", email="student@classnest.com", password_hash=hash_password("student123"))
        db.add_all([teacher, student]); db.flush()
        room = models.Classroom(name="Python Basics", subject="Computer Science", description="Build a strong foundation in Python programming.", join_code="PYTHON1", created_by_user_id=teacher.id)
        db.add(room); db.flush()
        db.add_all([models.ClassMember(classroom_id=room.id, user_id=teacher.id, role="teacher"), models.ClassMember(classroom_id=room.id, user_id=student.id, role="student")])
        units = [models.Unit(classroom_id=room.id, title="Getting Started", description="Python setup, syntax, and your first program.", order_number=1), models.Unit(classroom_id=room.id, title="Variables and Types", description="Store and transform data.", order_number=2), models.Unit(classroom_id=room.id, title="Control Flow", description="Make decisions and repeat work.", order_number=3)]
        db.add_all(units); db.flush()
        db.add(models.Material(unit_id=units[0].id, title="Welcome to Python", type="markdown", content_markdown="# Welcome to Python\n\nPython is a readable, versatile programming language.\n\n## Your first program\n\n```python\nprint(\"Hello, ClassNest!\")\n```\n\nRun it and observe the output.", created_by_user_id=teacher.id))
        create_standard_assessment(db, units[0], teacher)
        db.commit()
    finally:
        db.close()
