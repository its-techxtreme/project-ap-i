-- Restrict worker-only RPC to service role; harden trigger helper search_path
revoke execute on function public.claim_next_job(text, integer) from public;
revoke execute on function public.claim_next_job(text, integer) from anon;
revoke execute on function public.claim_next_job(text, integer) from authenticated;
grant execute on function public.claim_next_job(text, integer) to service_role;

revoke execute on function public.get_my_role() from anon;
revoke execute on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

alter function public.set_updated_at() set search_path = public;
