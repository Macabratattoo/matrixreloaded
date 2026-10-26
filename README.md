# matrixreloaded

Site de agendamento com pagamento do sinal via Mercado Pago.

## Mercado Pago

Configure `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` como variáveis de ambiente na Vercel. Use credenciais e segredo do mesmo ambiente (teste no Preview; produção no Production). Nunca coloque essas chaves no código do site.

O checkout cria Pix de R$ 50 no servidor, vinculado ao agendamento por `external_reference`, com expiração de 35 minutos e chave de idempotência. O front consulta `/api/status-pagamento`; `/api/mp-webhook` valida a assinatura e consulta o pagamento diretamente ao Mercado Pago. A planilha só muda para `confirmado` após a API retornar `approved`.

Configure as notificações da aplicação Mercado Pago para o endpoint `/api/mp-webhook` e habilite o evento de pagamentos. As colunas S e T da planilha guardam, respectivamente, o prazo da reserva Pix e o identificador da tentativa idempotente.
