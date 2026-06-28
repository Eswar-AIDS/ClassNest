alter table if exists coding_tasks
  add column if not exists question_id text,
  add column if not exists unit_no integer,
  add column if not exists unit_title text,
  add column if not exists assessment_title text,
  add column if not exists difficulty text,
  add column if not exists explanation text,
  add column if not exists visible_test_cases text,
  add column if not exists hidden_test_cases text,
  add column if not exists tags text,
  add column if not exists language text not null default 'python';

create table if not exists coding_task_answer_keys (
  id bigserial primary key,
  task_id bigint not null unique references public.coding_tasks(id) on delete cascade,
  question_id text not null,
  correct_answer text,
  accepted_answers text,
  expected_output text,
  evaluation_mode text not null default 'MANUAL',
  case_sensitive boolean not null default false,
  visible_test_cases text,
  hidden_test_cases text,
  explanation text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_coding_tasks_codespace_question_id on coding_tasks(codespace_id, question_id);
create index if not exists idx_coding_task_answer_keys_task_id on coding_task_answer_keys(task_id);

alter table if exists coding_submissions
  add column if not exists auto_marks integer,
  add column if not exists final_marks integer,
  add column if not exists is_correct boolean,
  add column if not exists evaluation_status text not null default 'pending',
  add column if not exists evaluation_feedback text,
  add column if not exists evaluated_at timestamp with time zone,
  add column if not exists completion_email_sent boolean not null default false;

alter table coding_task_answer_keys enable row level security;

-- ClassNest authorizes through the FastAPI JWT API layer, not direct Supabase Auth.
