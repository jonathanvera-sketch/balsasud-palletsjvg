-- ============================================================================
-- BALSASUD · CONTROL DE DESPACHOS
-- Esquema de referencia para Supabase / PostgreSQL
-- ----------------------------------------------------------------------------
-- La aplicación actual funciona 100 % local (localStorage + IndexedDB).
-- Este archivo permite migrarla a Supabase cuando se requiera multiusuario
-- real, evidencias compartidas y auditoría centralizada.
--
-- Pasos:
--   1. Crear un proyecto en https://supabase.com
--   2. SQL Editor → pegar este archivo → Run
--   3. Storage → verificar los buckets "tally" y "evidencias" (privados)
--   4. Authentication → crear los 3 usuarios (superadmin, terminado, calidad)
--      y asignar su rol en public.profiles (el trigger crea el perfil).
--   5. En la app, reemplazar DB.* por el cliente de Supabase (ver README).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('superadmin', 'pt', 'calidad');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'borrador', 'pendiente_pt', 'registro', 'pendiente_calidad', 'inspeccion',
    'con_diferencias', 'correccion', 'conciliado', 'liberado', 'despachado', 'cerrado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quality_status as enum (
    'pendiente', 'en_inspeccion', 'aprobado', 'rechazado', 'requiere_correccion'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  full_name   text not null,
  role        public.app_role not null default 'pt',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Órdenes de despacho
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  op             text,
  purchase_order text,
  client         text not null,
  container      text,
  destination    text,
  dispatch_date  date,
  lot            text,
  notes          text,
  status         public.order_status not null default 'borrador',
  tally          jsonb not null default '{}'::jsonb,   -- metadatos del archivo TALLY
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  published_by   uuid references public.profiles(id),
  published_at   timestamptz,
  submitted_by   uuid references public.profiles(id),
  submitted_at   timestamptz,
  released_by    uuid references public.profiles(id),
  released_at    timestamptz,
  release_notes  text,
  closed_by      uuid references public.profiles(id),
  closed_at      timestamptz,
  signature      jsonb,                                 -- firmas del acta
  updated_at     timestamptz not null default now()
);

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_client_idx on public.orders(client);

-- Líneas autorizadas del TALLY SHEET
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  item_id     text not null,
  description text,
  thickness   numeric(6,2) not null check (thickness > 0),
  programmed  integer not null check (programmed >= 0),
  pallets     integer not null default 0 check (pallets >= 0),
  bf          numeric(14,2),
  m3          numeric(14,4),
  created_at  timestamptz not null default now(),
  unique (order_id, item_id, thickness)
);

-- ---------------------------------------------------------------------------
-- Pallets registrados por Producto Terminado
-- ---------------------------------------------------------------------------
create table if not exists public.pallets (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  number              text not null,
  item_id             text not null,
  description         text,
  thickness           numeric(6,2) not null check (thickness > 0),
  panels              integer not null check (panels > 0),
  packaging           text not null check (packaging in ('palet', 'caja', 'suelto')),
  pallet_type         text check (pallet_type in ('simple', 'doble', 'no_aplica')),
  net_weight          numeric(12,2),
  gross_weight        numeric(12,2),
  bf                  numeric(14,2),
  m3                  numeric(14,4),
  observations        text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  quality_status      public.quality_status not null default 'pendiente',
  verified_item_id    text,
  verified_thickness  numeric(6,2),
  verified_panels     integer,
  checklist           jsonb not null default '{}'::jsonb,
  quality_observations text,
  inspected_by        uuid references public.profiles(id),
  inspected_at        timestamptz,

  unique (order_id, number)
);

create index if not exists pallets_order_idx on public.pallets(order_id);
create index if not exists pallets_quality_idx on public.pallets(quality_status);

