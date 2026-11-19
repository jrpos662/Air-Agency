# GitHub Actions দিয়ে Supabase Migration ও Edge Function অটোমেটিক Deploy

এই repository-তে `.github/workflows/supabase-deploy.yml` workflow আছে। `main` branch-এ Supabase migration/function/config বা workflow ফাইলে push করলে এটি চালু হবে। Actions থেকে Workflow-টি manual-ভাবেও Run workflow করা যায়।

## প্রথমবার সেটআপ

1. ZIP extract করুন এবং **extract করা ফোল্ডারের ভেতরের সব ফাইল** repository root-এ upload করুন। ZIP ফাইলটিকে শুধু repository-তে রেখে দিলে workflow/SQL চালু হবে না। `.github` ও `supabase` ফোল্ডার repository root-এ থাকতে হবে।
2. GitHub repository → Settings → Secrets and variables → Actions-এ নিচের repository secrets যোগ করুন:
   - `SUPABASE_ACCESS_TOKEN` — Supabase Account Access Token
   - `SUPABASE_DB_PASSWORD` — target project-এর database password
   - `SUPABASE_PROJECT_ID` — target project-এর Project Reference ID
3. GitHub → Actions → **Deploy Supabase (migrations + Edge Functions)** → Run workflow.
4. Job-টি project link করবে, migration status দেখাবে, pending migration `supabase db push --linked --yes` দিয়ে প্রয়োগ করবে, পরে status পুনরায় দেখাবে এবং migrations সফল হলে Edge Functions deploy করবে।

## সতর্কতা: existing database

Migration চালানোর আগে নিশ্চিত করুন `SUPABASE_PROJECT_ID` ঠিক সেই project-এর ID, যেটিতে আপনার বর্তমান ডেটা আছে। Migration history ও বাস্তব schema মিল না থাকলে CLI pending migration চালাতে পারে এবং কোনো migration conflict/error হতে পারে। Workflow database reset করে না; `db push` ব্যবহার করে। তবুও production data-র backup নিয়ে প্রথম deploy করা উত্তম। Workflow fail করলে Actions log-এর error ঠিক না করে বারবার deploy করবেন না।

## পরবর্তী migration

নতুন migration ফাইল আগের সর্বোচ্চ version-এর পরের নম্বর দিয়ে `supabase/migrations/`-এ রাখুন (উদাহরণ `033_new-feature.sql`), commit/push করুন। আগে deployed migration file edit করবেন না; নতুন migration দিয়ে পরিবর্তন করুন।

## Frontend secrets

`js/supabase-config.js`-এ শুধু Supabase URL ও anon/publishable key থাকবে। `service_role` key কখনো frontend বা GitHub repository-তে রাখবেন না।

## Hosting

এই workflow শুধু Supabase Database migrations ও Edge Functions deploy করে। Cloudflare Pages/Workers frontend deploy আলাদা hosting workflow/connection দিয়ে হবে।
