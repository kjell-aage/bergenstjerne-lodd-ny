create extension if not exists pgcrypto;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reference text unique not null,
  customer_name text not null,
  phone text not null,
  ticket_count integer not null check (ticket_count > 0),
  amount_ore integer not null check (amount_ore > 0),
  status text not null default 'PENDING'
);

create table if not exists prizes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  level text not null,
  image_url text not null,
  quantity_total integer not null default 0,
  quantity_remaining integer not null default 0,
  win_chance_percent numeric(6,3) not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references orders(id) on delete cascade,
  prize_id uuid references prizes(id),
  ticket_number text unique not null,
  revealed_at timestamptz
);

alter table orders enable row level security;
alter table prizes enable row level security;
alter table tickets enable row level security;

insert into storage.buckets (id, name, public)
values ('prize-images', 'prize-images', true)
on conflict (id) do update set public = true;

alter table prizes add column if not exists description text;
alter table prizes add column if not exists value_nok integer;
alter table prizes add column if not exists is_consolation boolean not null default false;
alter table orders add column if not exists package_type text not null default 'regular';
alter table tickets add column if not exists symbols jsonb;


alter table tickets add column if not exists fulfillment_method text;
alter table tickets add column if not exists fulfillment_status text not null default 'UNCLAIMED';
alter table tickets add column if not exists shipping_name text;
alter table tickets add column if not exists shipping_address text;
alter table tickets add column if not exists shipping_postal_code text;
alter table tickets add column if not exists shipping_city text;
alter table tickets add column if not exists claimed_at timestamptz;