-- Evidencias fotográficas (archivos en Storage)
create table if not exists public.pallet_evidence (
  id           uuid primary key default gen_random_uuid(),
  pallet_id    uuid not null references public.pallets(id) on delete cascade,
  storage_path text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id),
  uploaded_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  ts         timestamptz not null default now(),
  order_id   uuid references public.orders(id) on delete set null,
  order_code text,
  entity     text,
  entity_id  uuid,
  action     text not null,
  detail     text,
  user_id    uuid references public.profiles(id),
  user_name  text,
  role       text
);

create index if not exists audit_order_idx on public.audit_log(order_id, ts desc);

-- ---------------------------------------------------------------------------
-- Ajustes de la aplicación
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id             boolean primary key default true check (id),
  require_photos boolean not null default true,
  allow_surplus  boolean not null default false,
  company_name   text not null default 'BALSASUD S.A.',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_superadmin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'superadmin', false);
$$;

create or replace function public.is_quality()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'calidad', false);
$$;

create or replace function public.is_pt()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'pt', false);
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists pallets_touch on public.pallets;
create trigger pallets_touch before update on public.pallets
  for each row execute function public.set_updated_at();

-- Perfil automático al crear un usuario en Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role public.app_role := 'pt';
  v_username text;
begin
  if (new.raw_user_meta_data ->> 'role') in ('superadmin', 'pt', 'calidad') then
    v_role := (new.raw_user_meta_data ->> 'role')::public.app_role;
  end if;
  v_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_username),
    v_role
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impedir que un usuario cambie su propio rol
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and not public.is_superadmin() then
    raise exception 'Solo el Superadministrador puede cambiar roles.';
  end if;
  if new.active <> old.active and not public.is_superadmin() then
    raise exception 'Solo el Superadministrador puede activar o desactivar cuentas.';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Auditoría automática de pallets y órdenes
create or replace function public.audit_pallet_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order_code text;
  v_name text;
begin
  select code into v_order_code from public.orders where id = new.order_id;
  select full_name into v_name from public.profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.audit_log (order_id, order_code, entity, entity_id, action, detail, user_id, user_name, role)
    values (new.order_id, v_order_code, 'pallet', new.id, 'pallet_create',
            format('Pallet %s registrado (%s, %s mm, %s paneles).', new.number, new.item_id, new.thickness, new.panels),
            auth.uid(), coalesce(v_name, 'Sistema'), public.current_role()::text);
  elsif new.quality_status <> old.quality_status then
    insert into public.audit_log (order_id, order_code, entity, entity_id, action, detail, user_id, user_name, role)
    values (new.order_id, v_order_code, 'pallet', new.id, 'quality_' || new.quality_status::text,
            format('Pallet %s · estado de Calidad: %s. %s', new.number, new.quality_status, coalesce(new.quality_observations, '')),
            auth.uid(), coalesce(v_name, 'Sistema'), public.current_role()::text);
  end if;
  return new;
end $$;

drop trigger if exists pallets_audit on public.pallets;
create trigger pallets_audit after insert or update on public.pallets
  for each row execute function public.audit_pallet_changes();

-- ---------------------------------------------------------------------------
-- Operaciones controladas (RPC)
-- ---------------------------------------------------------------------------

-- Producto Terminado envía el despacho a Calidad
create or replace function public.submit_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_pt() or public.is_superadmin()) then
    raise exception 'No autorizado para enviar la orden.';
  end if;
  update public.orders
     set submitted_at = now(), submitted_by = auth.uid(), status = 'pendiente_calidad'
   where id = p_order_id and submitted_at is null and released_at is null and published_at is not null;
  if not found then
    raise exception 'La orden no está disponible para envío.';
  end if;
  insert into public.audit_log (order_id, entity, action, detail, user_id)
  values (p_order_id, 'order', 'order_submit', 'Producto Terminado envió el despacho a Calidad.', auth.uid());
end $$;

