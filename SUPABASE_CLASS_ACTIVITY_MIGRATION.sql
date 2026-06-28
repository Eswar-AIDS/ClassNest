CREATE TABLE IF NOT EXISTS public.class_activity (
    id SERIAL PRIMARY KEY,
    classroom_id INTEGER NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    activity_label TEXT,
    entity_type TEXT,
    entity_id INTEGER,
    route_path TEXT,
    last_active_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(classroom_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_activity_classroom_id
ON public.class_activity(classroom_id);

CREATE INDEX IF NOT EXISTS idx_class_activity_user_id
ON public.class_activity(user_id);

CREATE INDEX IF NOT EXISTS idx_class_activity_last_active
ON public.class_activity(last_active_at);

ALTER TABLE public.class_activity ENABLE ROW LEVEL SECURITY;
