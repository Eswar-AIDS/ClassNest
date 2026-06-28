-- ClassNest performance indexes for deployment.
-- Run this once in the Supabase SQL editor.

CREATE INDEX IF NOT EXISTS idx_class_members_user_id
ON public.class_members(user_id);

CREATE INDEX IF NOT EXISTS idx_class_members_classroom_id
ON public.class_members(classroom_id);

CREATE INDEX IF NOT EXISTS idx_units_classroom_id
ON public.units(classroom_id);

CREATE INDEX IF NOT EXISTS idx_materials_unit_id
ON public.materials(unit_id);

CREATE INDEX IF NOT EXISTS idx_assessments_unit_id
ON public.assessments(unit_id);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_assessment_id
ON public.assessment_attempts(assessment_id);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_student_id
ON public.assessment_attempts(student_id);

CREATE INDEX IF NOT EXISTS idx_class_codespaces_classroom_id
ON public.class_codespaces(classroom_id);

CREATE INDEX IF NOT EXISTS idx_coding_tasks_codespace_id
ON public.coding_tasks(codespace_id);

CREATE INDEX IF NOT EXISTS idx_coding_tasks_task_type
ON public.coding_tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_coding_submissions_task_id
ON public.coding_submissions(task_id);

CREATE INDEX IF NOT EXISTS idx_coding_submissions_student_id
ON public.coding_submissions(student_id);

CREATE INDEX IF NOT EXISTS idx_coding_submissions_task_student
ON public.coding_submissions(task_id, student_id);

CREATE INDEX IF NOT EXISTS idx_coding_task_answer_keys_task_id
ON public.coding_task_answer_keys(task_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
ON public.password_reset_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
ON public.password_reset_tokens(user_id);
