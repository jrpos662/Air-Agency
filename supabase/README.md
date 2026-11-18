# Supabase

- `migrations/` — সব SQL এখানে, ফাইলের নামের ক্রমে চলে (Supabase CLI: `supabase db push`)।
  সাধারণ Supabase Dashboard SQL Editor-এ চালালে একই ক্রমে (ওপর থেকে নিচে) একটি একটি করে চালান।
- `functions/` — Edge Functions (`supabase functions deploy <name>`)।
- `config.toml` — Supabase CLI configuration।

কোনো secret key বা service_role key frontend ফাইলে রাখা যাবে না।
