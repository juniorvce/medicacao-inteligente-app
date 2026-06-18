-- =============================================
-- Policies adicionais para familias, perfis,
-- medicamentos e doses_planejadas
-- =============================================

-- Familias: permitir insert para usuarios autenticados
create policy "familias_insert_any" on public.familias
  for insert
  with check (auth.role() = 'authenticated');

-- Familias: permitir select apenas da familia do usuario
create policy "familias_select_own" on public.familias
  for select
  using (
    id in (
      select familia_id
      from public.perfis
      where id = auth.uid()
    )
  );

-- Perfis: permitir INSERT apenas do proprio usuario
create policy "perfis_insert_self" on public.perfis
  for insert
  with check (id = auth.uid());

-- Medicamentos: restringir por familia (via criancas)
create policy "familia_medicamentos" on public.medicamentos
  for all
  using (
    crianca_id in (
      select c.id
      from public.criancas c
      join public.perfis p on p.familia_id = c.familia_id
      where p.id = auth.uid()
    )
  )
  with check (
    crianca_id in (
      select c.id
      from public.criancas c
      join public.perfis p on p.familia_id = c.familia_id
      where p.id = auth.uid()
    )
  );

-- Doses_planejadas: restringir por familia via medicamento
create policy "familia_doses_planejadas" on public.doses_planejadas
  for all
  using (
    medicamento_id in (
      select m.id
      from public.medicamentos m
      join public.criancas c on c.id = m.crianca_id
      join public.perfis p on p.familia_id = c.familia_id
      where p.id = auth.uid()
    )
  )
  with check (
    medicamento_id in (
      select m.id
      from public.medicamentos m
      join public.criancas c on c.id = m.crianca_id
      join public.perfis p on p.familia_id = c.familia_id
      where p.id = auth.uid()
    )
  );