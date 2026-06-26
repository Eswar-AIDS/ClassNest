from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship, validates
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Classroom(Base):
    __tablename__ = "classrooms"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    subject = Column(String(160), nullable=False)
    description = Column(Text, default="")
    join_code = Column(String(10), unique=True, index=True, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    archived = Column(Boolean, default=False, nullable=False)
    archived_at = Column(DateTime, nullable=True)
    units = relationship("Unit", cascade="all, delete-orphan", back_populates="classroom")
    members = relationship("ClassMember", cascade="all, delete-orphan", back_populates="classroom")


class ClassMember(Base):
    __tablename__ = "class_members"
    __table_args__ = (UniqueConstraint("classroom_id", "user_id"),)
    id = Column(Integer, primary_key=True)
    classroom_id = Column(Integer, ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(10), nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    classroom = relationship("Classroom", back_populates="members")
    user = relationship("User")

    @validates("role")
    def validate_role(self, _key, role):
        if role not in {"teacher", "student"}:
            raise ValueError("Class membership role must be 'teacher' or 'student'")
        return role


class Unit(Base):
    __tablename__ = "units"
    id = Column(Integer, primary_key=True)
    classroom_id = Column(Integer, ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    order_number = Column(Integer, default=1)
    archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    classroom = relationship("Classroom", back_populates="units")
    materials = relationship("Material", cascade="all, delete-orphan", back_populates="unit")
    tests = relationship("MCQTest", cascade="all, delete-orphan", back_populates="unit")


class Material(Base):
    __tablename__ = "materials"
    id = Column(Integer, primary_key=True)
    unit_id = Column(Integer, ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    type = Column(String(10), nullable=False)
    content_markdown = Column(Text, nullable=True)
    resource_url = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    unit = relationship("Unit", back_populates="materials")
    attachments = relationship("MaterialAttachment", cascade="all, delete-orphan", back_populates="material")


class MaterialAttachment(Base):
    __tablename__ = "material_attachments"
    id = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("materials.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    stored_file_name = Column(String(255), nullable=False, unique=True)
    file_path = Column(String(500), nullable=True)
    file_type = Column(String(20), nullable=False)
    mime_type = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    storage_provider = Column(String(20), default="local", nullable=False)
    local_path = Column(String(500), nullable=True)
    storage_path = Column(String(500), nullable=True)
    material = relationship("Material", back_populates="attachments")


class MCQTest(Base):
    __tablename__ = "mcq_tests"
    id = Column(Integer, primary_key=True)
    unit_id = Column(Integer, ForeignKey("units.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    duration_minutes = Column(Integer, default=30)
    is_published = Column(Boolean, default=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    unit = relationship("Unit", back_populates="tests")
    questions = relationship("MCQQuestion", cascade="all, delete-orphan", back_populates="test")
    attempts = relationship("TestAttempt", cascade="all, delete-orphan", back_populates="test")


class MCQQuestion(Base):
    __tablename__ = "mcq_questions"
    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("mcq_tests.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    correct_option = Column(String(1), nullable=False)
    explanation = Column(Text, default="")
    marks = Column(Float, default=1)
    test = relationship("MCQTest", back_populates="questions")
    answers = relationship("TestAnswer", cascade="all, delete-orphan", back_populates="question")


class TestAttempt(Base):
    __tablename__ = "test_attempts"
    id = Column(Integer, primary_key=True)
    test_id = Column(Integer, ForeignKey("mcq_tests.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    score = Column(Float, default=0)
    total_marks = Column(Float, default=0)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    test = relationship("MCQTest", back_populates="attempts")
    student = relationship("User")
    answers = relationship("TestAnswer", cascade="all, delete-orphan", back_populates="attempt")


class TestAnswer(Base):
    __tablename__ = "test_answers"
    id = Column(Integer, primary_key=True)
    attempt_id = Column(Integer, ForeignKey("test_attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(Integer, ForeignKey("mcq_questions.id"), nullable=False)
    selected_option = Column(String(1), nullable=True)
    is_correct = Column(Boolean, default=False)
    attempt = relationship("TestAttempt", back_populates="answers")
    question = relationship("MCQQuestion", back_populates="answers")


class Assessment(Base):
    __tablename__ = "assessments"
    id = Column(Integer, primary_key=True)
    unit_id = Column(Integer, ForeignKey("units.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    duration_minutes = Column(Integer, default=0, nullable=True)
    timing_mode = Column(String(20), default="untimed", nullable=False)
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)
    source_excel_file = Column(String(500), nullable=True)
    is_published = Column(Boolean, default=False, nullable=False)
    is_accepting_responses = Column(Boolean, default=False, nullable=False)
    results_published = Column(Boolean, default=False, nullable=False)
    archived = Column(Boolean, default=False, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    unit = relationship("Unit")
    questions = relationship("AssessmentQuestion", cascade="all, delete-orphan", passive_deletes=True, back_populates="assessment", order_by="AssessmentQuestion.order_number")
    attempts = relationship("AssessmentAttempt", cascade="all, delete-orphan", passive_deletes=True, back_populates="assessment")


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"
    id = Column(Integer, primary_key=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id_from_excel = Column(String(100), nullable=False)
    question_type = Column(String(10), nullable=False)
    question_text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=True)
    option_b = Column(Text, nullable=True)
    option_c = Column(Text, nullable=True)
    option_d = Column(Text, nullable=True)
    marks = Column(Float, nullable=False)
    difficulty = Column(String(30), nullable=True)
    starter_code = Column(Text, nullable=True)
    visible_test_cases = Column(Text, nullable=True)
    expected_output = Column(Text, nullable=True)
    case_sensitive = Column(Boolean, default=False, nullable=False)
    tags = Column(Text, nullable=True)
    order_number = Column(Integer, nullable=False)
    assessment = relationship("Assessment", back_populates="questions")
    answer_key = relationship("AssessmentAnswerKey", cascade="all, delete-orphan", passive_deletes=True, back_populates="question", uselist=False)
    responses = relationship("AssessmentResponse", cascade="all, delete-orphan", passive_deletes=True, back_populates="question")


class AssessmentAnswerKey(Base):
    __tablename__ = "assessment_answer_keys"
    id = Column(Integer, primary_key=True)
    question_id = Column(Integer, ForeignKey("assessment_questions.id", ondelete="CASCADE"), nullable=False, unique=True)
    correct_answer = Column(Text, nullable=True)
    accepted_answers = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    hidden_test_cases = Column(Text, nullable=True)
    question = relationship("AssessmentQuestion", back_populates="answer_key")


class AssessmentAttempt(Base):
    __tablename__ = "assessment_attempts"
    __table_args__ = (UniqueConstraint("assessment_id", "student_id"),)
    id = Column(Integer, primary_key=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(30), default="not_started", nullable=False)
    score = Column(Float, default=0, nullable=False)
    total_marks = Column(Float, default=0, nullable=False)
    started_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)
    auto_submit_reason = Column(Text, nullable=True)
    started_email_sent = Column(Boolean, default=False, nullable=False)
    submitted_email_sent = Column(Boolean, default=False, nullable=False)
    left_email_sent = Column(Boolean, default=False, nullable=False)
    evaluated_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    assessment = relationship("Assessment", back_populates="attempts")
    student = relationship("User")
    responses = relationship("AssessmentResponse", cascade="all, delete-orphan", passive_deletes=True, back_populates="attempt")
    events = relationship("AssessmentAttemptEvent", cascade="all, delete-orphan", passive_deletes=True, back_populates="attempt")


class AssessmentResponse(Base):
    __tablename__ = "assessment_responses"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)
    id = Column(Integer, primary_key=True)
    attempt_id = Column(Integer, ForeignKey("assessment_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("assessment_questions.id", ondelete="CASCADE"), nullable=False)
    selected_option = Column(String(1), nullable=True)
    text_answer = Column(Text, nullable=True)
    code_answer = Column(Text, nullable=True)
    awarded_marks = Column(Float, default=0, nullable=False)
    is_correct = Column(Boolean, nullable=True)
    feedback = Column(Text, nullable=True)
    attempt = relationship("AssessmentAttempt", back_populates="responses")
    question = relationship("AssessmentQuestion", back_populates="responses")


class AssessmentAttemptEvent(Base):
    __tablename__ = "assessment_attempt_events"
    id = Column(Integer, primary_key=True)
    attempt_id = Column(Integer, ForeignKey("assessment_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(40), nullable=False)
    event_message = Column(Text, nullable=False)
    event_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    attempt = relationship("AssessmentAttempt", back_populates="events")
    student = relationship("User")
    assessment = relationship("Assessment")


class EmailNotification(Base):
    __tablename__ = "email_notifications"
    id = Column(Integer, primary_key=True)
    classroom_id = Column(Integer, ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="SET NULL"), nullable=True, index=True)
    sent_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject = Column(String(200), nullable=False)
    message_body = Column(Text, nullable=False)
    recipient_mode = Column(String(40), nullable=False)
    recipient_count = Column(Integer, default=0, nullable=False)
    status = Column(String(30), default="pending", nullable=False)
    provider_message_id = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    classroom = relationship("Classroom")
    assessment = relationship("Assessment")
    sent_by = relationship("User")
    recipients = relationship("EmailNotificationRecipient", cascade="all, delete-orphan", back_populates="notification")


class EmailNotificationRecipient(Base):
    __tablename__ = "email_notification_recipients"
    id = Column(Integer, primary_key=True)
    notification_id = Column(Integer, ForeignKey("email_notifications.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    email = Column(String(255), nullable=False)
    status = Column(String(20), default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    final_subject = Column(String(200), nullable=True)
    final_body = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    notification = relationship("EmailNotification", back_populates="recipients")
    user = relationship("User")
