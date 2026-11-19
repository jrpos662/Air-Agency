-- 034: Let every active signed-in user READ the display settings
-- (agency info, receipt layout, regional formats) so the whole app and
-- printed receipts follow Settings. Only the Owner can still CHANGE them
-- (save_my_settings in 024). Security settings are not returned here.

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
