import type { SupabaseClient } from '@supabase/supabase-js'

interface PerfilRow {
  id: string
  familia_id: string | null
  nome: string | null
  papel: string | null
}

interface FamiliaRow {
  id: string
  nome: string
}

export async function ensureFamiliaAndPerfil(
  supabase: SupabaseClient,
  userId: string,
  userEmail?: string | null,
): Promise<string | null> {
  const { data: perfilData, error: perfilError } = await supabase
    .from('perfis')
    .select('id, familia_id, nome, papel')
    .eq('id', userId)
    .maybeSingle<PerfilRow>()

  if (perfilError) {
    console.warn('Erro ao carregar perfil', perfilError.message)
    return null
  }

  let familiaId: string | null = perfilData?.familia_id ?? null

  if (!familiaId) {
    const baseNome =
      (userEmail && userEmail.split('@')[0]) || 'Familia'

    const { data: familiaInsert, error: familiaError } = await supabase
      .from('familias')
      .insert({ nome: `Familia ${baseNome}` })
      .select('id, nome')
      .single<FamiliaRow>()

    if (familiaError || !familiaInsert) {
      console.warn('Erro ao criar familia', familiaError?.message)
      return null
    }

    familiaId = familiaInsert.id
  }

  if (!perfilData) {
    const { error: insertPerfilError } = await supabase
      .from('perfis')
      .insert({
        id: userId,
        familia_id: familiaId,
        nome: userEmail ?? null,
        papel: 'responsavel',
      })

    if (insertPerfilError) {
      console.warn('Erro ao criar perfil', insertPerfilError.message)
    }
  } else if (!perfilData.familia_id) {
    const { error: updatePerfilError } = await supabase
      .from('perfis')
      .update({ familia_id: familiaId })
      .eq('id', userId)

    if (updatePerfilError) {
      console.warn('Erro ao atualizar perfil', updatePerfilError.message)
    }
  }

  return familiaId
}