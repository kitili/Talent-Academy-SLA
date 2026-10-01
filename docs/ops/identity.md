# Identity

Staff logins and sessions.

- `users` — admin and trainer accounts (scrypt hashes). Never expose `password` via APIs.
- `sessions` — Express session store (`connect-pg-simple`).
- `user_profiles` — extra staff details (phone, CNIC, etc.).
- `approval_history` — who approved or dismissed trainers and teachers.
