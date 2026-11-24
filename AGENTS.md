# Agenda Sorriso — instruções do repositório independente

Este repositório é a versão independente do aplicativo originalmente exportado do Lovable. A operação atual usa o Worker Cloudflare `agenda-sorriso` e o projeto Supabase existente. O ZIP original permanece como referência histórica; não presumir sincronização automática deste repositório com o Lovable.

## Regras de implementação

- A demonstração fica na página inicial, sem login e sem persistência. Dados de cada clínica real são isolados por `clinic_id` e RLS. Uma clínica nova começa com a agenda vazia.
- A conta administrativa gerencia a plataforma e não deve funcionar como clínica. Cadastro exige e-mail confirmado, aprovação administrativa e acesso vigente.
- Disponibilidade e reservas são validadas no servidor e pela restrição de conflito do banco. A IA não inventa horários, preços ou orientação clínica; urgências usam resposta fixa e encaminhamento humano.
- Cada clínica usa seu próprio número oficial da Meta. Assinatura de webhook, escopo do número e estado da clínica são verificados antes do processamento. Transcrição e mensagens enviadas exigem credenciais do servidor.
- Integrações e cobranças ficam desativadas até que as migrações, credenciais e testes de ponta a ponta correspondentes sejam concluídos. O código local pode estar à frente do Worker publicado.
- Não registrar, imprimir, commitar ou enviar em chat segredos, chaves, tokens ou dados de pacientes. Usar `.env.example` somente com placeholders. Não incluir evidências com dados de contas no Git.
- O envio WhatsApp real e a cobrança real exigem confirmação do titular. Continuar com chaves e preços de teste até essa confirmação.

## Verificação e publicação

1. Comparar esquema remoto e migrações em `standalone/` antes de aplicar SQL. Preservar dados existentes e preparar rollback.
2. Rodar `npm test`, `npx tsc --noEmit` e `npm run build` antes de publicar.
3. Instalar segredos diretamente nos painéis protegidos. Nunca colocá-los em variáveis `VITE_*`, código ou Git.
4. Publicar no Worker existente e confirmar a experiência no navegador, além dos fluxos autenticados e webhooks relevantes. Manter a versão anterior para reversão.
5. Só chamar o serviço de pronto para venda depois de verificar cadastro, cobrança, WhatsApp, transcrição, lembretes, Google Agenda, suspensão e isolamento entre clínicas.

Leia `README.md`, `PLANO-PRODUTO.md` e o checkpoint `STATUS-2026-11-24.md` para o estado operacional atual.
