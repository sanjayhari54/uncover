-- UNCOVER V6: secure anonymous discovery + private chat + mutual reveal

-- Discovery returns ONLY anonymous-safe fields.
create or replace function public.discover_people(p_limit integer default 12)
returns table (
  user_id uuid,
  age integer,
  location text,
  bio text,
  interests text[],
  looking_for text[],
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.age, p.location, p.bio, p.interests, p.looking_for, p.last_active_at
  from public.profiles p
  where p.id <> auth.uid()
    and p.discovery_enabled = true
    and p.is_profile_complete = true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and not exists (
      select 1 from public.conversations c
      where (c.user_a = least(auth.uid(), p.id) and c.user_b = greatest(auth.uid(), p.id))
        and c.status = 'active'
    )
  order by p.last_active_at desc nulls last
  limit greatest(1, least(coalesce(p_limit,12), 30));
$$;

revoke all on function public.discover_people(integer) from public;
grant execute on function public.discover_people(integer) to authenticated;

-- Start one private conversation. A new conversation consumes one free chat.
create or replace function public.start_private_chat(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  conversation_id uuid;
  premium boolean;
  used_count integer;
  limit_count integer;
begin
  if me is null then raise exception 'You must be signed in.'; end if;
  if p_other_user is null or p_other_user = me then raise exception 'Invalid person.'; end if;

  if exists (select 1 from public.blocks b where (b.blocker_id=me and b.blocked_id=p_other_user) or (b.blocker_id=p_other_user and b.blocked_id=me)) then
    raise exception 'This connection is unavailable.';
  end if;

  select c.id into conversation_id
  from public.conversations c
  where c.user_a = least(me,p_other_user) and c.user_b = greatest(me,p_other_user)
  limit 1;

  if conversation_id is not null then return conversation_id; end if;

  select is_premium, free_chats_used, free_chats_limit into premium, used_count, limit_count
  from public.profiles where id = me for update;

  if not coalesce(premium,false) and coalesce(used_count,0) >= coalesce(limit_count,3) then
    raise exception 'FREE_CHAT_LIMIT_REACHED';
  end if;

  insert into public.conversations(user_a,user_b,status)
  values (least(me,p_other_user), greatest(me,p_other_user), 'active')
  returning id into conversation_id;

  if not coalesce(premium,false) then
    update public.profiles
    set free_chats_used = coalesce(free_chats_used,0) + 1
    where id = me;
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.start_private_chat(uuid) from public;
grant execute on function public.start_private_chat(uuid) to authenticated;

-- A user can privately request/approve a connection. The full profile is revealed only when both flags are true.
create or replace function public.approve_connection(p_other_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  rid uuid;
  sender uuid;
  receiver uuid;
  revealed_now boolean := false;
begin
  if me is null or p_other_user is null or me = p_other_user then raise exception 'Invalid connection.'; end if;

  select id, sender_id, receiver_id into rid, sender, receiver
  from public.connection_requests
  where (sender_id=me and receiver_id=p_other_user)
     or (sender_id=p_other_user and receiver_id=me)
  order by created_at desc
  limit 1;

  if rid is null then
    insert into public.connection_requests(sender_id,receiver_id,sender_approved)
    values (me,p_other_user,true)
    returning id into rid;
  elsif sender = me then
    update public.connection_requests
      set sender_approved = true, updated_at = now()
      where id = rid;
  else
    update public.connection_requests
      set receiver_approved = true, updated_at = now()
      where id = rid;
  end if;

  update public.connection_requests
  set revealed = (sender_approved and receiver_approved), updated_at = now()
  where id = rid
  returning revealed into revealed_now;

  return coalesce(revealed_now,false);
end;
$$;

revoke all on function public.approve_connection(uuid) from public;
grant execute on function public.approve_connection(uuid) to authenticated;

-- Return connection states without exposing full profile data.
create or replace function public.my_connections()
returns table (
  request_id uuid,
  other_user_id uuid,
  is_incoming boolean,
  sender_approved boolean,
  receiver_approved boolean,
  revealed boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id,
         case when r.sender_id=auth.uid() then r.receiver_id else r.sender_id end,
         (r.receiver_id=auth.uid()),
         r.sender_approved, r.receiver_approved, r.revealed, r.created_at
  from public.connection_requests r
  where r.sender_id=auth.uid() or r.receiver_id=auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.my_connections() from public;
grant execute on function public.my_connections() to authenticated;

-- Only reveal a complete profile after mutual approval.
create or replace function public.get_revealed_profile(p_other_user uuid)
returns table (
  id uuid,
  display_name text,
  age integer,
  gender text,
  location text,
  bio text,
  interests text[],
  looking_for text[],
  photo_url text
)
language sql
security definer
set search_path = public
as $$
  select p.id,p.display_name,p.age,p.gender,p.location,p.bio,p.interests,p.looking_for,p.photo_url
  from public.profiles p
  where p.id = p_other_user
    and exists (
      select 1 from public.connection_requests r
      where ((r.sender_id=auth.uid() and r.receiver_id=p_other_user)
          or (r.sender_id=p_other_user and r.receiver_id=auth.uid()))
        and r.sender_approved = true
        and r.receiver_approved = true
        and r.revealed = true
    );
$$;

revoke all on function public.get_revealed_profile(uuid) from public;
grant execute on function public.get_revealed_profile(uuid) to authenticated;

-- Allow a user to see the conversations they participate in.
-- Existing RLS already protects conversations/messages.

-- Enable realtime for messages if not already enabled.
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then
    null;
  end;
end $$;
