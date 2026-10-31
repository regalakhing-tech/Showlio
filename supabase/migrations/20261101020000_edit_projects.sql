-- Creators edit their own projects: title, description, discipline, tools and photos.
-- keep lists the photos that stay ({path, position}); every other photo of the project
-- is removed and its storage path returned, so the API can delete the file.

create function public.update_my_project(project uuid, details jsonb, keep jsonb)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  removed jsonb;
  kept jsonb := coalesce(keep, '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  perform private.throttle_creator('project-edit', 60, 3600);
  update public.projects set
    title = details ->> 'title',
    summary = coalesce(details ->> 'summary', '')
  where id = project and creator_id = auth.uid();
  if not found then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;

  delete from public.project_categories where project_id = project;
  insert into public.project_categories (project_id, category_id)
  select project, c.id from public.categories c
  where c.name in (select jsonb_array_elements_text(coalesce(details -> 'categories', '[]'::jsonb)))
  order by c.sort_order limit 3;
  perform public.set_project_skills(project, array(select jsonb_array_elements_text(coalesce(details -> 'tools', '[]'::jsonb))));

  select coalesce(jsonb_agg(m.storage_path), '[]'::jsonb) into removed
  from public.project_media m
  where m.project_id = project and m.storage_path not in (select k ->> 'path' from jsonb_array_elements(kept) k);
  delete from public.project_media m
  where m.project_id = project and m.storage_path not in (select k ->> 'path' from jsonb_array_elements(kept) k);
  update public.project_media m set sort_order = (k ->> 'position')::smallint
  from jsonb_array_elements(kept) k
  where m.project_id = project and m.storage_path = k ->> 'path';

  return jsonb_build_object('id', project, 'removed', removed);
end;
$$;
comment on function public.update_my_project(uuid, jsonb, jsonb) is 'Workspace: edit one of the caller''s projects and its photos.';
revoke all on function public.update_my_project(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.update_my_project(uuid, jsonb, jsonb) to authenticated;
