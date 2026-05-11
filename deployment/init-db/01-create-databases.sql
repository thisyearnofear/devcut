CREATE DATABASE intelligence_app;
CREATE DATABASE intelligence_app_shadow;
CREATE DATABASE langgraph_app;

\connect intelligence_app

CREATE TABLE IF NOT EXISTS runway_jobs (
    task_id       TEXT        PRIMARY KEY,
    thread_id     TEXT        NOT NULL,
    run_id        TEXT        NOT NULL,
    kind          TEXT        NOT NULL CHECK (kind IN ('image', 'video')),
    status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'polling', 'done', 'failed')),
    result_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS runway_jobs_thread_id_idx ON runway_jobs (thread_id);
CREATE INDEX IF NOT EXISTS runway_jobs_status_idx    ON runway_jobs (status)
    WHERE status IN ('pending', 'polling');
