# Agenda Sorriso — anexo de tratamento de dados (minuta)

**Rascunho interno para validação pelo titular e profissional jurídico. Não é contrato publicado nem comprovação de conformidade.** Deve acompanhar os Termos de Uso e Contratação somente após aprovação e implementação dos procedimentos descritos.

## A. Minuta

**Partes e papéis.** A clínica contratante, identificada na contratação, define as finalidades do atendimento e da agenda de seus pacientes. 63.160.079 Fernando Oliveira Cruz, CNPJ 63.160.079/0001-38, opera a plataforma Agenda Sorriso e trata esses dados conforme as instruções documentadas da clínica para prestar o serviço. A qualificação final dos papéis em cada operação deve ser confirmada pelo profissional jurídico.

**Dados e operações.** A plataforma pode receber nome e telefone do paciente, data e status da consulta, mensagens livres e áudios, quando habilitados. As operações previstas são recepção, registro, organização, resposta automatizada, transcrição, lembretes, sincronização de agenda e suporte. Mensagens livres podem conter dados de saúde; a clínica deve definir as orientações e a hipótese legal aplicável ao atendimento. O produto não se destina a armazenar prontuário ou emitir diagnóstico.

**Instruções da clínica.** A clínica configura profissionais, serviços, horários, número WhatsApp e integrações. Ela deve informar seus pacientes sobre os canais e recursos que ativar e orientar sua equipe a evitar dados clínicos desnecessários em mensagens e na agenda. Instruções adicionais para tratamento, retenção e atendimento de direitos: **[CONFIRMAR EM CONTRATO OU PAINEL]**.

**Prestadores técnicos.** Cloudflare hospeda e processa requisições; Supabase fornece autenticação e banco; Brevo envia e-mails de conta. Meta, OpenAI, Google Agenda e Stripe participam apenas dos recursos correspondentes quando configurados. A lista, as regiões de processamento, os contratos com prestadores e os mecanismos de transferência internacional precisam de inventário e validação antes de oferta comercial.

**Acesso e segurança.** O projeto separa dados por clínica com `clinic_id` e políticas de acesso no banco, restringe credenciais ao servidor e mantém a conta administrativa para gestão da plataforma. Essas medidas precisam de verificação operacional contínua, inclusive testes entre clínicas e tratamento de incidentes.

**Pedidos de titulares.** A clínica recebe e decide pedidos referentes a seus pacientes. O Agenda Sorriso oferece o contato `winpsistemas@gmail.com` para encaminhar e auxiliar esses pedidos após verificação de identidade. Pedidos relativos à conta da clínica podem ser enviados pelo mesmo canal. O fluxo de identificação, registro, resposta, exportação e exclusão ainda precisa de procedimento técnico e prazo definidos: **[CONFIRMAR COM PROFISSIONAL E IMPLEMENTAR]**.

**Incidentes.** Cada parte comunicará à outra um incidente que afete os dados sob sua responsabilidade pelos canais contratuais e cooperará na apuração. Prazos, critérios de severidade, responsáveis e comunicação à autoridade e titulares: **[CONFIRMAR COM PROFISSIONAL E OPERACIONALIZAR]**.

**Fim do contrato.** O acesso ao serviço e o uso de integrações cessarão conforme os termos comerciais aprovados. Exportação, devolução, eliminação, retenções legais e prazo de execução: **[CONFIRMAR COM PROFISSIONAL E IMPLEMENTAR]**. Nenhum prazo automático de exclusão deve ser prometido antes de existir rotina verificável.

## B. Pontos de validação

| Tema | Estado atual | Próxima decisão |
| --- | --- | --- |
| Papéis e hipótese legal | Política descreve funções em termos gerais | Revisão jurídica por operação, especialmente dados de saúde |
| Inventário de prestadores e transferência internacional | Prestadores listados; regiões e instrumentos não auditados | Verificar contratos e fluxos reais |
| Direitos dos titulares | Página pública de instruções e e-mail existem | Criar processo de identificação, registro e resposta |
| Exportação e exclusão | Sem fluxo de ponta a ponta verificado | Definir retenção e implementar operações testáveis |
| Incidentes | Sem procedimento contratual aprovado | Definir responsáveis, contatos, prazos e registro |
| Isolamento entre clínicas | Migrações e RLS presentes | Teste autenticado com duas clínicas reais de teste |

Fontes para a revisão: [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) e [guia da ANPD sobre agentes de tratamento](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado).
