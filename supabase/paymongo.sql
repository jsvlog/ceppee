-- PayMongo checkout: two plans, one writer, one webhook.
--
--   monthly  ₱100  -> 30 days from now (or +30 on top of whatever is left)
--   season   ₱500  -> until the track's exam date (site_settings.exam_date_CSE /
--                     exam_date_LET, 23:59 Asia/Manila), or 180 days when no date is
--                     set or the date is less than a week away, so the pass never
--                     sells a dead week.
--
-- `payments` is the order log. Only the server (service role) inserts it; the browser
-- can read its own rows and nothing else. Access is granted by `activate_payment()`
-- alone, which the webhook and the reconcile job call — the success page never grants
-- anything.
--
-- Idempotent.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track text not null check (track in ('CSE', 'LET')),
  plan text not null check (plan in ('monthly', 'season')),
  amount int not null check (amount > 0),          -- centavos
  currency text not null default 'PHP',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  provider text not null default 'paymongo',
  reference_number text,                            -- our id, echoed by PayMongo
  checkout_id text,                                 -- cs_xxx
  provider_ref text,                                -- pay_xxx (the payment)
  payment_method text,                              -- gcash | card | qrph | maya
  days_granted int,
  granted_expires_at timestamptz,
  failure_note text,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  activated_at timestamptz
);

create unique index if not exists payments_checkout_id_key
  on public.payments (checkout_id) where checkout_id is not null;
create index if not exists payments_user_created_idx
  on public.payments (user_id, created_at desc);
create index if not exists payments_pending_idx
  on public.payments (created_at) where status = 'pending';

alter table public.payments enable row level security;

drop policy if exists "own payments read" on public.payments;
create policy "own payments read" on public.payments
  for select using (user_id = auth.uid());

grant select on public.payments to authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The date the season pass runs to. NULL when the admin has not set one.
-- ---------------------------------------------------------------------------
create or replace function public.season_exam_date(p_track text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case
           when s.value ~ '^\d{4}-\d{2}-\d{2}$'
             then (s.value::date + time '23:59:59') at time zone 'Asia/Manila'
         end
    from public.site_settings s
   where s.key = 'exam_date_' || upper(p_track);
$$;

-- ---------------------------------------------------------------------------
-- activate_payment(): the ONLY thing that grants access.
-- Replaying the same payment is a no-op that reports what was already granted.
-- ---------------------------------------------------------------------------
create or replace function public.activate_payment(
  p_payment_id uuid,
  p_provider_ref text default null,
  p_method text default null,
  p_raw jsonb default null
) returns table (activated boolean, expires_at timestamptz, days int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_pay public.payments%rowtype;
  v_target timestamptz;
  v_final timestamptz;
  v_days int;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id;
  end if;

  if v_pay.status = 'paid' then
    return query select false, v_pay.granted_expires_at, coalesce(v_pay.days_granted, 0);
    return;
  end if;

  if v_pay.plan = 'season' then
    v_target := public.season_exam_date(v_pay.track);
    if v_target is null or v_target < now() + interval '7 days' then
      v_target := now() + interval '180 days';
    end if;
  else
    v_target := now() + interval '30 days';
  end if;

  insert into public.subscriptions (user_id, track, status, started_at, expires_at)
  values (v_pay.user_id, v_pay.track, 'active', now(), v_target)
  on conflict (user_id, track) do update
    set status = 'active',
        expires_at = case
          when v_pay.plan = 'season'
            then greatest(public.subscriptions.expires_at, v_target)
          else greatest(public.subscriptions.expires_at, now()) + interval '30 days'
        end
  returning expires_at into v_final;

  v_days := greatest(0, ceil(extract(epoch from (v_final - now())) / 86400)::int);

  update public.payments
     set status = 'paid',
         paid_at = now(),
         activated_at = now(),
         provider_ref = coalesce(p_provider_ref, provider_ref),
         payment_method = coalesce(p_method, payment_method),
         granted_expires_at = v_final,
         days_granted = v_days,
         raw = coalesce(p_raw, raw)
   where id = v_pay.id;

  return query select true, v_final, v_days;
end $$;

revoke execute on function public.activate_payment(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.season_exam_date(text) from public, anon;
grant execute on function public.activate_payment(uuid, text, text, jsonb) to service_role;
grant execute on function public.season_exam_date(text) to authenticated, service_role;
