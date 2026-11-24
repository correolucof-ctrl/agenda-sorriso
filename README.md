# Agenda Sorriso

Agenda e atendimento para clínicas odontológicas. Este repositório contém o aplicativo independente em TanStack Start/React, as migrações SQL e o Worker de tarefas agendadas. A demonstração pública na página inicial usa somente estado do navegador: não exige login nem grava seus dados.

## Estado

O aplicativo existente está publicado em [agenda-sorriso.correo-lucof-708.workers.dev](https://agenda-sorriso.correo-lucof-708.workers.dev/). A página comercial e o painel administrativo atualizado estão no Worker. **As integrações ainda não foram verificadas de ponta a ponta**: WhatsApp Cloud API por clínica, transcrição, lembretes, Google Calendar e Stripe. Não tratar a presença do código como ativação do serviço. Envios e cobranças reais ficam desativados por padrão.

O fluxo de cadastro com confirmação de e-mail, aprovação administrativa, agenda vazia, primeira consulta e bloqueio após suspensão foi verificado na versão publicada. Os demais critérios de liberação estão em `PLANO-PRODUTO.md`; o checkpoint mais recente fica em `STATUS-2026-11-24.md`.

## Desenvolvimento

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
npm test
npx tsc --noEmit
npm run build
```

Copie `.env.example` para `.env.local` e preencha apenas no ambiente local. O arquivo `.env.local` é ignorado pelo Git. Para o projeto existente, use a URL e a chave **publicável** do Supabase correspondente; nunca exponha a chave `service_role` no cliente. A versão de produção compila para `.output/server` e `.output/public`.

## Banco e serviços

- `drizzle/migrations/` contém o esquema base exportado. `standalone/0001` a `0003` documentam a separação entre demonstração, clínica real e administrador já aplicada no projeto existente.
- `standalone/0004` a `0009` preparam cobrança, Google Calendar, WhatsApp por clínica, lembretes, créditos e remoção da concessão administrativa legada. **Foram aplicadas no Supabase existente em 24/11/2026**, após validação conjunta em transação revertida. O checkpoint e as verificações estão em `STATUS-2026-11-24.md`.
- O mesmo Worker Cloudflare e o mesmo projeto Supabase devem ser reutilizados. Segredos de Stripe, Meta, Google, cron e Supabase são configurados diretamente nos respectivos painéis ou como segredos do Worker; nenhum valor deve entrar no Git.
- Os identificadores de preços em `config/stripe-test-prices.json` pertencem somente ao ambiente de teste da Stripe.

## Segurança e ativação

Cada clínica tem sua própria agenda e seu número oficial de WhatsApp. A conta administrativa gerencia aprovação e suspensão, sem operar como clínica. O webhook da Meta valida a assinatura; os tokens de cada número e do Google Calendar são criptografados no servidor. O webhook da Stripe valida a assinatura e concilia pagamentos antes de creditar pacotes.

Não ativar envios WhatsApp ou cobranças reais sem confirmação expressa do titular. A chave SMTP anteriormente exposta em conversa deve ser substituída diretamente nos painéis Brevo e Supabase. A confirmação de e-mail deve permanecer ativa.
