CREATE TABLE IF NOT EXISTS discussion_posts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  author_id varchar NOT NULL,
  author_role varchar NOT NULL,
  author_name varchar NOT NULL,
  body text NOT NULL,
  created_at timestamp DEFAULT now()
);
