import type { SupabaseClient } from '@supabase/supabase-js'

const DB_NAME = 'med-doses'
const DB_VERSION = 1
const STORE_NAME = 'eventos'

export type StatusEventoDose = 'pendente' | 'tomado' | 'pulado' | 'atrasado'

export interface LocalDoseEvent {
  offlineId: string
  dose_planejada_id: string | null
  medicamento_id: string | null
  crianca_id: string | null
  data_prevista: string
  hora_prevista: string
  status: StatusEventoDose
  hora_administrada: string | null
  observacao: string | null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'offlineId' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function queueDoseEvent(event: LocalDoseEvent) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(event)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

async function getAllEvents(): Promise<LocalDoseEvent[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()
    req.onsuccess = () => {
      db.close()
      resolve(req.result as LocalDoseEvent[])
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

async function clearEvents(ids: string[]) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    ids.forEach((id) => store.delete(id))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function syncDoseEvents(supabase: SupabaseClient) {
  if (!navigator.onLine) return

  const events = await getAllEvents()
  if (events.length === 0) return

  const successIds: string[] = []

  for (const ev of events) {
    const { error } = await supabase.from('eventos_dose').insert({
      dose_planejada_id: ev.dose_planejada_id,
      medicamento_id: ev.medicamento_id,
      crianca_id: ev.crianca_id,
      data_prevista: ev.data_prevista,
      hora_prevista: ev.hora_prevista,
      status: ev.status,
      hora_administrada: ev.hora_administrada,
      observacao: ev.observacao,
      offline_id: ev.offlineId,
    })

    if (!error) {
      successIds.push(ev.offlineId)
    } else if (error.message.includes('offline_id')) {
      successIds.push(ev.offlineId)
    }
  }

  if (successIds.length > 0) {
    await clearEvents(successIds)
  }
}
