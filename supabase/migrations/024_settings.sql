
/* =========================================================
   AIR TICKET AGENCY MANAGEMENT
   APPLICATION SETTINGS
   Owner-only settings management
========================================================= */

create table if not exists public.app_settings (
    id boolean primary key default true check (id = true),

    agency_settings jsonb not null default '{}'::jsonb,
    receipt_settings jsonb not null default '{}'::jsonb,
    regional_settings jsonb not null default
        '{
            "currency": "BDT",
            "date_format": "DD MMM YYYY",
            "time_format": "12",
            "timezone": "Asia/Dhaka"
        }'::jsonb,

    system_settings jsonb not null default
        '{
            "audit_logging": true,
            "require_payment_reference": false,
            "financial_confirmation": true
        }'::jsonb,

    updated_by uuid references public.profiles(id) on delete set null,
    updated_at timestamptz not null default now(),

    constraint app_settings_singleton check (id = true)
);

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;


/* =========================================================
   SECURITY
========================================================= */

alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;


/* =========================================================
   GET SETTINGS
   Owner only
========================================================= */

create or replace function public.get_my_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_settings jsonb;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and p.role = 'owner'
          and p.is_active = true
    ) then
        raise exception 'Only an active Owner can access application settings.';
    end if;

    select jsonb_build_object(
        'agency', s.agency_settings,
        'receipt', s.receipt_settings,
        'regional', s.regional_settings,
        'system', s.system_settings,
        'updated_at', s.updated_at
    )
    into v_settings
    from public.app_settings s
    where s.id = true;

    return coalesce(v_settings, '{}'::jsonb);
end;
$$;


/* =========================================================
   SAVE SETTINGS
   Owner only
========================================================= */

create or replace function public.save_my_settings(
    p_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_old_settings jsonb;
    v_new_settings jsonb;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required.';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_user_id
          and p.role = 'owner'
          and p.is_active = true
    ) then
        raise exception 'Only an active Owner can update application settings.';
    end if;

    if p_settings is null
       or jsonb_typeof(p_settings) <> 'object' then
        raise exception 'Invalid settings payload.';
    end if;

    if not (
        p_settings ? 'agency'
        and p_settings ? 'receipt'
        and p_settings ? 'regional'
        and p_settings ? 'system'
    ) then
        raise exception 'All settings sections are required.';
    end if;

    if jsonb_typeof(p_settings->'agency') <> 'object'
       or jsonb_typeof(p_settings->'receipt') <> 'object'
       or jsonb_typeof(p_settings->'regional') <> 'object'
       or jsonb_typeof(p_settings->'system') <> 'object' then
        raise exception 'Settings sections must be JSON objects.';
    end if;

    if coalesce(p_settings->'regional'->>'currency', '') <> 'BDT' then
        raise exception 'Only BDT currency is supported.';
    end if;

    if coalesce(
        p_settings->'regional'->>'timezone', ''
    ) <> 'Asia/Dhaka' then
        raise exception 'Only Asia/Dhaka timezone is supported.';
    end if;

    if coalesce(
        p_settings->'regional'->>'date_format', ''
    ) not in ('DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD') then
        raise exception 'Invalid date format.';
    end if;

    if coalesce(
        p_settings->'regional'->>'time_format', ''
    ) not in ('12', '24') then
        raise exception 'Invalid time format.';
    end if;

    select jsonb_build_object(
        'agency', agency_settings,
        'receipt', receipt_settings,
        'regional', regional_settings,
        'system', system_settings
    )
    into v_old_settings
    from public.app_settings
    where id = true
    for update;

    insert into public.app_settings (
        id,
        agency_settings,
        receipt_settings,
        regional_settings,
        system_settings,
        updated_by,
        updated_at
    )
    values (
        true,
        p_settings->'agency',
        p_settings->'receipt',
        p_settings->'regional',
        p_settings->'system',
        v_user_id,
        now()
    )
    on conflict (id)
    do update set
        agency_settings = excluded.agency_settings,
        receipt_settings = excluded.receipt_settings,
        regional_settings = excluded.regional_settings,
        system_settings = excluded.system_settings,
        updated_by = excluded.updated_by,
        updated_at = now();

    v_new_settings := jsonb_build_object(
        'agency', p_settings->'agency',
        'receipt', p_settings->'receipt',
        'regional', p_settings->'regional',
        'system', p_settings->'system'
    );

    insert into public.audit_logs (
        user_id,
        action,
        table_name,
        old_data,
        new_data
    )
    values (
        v_user_id,
        'UPDATE_SETTINGS',
        'app_settings',
        v_old_settings,
        v_new_settings
    );

    return jsonb_build_object(
        'success', true,
        'message', 'Settings saved successfully.',
        'updated_at', now()
    );
end;
$$;


/* =========================================================
   FUNCTION PERMISSIONS
========================================================= */

revoke all on function public.get_my_settings()
from public, anon;

revoke all on function public.save_my_settings(jsonb)
from public, anon;

grant execute on function public.get_my_settings()
to authenticated;

grant execute on function public.save_my_settings(jsonb)
to authenticated;
