# Agenda Sorriso — liberação comercial

Objetivo: vender e operar o serviço real para clínicas aprovadas no mesmo Worker Cloudflare e projeto Supabase. A página pública deve apresentar o produto real e a contratação; dados de cada clínica continuam isolados. O administrador gerencia a plataforma sem ser clínica.

## Arquitetura e critérios

1. **Identidade e acesso:** manter confirmação de e-mail, aprovação administrativa e RLS. Revisar políticas remotas contra migrações; testar acesso negado antes da aprovação, após suspensão e entre clínicas. Trocar a chave SMTP exposta diretamente nos painéis.
2. **WhatsApp e áudio:** API oficial da Meta, assinatura do webhook, número autorizado, inbox idempotente, transcrição por uso e envio controlado. Testar entrada, resposta, mídia, falhas e duplicatas com número de teste real; não ativar envios reais sem confirmação do titular.
3. **Lembretes:** agendamento automático com despacho periódico, reivindicação atômica, verificação de clínica ativa, cancelamento e controle de duplicatas. Modelo de mensagem aprovado pela Meta para contato fora da janela de atendimento. Testar sem destinatários reais antes da ativação.
4. **Google Agenda:** OAuth por clínica, tokens protegidos no servidor, calendário escolhido, sincronização idempotente de criar/alterar/cancelar, renovação de token e reconexão. Não enviar detalhes médicos aos calendários.
5. **Stripe:** Checkout em modo teste, portal do cliente, webhooks verificados e idempotentes, plano e vigência refletidos no banco. Testar compra, renovação, falha, cancelamento e suspensão. Cobrança real somente após confirmação específica.
6. **Interface de venda:** substituir a apresentação de demonstração por produto e fluxo comercial real apenas após as integrações funcionarem; deixar preços e créditos coerentes com o que o sistema de fato mede e entrega. Testar cadastro, compra e ativação em navegador.

## Preservação, publicação e reversão

- Preservar o ZIP original, a clínica legada e os dados remotos. Não incluir segredos em código, build, logs ou chat.
- Migrações novas serão aditivas e comparadas com o esquema remoto antes da aplicação; registrar reversão. Não publicar código que dependa de migração ausente.
- Validar testes automatizados, tipagem, build com chave publicável do mesmo projeto, smoke test do Worker e cada fluxo externo com evidência observável.
- Manter a versão Cloudflare anterior disponível para rollback. Só declarar apto ao comércio quando todos os critérios acima estiverem cumpridos; status parcial deve ser explicitado.

## Dependências externas

- Acesso administrativo aos painéis Meta, Google Cloud e Stripe; números, contas e produtos corretos verificados visualmente.
- Segredos inseridos nos painéis protegidos, nunca enviados no chat. Desafios OTP/MFA podem exigir o titular.
- Confirmação do titular antes de custos recorrentes, envios WhatsApp reais ou cobranças reais, conforme pedido original.
