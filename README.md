# 💊 Medicacao Inteligente

App PWA de controle de medicacao infantil — **offline-first**, suporte familiar e IA.

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Backend/Auth/DB:** Supabase
- **Deploy:** Vercel
- **Offline:** IndexedDB + Service Worker
- **IA:** Supabase Edge Functions + OpenAI

## Estrutura

```
src/
  app/           # Paginas (App Router)
  lib/supabase/  # Cliente Supabase (browser + server)
  middleware.ts  # Protecao de rotas
supabase/
  migrations/    # Schema SQL
  functions/     # Edge Functions (em breve)
public/
  manifest.json  # PWA manifest
```

## Como rodar local

```bash
npm install
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Variaveis de ambiente (Vercel)

| Variavel | Descricao |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon publica |
| `NEXT_PUBLIC_APP_VERSION` | Versao (ex: 0.1.0) |

## Rotas

| Rota | Descricao |
|---|---|
| `/` | Home / Landing |
| `/login` | Autenticacao (magic link) |
| `/dashboard` | Agenda do dia |
| `/diagnostico` | Status do app |
| `/criancas` | Gerenciar criancas |
| `/historico` | Historico de doses |

## Status do projeto

- [x] Estrutura base Next.js 14
- [x] Schema Supabase (familias, criancas, medicamentos, doses, eventos)
- [x] Autenticacao magic link
- [x] Dashboard basico
- [x] Pagina de diagnostico
- [ ] Offline-first com IndexedDB
- [ ] PWA Service Worker
- [ ] Edge Function IA (parse-prescription)
- [ ] Cadastro de criancas
- [ ] Historico completo
