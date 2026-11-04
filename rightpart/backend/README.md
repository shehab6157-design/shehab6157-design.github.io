# RightPart company server (optional)

RightPart works without any server: each company's data stays on the device it was loaded on. The company server is for when several people and tablets should share **one** library:

- people sign in with their e-mail, and a company admin decides who sees what (roles below);
- engineers publish the library as numbered versions, and every tablet downloads the latest one and keeps a copy, so the floor keeps working when the network drops;
- build records and floor reports upload when the tablet is online;
- optionally, an **Ask the AI** button answers questions the built-in assistant cannot match, using only the company's own records.

The server is [Supabase](https://supabase.com) (PostgreSQL with sign-in). Use the hosted service, or run it yourself inside the company network or in a required country: the app works the same way with both.

## What is in this folder

| File | What it does |
|---|---|
| `supabase/schema.sql` | Tables, roles, row-level security and the functions the app calls. Safe to run again after an update. |
| `supabase/functions/ask/index.ts` | The optional AI function. It keeps the Anthropic API key on the server. |
| `supabase/tests/` | Security tests that run on a plain local PostgreSQL. |

## 1. Create the database

1. Create a Supabase project.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. Open **Authentication → Sign In / Providers** and keep **Email** turned on.
4. Open **Authentication → URL Configuration**. Set **Site URL** to the address people open RightPart at (for example `https://your-name.github.io/rightpart/`) and add the same address to **Redirect URLs**. The confirmation and sign-in e-mails link back there.

## 2. Connect the app

You need two values from the project's **API settings**: the **Project URL** and the **public key** (called *anon* or *publishable*). The public key is meant to be in apps: row-level security decides what each person can do. **Never** put the *service_role* or *secret* key in the app.

Either:

- **Each device:** in RightPart open **More → Companies and sign-in → Connect a company server** and enter the two values; or
- **The company's own copy of the app:** put them in `js/config.js`, then change `VERSION` in `sw.js` so installed copies pick up the change.

If the server is **not** on `*.supabase.co` (a self-hosted server on your own domain), add its address to `connect-src` in the `Content-Security-Policy` line of `index.html`. The app refuses to talk to any other address.

## 3. First company and people

1. In the app: **Create account**, confirm the e-mail, sign in, then **Create a company**. You are its owner.
2. Under **Team**, invite people by e-mail with a role. They create an account with that same e-mail and press **Check invitations**.
3. An engineer loads the parts, BOMs and steps (see **More → Set up this company**) and presses **Publish**. Every signed-in device can now press **Download latest**, and downloads it by itself when the app opens.

### Roles

| Role | Can |
|---|---|
| Owner | Everything, including naming other owners. A company always keeps at least one owner. |
| Admin | Invite people, change roles, remove people. |
| Engineer | Edit and publish the library. |
| Supervisor | See everyone's build records and floor reports. |
| Operator | Build, scan and report doubts. Sees only their own records. |
| Viewer | Read only. |

What the server enforces, and the tests check:

- A person never sees anything of a company they do not belong to.
- Only engineers, admins and owners publish. A publish made from an outdated copy is refused instead of overwriting someone else's newer version.
- Published versions cannot be changed or deleted: the history stays.
- Operators cannot read other people's records or rewrite their own after the fact.
- Publishes, role changes, invitations and AI questions are written to an activity log that users cannot edit.

## 4. AI answers (optional)

The app answers most questions itself, offline and without AI, from the data. The AI button appears only for signed-in companies, and only when the built-in assistant could not match the question.

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. From this `backend` folder:

```bash
supabase login
```

```bash
supabase init
```

```bash
supabase link --project-ref your-project-ref
```

```bash
supabase functions deploy ask
```

```bash
supabase secrets set ANTHROPIC_API_KEY=your-key
```

(`supabase init` asks a few questions: the defaults are fine. Run it only once.)

How it works:

- The app picks the records that matter for the question (at most 60: parts, steps, BOM lines, changes, integrity findings) and sends them with the question. The function checks that the person is signed in and is a member of the company, then asks Claude.
- Claude is told to use only those records, to cite each one by its id, to say plainly when the records do not answer, to report disagreements instead of choosing a side, and to treat the records as data, not instructions. The app turns citations into links and drops any citation of a record it did not send.
- The model is set in `MODEL` at the top of `supabase/functions/ask/index.ts`. **Server-side fallbacks are turned on**: if that model is overloaded, the API may answer with a fallback model instead of failing. The model that actually answered is returned in the `model` field of the response.
- The activity log keeps who asked, when, which records were cited and the question's length, not the question or the answer.
- The question and the selected records go to Anthropic's API. Check that this is allowed for the company's data (and the customer's, if it is their product) before turning it on. Each AI question is billed to the company's API account.
- The AI never changes the library or the instructions.

## 5. Run the security tests (optional)

The tests use a small stand-in for Supabase's sign-in (`tests/auth_stub.sql`), so they run on any PostgreSQL 15 or newer. **Do not run `auth_stub.sql` on a real Supabase project.**

```bash
createdb rightpart_test
```

```bash
cd supabase/tests && psql -d rightpart_test -v ON_ERROR_STOP=1 -f auth_stub.sql -f ../schema.sql -f rls_test.sql
```

The last line printed is `ALL RLS TESTS PASSED`; any failed check stops with `FAILED:` and the reason.

## Before real data goes in

- **Whose data is it?** For a contract manufacturer, drawings, BOMs and part numbers usually belong to the customer. Get written permission before loading them, and keep one company space per customer.
- **Regulated production** (medical devices, aerospace): software that guides or records production is part of the quality system and has to be validated before use. This prototype is not validated.
- **Privacy:** build records name the person. Agree with the team (and the works council where there is one) what records are for, who sees them and how long they are kept.
- **Security review:** have someone independent review the setup before production use.
