-- 035: Make the Settings page switches real.
--  * get_app_settings() now also returns the system switches (needed by the UI).
--  * audit_logging OFF  -> new audit rows are skipped (settings changes are
--                          always logged so the switch itself stays auditable).
--  * require_payment_reference ON -> customer and agency payments made by
--                          bank / mobile banking / card / other must carry a
--                          transaction reference (cash is exempt).

create or replace function public.get_app_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_settings jsonb;
begin
    if v_user_id is null then
        raise exception 'Authentication required.';
    end if;

    if not exists (
        select 1 from public.profiles p
        where p.id = v_user_id and p.is_active = true
    ) then
        raise exception 'Active account required.';
    end if;

    select jsonb_build_object(
        'agency',   s.agency_settings,
        'receipt',  s.receipt_settings,
        'regional', s.regional_settings,
        'system',   s.system_settings,
        'updated_at', s.updated_at
    )
    into v_settings
    from public.app_settings s
    where s.id = true;

    return coalesce(v_settings, '{}'::jsonb);
end;
$$;

revoke all on function public.get_app_settings() from public, anon;
grant execute on function public.get_app_settings() to authenticated;


/* ---------- audit logging switch ---------- */

create or replace function public.audit_logging_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_enabled boolean;
begin
    if new.action = 'UPDATE_SETTINGS' then
        return new;
    end if;

    select coalesce((s.system_settings->>'audit_logging')::boolean, true)
    into v_enabled
    from public.app_settings s
    where s.id = true;

    if coalesce(v_enabled, true) then
        return new;
    end if;

    return null;  -- skip this audit row
end;
$$;

drop trigger if exists trg_audit_logging_switch on public.audit_logs;
create trigger trg_audit_logging_switch
before insert on public.audit_logs
for each row execute function public.audit_logging_switch();


/* ---------- payment reference switch ---------- */

create or replace function public.require_payment_reference_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_required boolean;
begin
    select coalesce((s.system_settings->>'require_payment_reference')::boolean, false)
    into v_required
    from public.app_settings s
    where s.id = true;

    if coalesce(v_required, false)
       and new.payment_method <> 'cash'
       and nullif(btrim(coalesce(new.transaction_reference, '')), '') is null then
        raise exception
            'A payment reference is required for non-cash payments (Settings > System Preferences).';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_require_ref_customer_payments on public.customer_payments;
create trigger trg_require_ref_customer_payments
before insert on public.customer_payments
for each row execute function public.require_payment_reference_switch();

drop trigger if exists trg_require_ref_agency_payments on public.agency_payments;
create trigger trg_require_ref_agency_payments
before insert on public.agency_payments
for each row execute function public.require_payment_reference_switch();
