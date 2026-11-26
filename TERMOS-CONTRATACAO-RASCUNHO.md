# Agenda Sorriso — minuta de Termos de Uso e Contratação

**Status: rascunho interno para revisão jurídica e comercial. Não publicar nem usar como aceite de contratação nesta versão.**

## A. Minuta

**Fornecedor.** 63.160.079 Fernando Oliveira Cruz, CNPJ 63.160.079/0001-38, endereço comercial Avenida do Líbano, 249 — Jardim Santo Antônio, Goiânia — GO, 74853-050, contato `winpsistemas@gmail.com`. Endereço informado pelo titular em 25/11/2026; conferir a correspondência com o cadastro empresarial antes de publicar estes termos.

**Serviço.** O Agenda Sorriso oferece software de agenda e atendimento para clínicas odontológicas. A demonstração pública usa dados fictícios, dispensa login e não grava as escolhas da simulação. O serviço real começa com agenda vazia, separada por clínica. O cadastro exige confirmação do e-mail e aprovação do administrador; a criação da conta, por si, não inicia cobrança nem garante aprovação.

**Uso pela clínica.** A clínica informa corretamente seus dados, configura profissionais, serviços e horários e mantém o controle de sua conta e de seu número oficial de WhatsApp. Ela é responsável por seus atendimentos e pelas decisões clínicas. O software não presta diagnóstico ou orientação odontológica. Pedidos de urgência devem ser encaminhados a profissional ou equipe humana.

**Dados de pacientes.** A clínica define as finalidades e as instruções para o tratamento dos dados de seus pacientes. O Agenda Sorriso presta o serviço tecnológico, com controles de acesso por clínica. A clínica deve informar seus pacientes sobre o uso de mensagens, automação, áudio e lembretes, quando esses recursos forem ativados. A [Política de Privacidade](https://agenda.winp.com.br/politica-de-privacidade) descreve as categorias de dados e prestadores envolvidos.

**Planos e créditos.** O catálogo atual apresenta Essencial (R$ 30/mês ou R$ 300/ano; 300 créditos mensais), Crescimento (R$ 50/mês ou R$ 500/ano; 800 créditos mensais) e Profissional (R$ 100/mês ou R$ 1.000/ano; 2.000 créditos mensais). O período anual corresponde a doze meses de acesso, com franquia renovada mensalmente. A tabela atual de consumo prevê um crédito por mensagem processada e dez créditos por transcrição de áudio, além do crédito da mensagem. Pacotes avulsos previstos: 100 créditos por R$ 15, 500 por R$ 60 e 1.000 por R$ 100, disponíveis somente com assinatura ativa. **Todos esses preços e regras são os implementados no código e ainda precisam de validação comercial antes de ativar cobrança real.**

**Contratação e pagamento.** Após aprovação e definição do plano, a clínica poderá ser encaminhada ao Checkout da Stripe. A assinatura e os pacotes somente serão reconhecidos após confirmação do pagamento pelo provedor. Atualmente, o Checkout está limitado ao ambiente de teste; nenhuma cobrança real está autorizada. Antes da abertura comercial, a tela final deverá apresentar preço total, periodicidade, condições de renovação, eventual tributo e meios de suporte. **[CONFIRMAR: periodicidade de renovação e política comercial de reajuste.]**

**Cancelamento, arrependimento e reembolso — PROPOSTA, NÃO APROVADA.** A clínica pode solicitar o cancelamento a qualquer momento pelo portal de cobrança, se habilitado, ou pelo contato de suporte. A renovação automática deixa de ocorrer após o cancelamento confirmado; o acesso pago continua até o fim do período já quitado, salvo obrigação legal ou acordo específico em sentido diverso. Os créditos incluídos renovam a cada período mensal e não se acumulam. Créditos extras comprados permanecem registrados após a renovação da franquia, mas seu uso requer assinatura ativa. Reembolsos e estornos serão analisados individualmente pelo canal de suporte, preservados os direitos legais aplicáveis e as hipóteses de falha do serviço. **[CONFIRMAR COM TITULAR E PROFISSIONAL: prazo de atendimento do pedido, tratamento dos créditos extras após encerramento definitivo, reembolso proporcional, arrependimento e procedimento operacional na Stripe.]** A aplicação prevê acesso ao portal Stripe, mas a configuração efetiva de cancelamento nele ainda precisa ser testada.

**Integrações.** WhatsApp, transcrição, lembretes e Google Agenda dependem da conexão e configuração da clínica e da disponibilidade dos provedores. A publicação do aplicativo Meta e os testes técnicos não representam ativação automática de envios reais. A clínica só recebe mensagens no número que conectar oficialmente. **[CONFIRMAR: condições de suporte, disponibilidade e manutenção.]**

**Suspensão.** O administrador pode suspender o acesso da clínica conforme as regras comerciais e de segurança aplicáveis. **[CONFIRMAR: causas, avisos, prazo de regularização e forma de exportação ou exclusão dos dados.]**

**Contato.** Solicitações sobre a conta ou a contratação podem ser enviadas a `winpsistemas@gmail.com`. **[CONFIRMAR: canal de suporte e prazo de resposta.]**

**Vigência e alterações.** Estes termos deverão indicar a data de publicação e a forma de comunicar alterações relevantes antes de entrarem em vigor. **[CONFIRMAR: mecanismo de aceite e registro de versão no produto.]**

## B. Pontos para validação antes de publicar

| Item | Estado | Responsável |
| --- | --- | --- |
| Identificação do fornecedor e CNPJ | Endereço informado pelo titular; conferir titularidade e correspondência com o cadastro empresarial | Titular |
| Preços, franquias e consumo | Extraídos de `src/lib/commercial-plans.ts`; validar oferta final e Stripe real | Titular |
| Renovação, reajuste, cancelamento e reembolso | Regras comerciais não definidas por completo | Titular e advogado(a) |
| Direito de arrependimento | Confirmar aplicação ao público B2B e redigir procedimento | Advogado(a) |
| Tratamento de dados de pacientes e saúde | Rever papéis de controlador/operador, instruções da clínica e prestadores internacionais | Advogado(a)/privacidade |
| Retenção, exportação e exclusão após suspensão | Definir política e implementar fluxo verificável | Titular e equipe técnica |
| Endereço, suporte e prazo de resposta | Faltam dados operacionais para exibição pública | Titular |
| Aceite e histórico de versões | Implementar antes de vender ou habilitar Checkout real | Equipe técnica |
| Política de Privacidade publicada | Revisar texto e operação real antes de abrir vendas | Advogado(a)/privacidade |

**Referências oficiais para a revisão:** [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), [Código de Defesa do Consumidor](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), [Decreto de comércio eletrônico](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm) e [guia da ANPD sobre agentes de tratamento](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado).
