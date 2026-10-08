ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS trainer_score integer;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS trainer_comment text;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS rubric jsonb;
