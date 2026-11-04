// Company server settings for this copy of RightPart.
// Leave empty to run fully on this device (no sign-in). To let a company sign in, create a Supabase
// project, run backend/supabase/schema.sql in it, and put its URL and anon (public) key here,
// or enter them once on the "Companies and sign-in" page of the app.
// The anon key is meant to be public: what each user can see is decided by row-level security.
export default {
  cloud: {
    url: '',
    anonKey: '',
  },
};