-- Calidad inspecciona un pallet
create or replace function public.inspect_pallet(
  p_pallet_id uuid,
  p_status public.quality_status,
  p_verified_item text,
  p_verified_thickness numeric,
  p_verified_panels integer,
  p_checklist jsonb,
  p_observations text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_pallet public.pallets;
  v_authorized public.order_items;
  v_approved integer;
begin
  if not (public.is_quality() or public.is_superadmin()) then
    raise exception 'No autorizado para inspeccionar.';
  end if;

  select * into v_pallet from public.pallets where id = p_pallet_id for update;
  if not found then raise exception 'Pallet inexistente.'; end if;

  select * into v_authorized from public.order_items
   where order_id = v_pallet.order_id
     and item_id = p_verified_item
     and thickness = p_verified_thickness;

  if not found then
    raise exception 'El ITEM ID / espesor verificado no está autorizado en el TALLY SHEET.';
  end if;

  if p_status = 'aprobado' then
    if p_verified_panels <> v_pallet.panels then
      raise exception 'La cantidad verificada no coincide con la reportada.';
    end if;
    select coalesce(sum(coalesce(p.verified_panels, p.panels)), 0) into v_approved
      from public.pallets p
     where p.order_id = v_pallet.order_id
       and p.item_id = p_verified_item
       and p.thickness = p_verified_thickness
       and p.quality_status = 'aprobado'
       and p.id <> p_pallet_id;
    if v_approved + p_verified_panels > v_authorized.programmed then
      raise exception 'Excede lo autorizado en el TALLY SHEET (% > %).', v_approved + p_verified_panels, v_authorized.programmed;
    end if;
  end if;

  update public.pallets
     set quality_status = p_status,
         verified_item_id = p_verified_item,
         verified_thickness = p_verified_thickness,
         verified_panels = p_verified_panels,
         checklist = coalesce(p_checklist, '{}'::jsonb),
         quality_observations = p_observations,
         inspected_by = auth.uid(),
         inspected_at = now()
   where id = p_pallet_id;
end $$;

-- Liberación formal (solo Calidad o Superadministrador, con triple coincidencia)
create or replace function public.release_order(p_order_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tally integer;
  v_pt integer;
  v_quality integer;
  v_pending integer;
begin
  if not (public.is_quality() or public.is_superadmin()) then
    raise exception 'No autorizado para liberar el despacho.';
  end if;

  select coalesce(sum(programmed), 0) into v_tally from public.order_items where order_id = p_order_id;
  select coalesce(sum(panels), 0) into v_pt from public.pallets where order_id = p_order_id;
  select coalesce(sum(coalesce(verified_panels, panels)), 0) into v_quality
    from public.pallets where order_id = p_order_id and quality_status = 'aprobado';
  select count(*) into v_pending from public.pallets
   where order_id = p_order_id and quality_status not in ('aprobado');

  if v_pending > 0 then
    raise exception 'Existen % pallet(s) sin aprobar.', v_pending;
  end if;
  if v_tally <> v_pt or v_pt <> v_quality then
    raise exception 'TALLY (%) ≠ Producto Terminado (%) ≠ Calidad (%). No se puede liberar.', v_tally, v_pt, v_quality;
  end if;

  update public.orders
     set released_at = now(), released_by = auth.uid(), release_notes = p_notes, status = 'liberado'
   where id = p_order_id and released_at is null;

  insert into public.audit_log (order_id, entity, action, detail, user_id)
  values (p_order_id, 'order', 'order_release', coalesce(p_notes, 'Despacho liberado con triple verificación.'), auth.uid());
end $$;

grant execute on function public.submit_order(uuid) to authenticated;
grant execute on function public.inspect_pallet(uuid, public.quality_status, text, numeric, integer, jsonb, text) to authenticated;
grant execute on function public.release_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.pallets         enable row level security;
alter table public.pallet_evidence enable row level security;
alter table public.audit_log       enable row level security;
alter table public.app_settings    enable row level security;

-- Perfiles: cada uno ve el suyo; el Superadministrador ve todos
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_superadmin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_superadmin())
  with check (id = auth.uid() or public.is_superadmin());

-- Órdenes: PT y Calidad solo ven órdenes publicadas
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (public.is_superadmin() or published_at is not null);

drop policy if exists orders_write on public.orders;
create policy orders_write on public.orders
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Líneas del TALLY: misma visibilidad que su orden
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select using (
    public.is_superadmin()
    or exists (select 1 from public.orders o where o.id = order_id and o.published_at is not null)
  );

drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Pallets: visibles si la orden fue publicada
drop policy if exists pallets_select on public.pallets;
create policy pallets_select on public.pallets
  for select using (
    public.is_superadmin()
    or exists (select 1 from public.orders o where o.id = order_id and o.published_at is not null)
  );

drop policy if exists pallets_insert on public.pallets;
create policy pallets_insert on public.pallets
  for insert with check (
    public.is_superadmin()
    or (public.is_pt() and exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.published_at is not null
         and o.released_at is null
         and o.closed_at is null
    ))
  );

