-- Calendar RPCs intentionally use an empty search_path. Older installations
-- still have policies calling my_family_id(), whose unqualified profiles lookup
-- inherited that path. Keep the helper's signature, privileges and RLS behavior.
do $migration$
begin
  if to_regprocedure('public.my_family_id()') is not null then
    execute $definition$
      create or replace function public.my_family_id()
      returns uuid
      language sql
      stable
      security definer
      set search_path = ''
      as $body$
        select p.family_id from public.profiles p where p.id = auth.uid();
      $body$;
    $definition$;
  end if;
end;
$migration$;

-- The current helper already qualifies its references; also fix its execution
-- environment so all family lookups are independent of the calling function.
alter function public.current_family_id() set search_path = '';
