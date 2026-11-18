# GitHub + Supabase অটোমেটিক ডিপ্লয় সেটআপ

main ব্রাঞ্চে push করলে `supabase/migrations` এর নতুন SQL আর `supabase/functions` এর সব Edge Function নিজে Supabase-এ চলে যাবে
(ফাইল: `.github/workflows/supabase-deploy.yml`)।

## একবারের সেটআপ

1. GitHub-এ নতুন **private** repository বানান (যেমন `air-agency-management`)।
2. এই জিপের সব ফাইল repository-র রুটে আপলোড/push করুন (`supabase` আর `.github` ফোল্ডার রুটে থাকতে হবে)।
3. Supabase-এ প্রজেক্ট বানান। এই তিনটা তথ্য সংগ্রহ করুন:
   - **Project ID (Reference ID):** Project Settings → General
   - **Access Token:** Supabase Dashboard → Account → Access Tokens → Generate new token
   - **Database Password:** প্রজেক্ট বানানোর সময় দেওয়া পাসওয়ার্ড (ভুলে গেলে Project Settings → Database থেকে reset)
4. GitHub repository → Settings → Secrets and variables → Actions → **New repository secret**-এ তিনটা secret বানান:
   - `SUPABASE_PROJECT_ID`
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`
5. Actions ট্যাবে গিয়ে **Deploy Supabase** → **Run workflow** দিন (অথবা main-এ যেকোনো push)।
   প্রথমবারে ৩১টা migration ক্রমানুসারে চলবে, তারপর সব Edge Function ডিপ্লয় হবে।

## পরে নতুন SQL যোগ করলে
`supabase/migrations/` এ আগের সবচেয়ে বড় নম্বরের পরের নম্বর দিয়ে ফাইল বানান (যেমন `032_add-something.sql`), তারপর main-এ push করুন।
আগে চলে যাওয়া ফাইল কখনো বদলাবেন না, বদলাতে হলে নতুন নম্বরে নতুন ফাইল বানান।

## ফ্রন্টএন্ডের Supabase সংযোগ
`js/supabase-config.js`-এ Project URL আর **anon/publishable key** বসান।
`service_role` key কখনো এই ফাইলে বা GitHub-এ রাখবেন না।

## সতর্কতা
- Supabase-এর নিজস্ব "GitHub Integration" একই সঙ্গে চালু করবেন না, নইলে একই migration দুইবার চালানোর চেষ্টা হতে পারে। শুধু এই workflow ব্যবহার করুন।
- কোনো migration-এ error থাকলে workflow লাল হবে এবং Edge Function ডিপ্লয় হবে না। Actions-এর লগ দেখে ফাইল ঠিক করে আবার push করুন।
- ফ্রন্টএন্ড (HTML/CSS/JS) হোস্টিং আলাদা বিষয়; এই workflow শুধু Supabase-এর জন্য।
