-- Suporte a receitas dinâmicas: data de início e fim por fase de dose
alter table public.doses_planejadas
  add column if not exists data_inicio date,
  add column if not exists data_fim    date;
