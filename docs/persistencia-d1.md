# Persistência D1

## O que foi implementado

- Schema SQL em `db/schema.sql` (tabelas `runs`, `projects`, `assets`).
- Camada de persistência em `server/persistence.ts`.
- Suporte a Cloudflare D1 via API REST (para o servidor Node atual).
- Fallback local em `data/runs-store.json` quando as credenciais D1 não estão configuradas.

## Como configurar D1

1. Crie um banco D1 no dashboard Cloudflare ou com Wrangler:
   ```bash
   wrangler d1 create okaro
   ```

2. Aplique o schema:
   ```bash
   wrangler d1 execute okaro --file=./db/schema.sql
   ```

3. Adicione ao `.env` (nunca comite os valores):
   ```
   CLOUDFLARE_ACCOUNT_ID=
   CLOUDFLARE_API_TOKEN=
   D1_DATABASE_ID=
   ```

4. O código detecta automaticamente se as credenciais estão presentes e usa D1; caso contrário usa o arquivo JSON local.

## Limitações atuais

- A API REST do D1 tem latência maior que o binding nativo de Workers.
- O email da run ainda não está persistido no `RunState` (pode ser adicionado depois).
- Projetos e ativos do framework completo ainda não estão totalmente ligados ao pipeline de geração de artigos (schema já preparado).

## Próximos passos

- Ligar `saveRun` / `getRun` dentro de `pipeline.ts` e `server.ts` (substituir o `Map` em memória).
- Adicionar endpoints para listar runs persistidas.
- Estender para a tabela `assets` quando o fluxo de ativos do framework for implementado.
