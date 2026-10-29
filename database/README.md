# Database workspace

`SHOWLIO_INFO.md`, section 7, defines the proposed tables. `schema.sql` and `policies.sql` are reserved, comment-only files; this starter does not create tables, buckets, triggers, roles or policies, and CI/CD never changes a live database.

When implementing Supabase, add versioned migrations and verify schema constraints, explicit table privileges and Row Level Security together. Test owner access, guest read access, hidden profiles, draft projects, skill joins and private media before deployment. The Supabase Auth identity owns a creator profile; do not create a separate password table. Ordinary CRUD should use the caller's access token and RLS rather than an elevated server key.

Store image bytes in Supabase Storage, never in this repository or the serverless function filesystem. Keep draft media private. Schema, RLS and Storage policies must be reviewed as a single feature before publishing real user data.
