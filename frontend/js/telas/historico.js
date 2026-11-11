// Tela Histórico — estado local da tela (ADR-026). Placeholder da Etapa 12.2.
document.addEventListener('alpine:init', () => {
  Alpine.data('historico', () => ({
    // Ex. futuro: lista de lançamentos do mês (api.lancamentos) + filtros
  }));
});