drop policy if exists pallets_update on public.pallets;
create policy pallets_update on public.pallets
  for update using (
    public.is_superadmin()
    or (public.is_pt() and exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.published_at is not null
         and o.released_at is null
         and o.closed_at is null
    ))
  ) with check (
    public.is_superadmin()
    or (public.is_pt() and exists (
      select 1 from public.orders o
       where o.id = order_id
         and o.published_at is not null
         and o.released_at is null
         and o.closed_at is null
    ))
  );

drop policy if exists pallets_delete on public.pallets;
create policy pallets_delete on public.pallets
  for delete using (
    public.is_superadmin()
    or (public.is_pt() and exists (
      select 1 from public.orders o
       where o.id = order_id and o.released_at is null and o.closed_at is null
    ))
  );

-- Evidencias: visibles con el pallet; las sube PT y el Superadministrador
drop policy if exists evidence_select on public.pallet_evidence;
create policy evidence_select on public.pallet_evidence
  for select using (
    public.is_superadmin()
    or exists (
      select 1 from public.pallets p
        join public.orders o on o.id = p.order_id
       where p.id = pallet_id and o.published_at is not null
    )
  );

drop policy if exists evidence_insert on public.pallet_evidence;
create policy evidence_insert on public.pallet_evidence
  for insert with check (public.is_superadmin() or public.is_pt());

drop policy if exists evidence_delete on public.pallet_evidence;
create policy evidence_delete on public.pallet_evidence
  for delete using (public.is_superadmin() or public.is_pt());

-- Auditoría: lectura para el Superadministrador; cada rol ve la de sus órdenes
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select using (
    public.is_superadmin()
    or exists (select 1 from public.orders o where o.id = order_id and o.published_at is not null)
  );

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert with check (auth.uid() is not null);

-- Ajustes: lectura general, escritura del Superadministrador
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select using (auth.uid() is not null);

drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Storage (buckets privados)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tally', 'tally', false), ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

drop policy if exists storage_read on storage.objects;
create policy storage_read on storage.objects
  for select using (
    bucket_id in ('tally', 'evidencias') and auth.uid() is not null
  );

drop policy if exists storage_write on storage.objects;
create policy storage_write on storage.objects
  for insert with check (
    bucket_id in ('tally', 'evidencias') and auth.uid() is not null
  );

drop policy if exists storage_delete on storage.objects;
create policy storage_delete on storage.objects
  for delete using (public.is_superadmin() or public.is_pt());

-- ============================================================================
-- Notas de integración con la app
-- ----------------------------------------------------------------------------
-- 1. Reemplazar data.js por un adaptador que use supabase-js:
--      const { data } = await supabase.from('orders').select('*, order_items(*), pallets(*)');
-- 2. Mantener las mismas validaciones del motor (engine.js) en el cliente y
--    respaldarlas con los RPC submit_order / inspect_pallet / release_order.
-- 3. Las fotos se guardan en Storage y en pallet_evidence.storage_path.
-- 4. El PDF del TALLY se guarda en el bucket "tally" y su ruta en orders.tally.
-- 5. Realtime: suscribirse a public.orders y public.pallets para refrescar la UI.
-- ============================================================================
