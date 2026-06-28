create table if not exists class_codespaces (
  id bigserial primary key,
  classroom_id bigint not null unique references classrooms(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamp with time zone not null default now()
);

create table if not exists coding_tasks (
  id bigserial primary key,
  codespace_id bigint not null references class_codespaces(id) on delete cascade,
  title text not null,
  description text not null default '',
  task_type text not null default 'python',
  starter_code text,
  starter_html text,
  starter_css text,
  starter_js text,
  preview_enabled boolean not null default false,
  expected_output text,
  language text not null default 'python',
  marks integer not null default 10,
  due_at timestamp with time zone,
  is_published boolean not null default false,
  created_at timestamp with time zone not null default now()
);

alter table if exists coding_tasks
  add column if not exists language text not null default 'python';

alter table if exists coding_tasks
  add column if not exists task_type text not null default 'python',
  add column if not exists starter_html text,
  add column if not exists starter_css text,
  add column if not exists starter_js text,
  add column if not exists preview_enabled boolean not null default false;

create table if not exists coding_submissions (
  id bigserial primary key,
  task_id bigint not null references coding_tasks(id) on delete cascade,
  student_id bigint not null references users(id) on delete cascade,
  code text not null default '',
  html_code text,
  css_code text,
  js_code text,
  preview_snapshot text,
  output text,
  status text not null default 'submitted',
  marks_awarded integer,
  feedback text,
  submitted_at timestamp with time zone not null default now(),
  unique (task_id, student_id)
);

create index if not exists idx_class_codespaces_classroom_id on class_codespaces(classroom_id);
create index if not exists idx_coding_tasks_codespace_id on coding_tasks(codespace_id);
create index if not exists ix_coding_tasks_codespace_published_created on coding_tasks(codespace_id, is_published, created_at);
create index if not exists ix_coding_tasks_codespace_question on coding_tasks(codespace_id, question_id);
create index if not exists idx_coding_submissions_task_id on coding_submissions(task_id);
create index if not exists idx_coding_submissions_student_id on coding_submissions(student_id);
create index if not exists ix_coding_submissions_task_submitted on coding_submissions(task_id, submitted_at);
create index if not exists ix_coding_submissions_student_status on coding_submissions(student_id, status);

alter table if exists coding_submissions
  add column if not exists html_code text,
  add column if not exists css_code text,
  add column if not exists js_code text,
  add column if not exists preview_snapshot text;

alter table class_codespaces enable row level security;
alter table coding_tasks enable row level security;
alter table coding_submissions enable row level security;

-- ClassNest currently authenticates through FastAPI JWTs with integer user IDs,
-- not Supabase Auth UUIDs. Keep direct-table RLS enabled here; membership and
-- teacher/student authorization are enforced by the API routes.
