
-- =====================================================
-- AIR TICKET AGENCY MANAGEMENT
-- RECORD BUSINESS EXPENSE
-- =====================================================

create or replace function public.record_expense(
    p_category_id uuid,
    p_account_id uuid,
    p_amount numeric,
    p_expense_date date,
    p_description text,
    p_reference text default null,
    p_notes text default null,
    p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_expense_id uuid;
    v_user_id uuid;
    v_role text;
begin

    -- Verify authenticated user.
    v_user_id := auth.uid();

    if v_user_id is null
       or p_user_id is distinct from v_user_id then
        raise exception 'Unauthorized request.';
    end if;

    -- Verify role.
    select p.role::text
    into v_role
    from public.profiles p
    where p.id = v_user_id;

    if v_role not in ('owner', 'manager', 'accounts_staff') then
        raise exception 'Permission denied.';
    end if;

    -- Validate amount.
    if p_amount is null or p_amount <= 0 then
        raise exception 'Expense amount must be greater than zero.';
    end if;

    -- Validate description.
    if p_description is null
       or length(trim(p_description)) < 2
       or length(trim(p_description)) > 500 then
        raise exception 'Invalid expense description.';
    end if;

    -- Verify category.
    if not exists (
        select 1
        from public.expense_categories ec
        where ec.id = p_category_id
    ) then
        raise exception 'Expense category not found.';
    end if;

    -- Verify and lock account.
    perform 1
    from public.cash_accounts ca
    where ca.id = p_account_id
      and ca.is_active = true
    for update;

    if not found then
        raise exception 'Active cash/bank account not found.';
    end if;

    -- Create expense.
    insert into public.expenses (
        category_id,
        amount,
        expense_date,
        description,
        reference,
        notes,
        created_by
    )
    values (
        p_category_id,
        p_amount,
        p_expense_date,
        trim(p_description),
        p_reference,
        p_notes,
        v_user_id
    )
    returning id into v_expense_id;

    -- Record cash/bank outflow.
    insert into public.cash_transactions (
        account_id,
        transaction_type,
        amount,
        reference_type,
        reference_id,
        description,
        created_by
    )
    values (
        p_account_id,
        'expense',
        p_amount,
        'business_expense',
        v_expense_id,
        trim(p_description),
        v_user_id
    );

    return v_expense_id;

end;
$$;


-- Restrict function execution.
revoke all on function public.record_expense(
    uuid,
    uuid,
    numeric,
    date,
    text,
    text,
    text,
    uuid
) from public, anon;

grant execute on function public.record_expense(
    uuid,
    uuid,
    numeric,
    date,
    text,
    text,
    text,
    uuid
) to authenticated;


-- =====================================================
-- END
-- =====================================================
