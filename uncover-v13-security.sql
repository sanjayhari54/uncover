-- UNCOVER V13: Block, Report, Notifications
-- Run this ONCE in Supabase SQL Editor before deploying V13.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_reporter_idx on public.reports(reporter_id, created_at desc);

alter table public.reports enable row level security;
drop policy if exists "users can create reports" on public.reports;
create policy "users can create reports" on public.reports
for insert to authenticated
with check (reporter_id = auth.uid() and reported_id <> auth.uid());

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_idx
on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
for select to authenticated
using (user_id = auth.uid());

create or replace function public.block_user(p_other_user uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or p_other_user is null or p_other_user = auth.uid() then
    raise exception 'Invalid person.';
  end if;
  insert into public.blocks(blocker_id, blocked_id)
  values (auth.uid(), p_other_user)
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.report_user(p_other_user uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or p_other_user is null or p_other_user = auth.uid() then
    raise exception 'Invalid person.';
  end if;
  if nullif(trim(p_reason),'') is null then
    raise exception 'Please provide a reason.';
  end if;
  insert into public.reports(reporter_id, reported_id, reason)
  values (auth.uid(), p_other_user, left(trim(p_reason),500));
  return true;
end;
$$;

revoke all on function public.report_user(uuid,text) from public;
grant execute on function public.report_user(uuid,text) to authenticated;

create or replace function public.my_notifications(p_limit integer default 20)
returns table (
  id uuid,
  kind text,
  actor_id uuid,
  conversation_id uuid,
  other_user_id uuid,
  created_at timestamptz,
  read_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select n.id,n.kind,n.actor_id,n.conversation_id,
    case when n.actor_id is null then null
         when n.actor_id = auth.uid() then null
         else n.actor_id end,
    n.created_at,n.read_at
  from public.notifications n
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),50));
$$;

revoke all on function public.my_notifications(integer) from public;
grant execute on function public.my_notifications(integer) to authenticated;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare recipient uuid;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end
  into recipient
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient is not null then
    insert into public.notifications(user_id,actor_id,kind,conversation_id)
    values(recipient,new.sender_id,'message',new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_uncover_message_notification on public.messages;
create trigger trg_uncover_message_notification
after insert on public.messages
for each row execute function public.notify_new_message();

-- Notify the other person when the second approval makes a connection.
create or replace function public.notify_connection_reveal()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.revealed = true and coalesce(old.revealed,false) = false then
    insert into public.notifications(user_id,actor_id,kind)
    values
      (new.sender_id,new.receiver_id,'connection'),
      (new.receiver_id,new.sender_id,'connection');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_uncover_connection_notification on public.connection_requests;
create trigger trg_uncover_connection_notification
after update of revealed on public.connection_requests
for each row execute function public.notify_connection_reveal();
