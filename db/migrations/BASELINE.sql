-- Baseline drizzle migration bookkeeping.
-- This schema was built with db:push, so __drizzle_migrations is empty and
-- db:migrate would replay every migration from 0000 against tables that
-- already exist. These are the real sha256 hashes drizzle computes, so
-- after this it treats 0000-0003 as applied and only runs what is new.
insert into drizzle.__drizzle_migrations (hash, created_at) values
  ('eb5f66f5fe8a790e7a0077717db65ee717ccd2851f0acced5418d58140370569', 1786610078641),
  ('a491096bd7e68813adcd9b204c4a9393a0b8f1c68b8c8a8d23429a802746e28c', 1788470291398),
  ('336a83789f64f76b9199011e60469de301a1ffb5d59853ced0442eaec3f3ee6f', 1788513767053),
  ('ce5e50e94c04e80245a51d7e60c7feed96a5347b486ea30da674cbd0e91b92e7', 1788644204302)
on conflict do nothing;
