-- =============================================
-- MEDICACAO INTELIGENTE - Schema Inicial
-- =============================================

-- Familias
create table if not exists public.familias (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  created_at  timestamptz default now()
);

-- Perfis de usuarios
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  familia_id  uuid references public.familias(id),
  nome        text,
  papel       text default 'responsavel', -- responsavel | cuidador | medico
  avatar_url  text,
  created_at  timestamptz default now()
);

-- Criancas / Dependentes
create table if not exists public.criancas (
  id          uuid primary key default gen_random_uuid(),
  familia_id  uuid references public.familias(id) on delete cascade,
  nome        text not null,
  data_nasc   date,
  foto_url    text,
  medico      text,
  created_at  timestamptz default now()
);

-- Medicamentos
create table if not exists public.medicamentos (
  id          uuid primary key default gen_random_uuid(),
  crianca_id  uuid references public.criancas(id) on delete cascade,
  nome        text not null,
  dose        text,
  unidade     text,
  instrucoes  text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

-- Doses planejadas (agenda)
create table if not exists public.doses_planejadas (
  id              uuid primary key default gen_random_uuid(),
  medicamento_id  uuid references public.medicamentos(id) on delete cascade,
  horario         time not null,
  dias_semana     int[] default '{0,1,2,3,4,5,6}', -- 0=dom ... 6=sab
  ativo           boolean default true,
  created_at      timestamptz default now()
);

-- Eventos de dose (historico)
create table if not exists public.eventos_dose (
  id                  uuid primary key default gen_random_uuid(),
  dose_planejada_id   uuid references public.doses_planejadas(id),
  medicamento_id      uuid references public.medicamentos(id),
  crianca_id          uuid references public.criancas(id),
  data_prevista       date not null,
  hora_prevista       time not null,
  status              text default 'pendente', -- pendente | tomado | pulado | atrasado
  hora_administrada   timestamptz,
  administrado_por    uuid references auth.users(id),
  observacao          text,
  offline_id          text unique, -- ID gerado offline para deduplicacao
  created_at          timestamptz default now()
);

-- RLS (Row Level Security)
alter table public.familias          enable row level security;
alter table public.perfis            enable row level security;
alter table public.criancas          enable row level security;
alter table public.medicamentos      enable row level security;
alter table public.doses_planejadas  enable row level security;
alter table public.eventos_dose      enable row level security;

-- Policies basicas (expanda conforme necessario)
create policy "familia_propria" on public.perfis
  for all using (id = auth.uid());

create policy "familia_criancas" on public.criancas
  for all using (
    familia_id in (
      select familia_id from public.perfis where id = auth.uid()
    )
  );

create policy "familia_eventos" on public.eventos_dose
  for all using (
    crianca_id in (
      select c.id from public.criancas c
      join public.perfis p on p.familia_id = c.familia_id
      where p.id = auth.uid()
    )
  );
