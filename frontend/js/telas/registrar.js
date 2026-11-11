// Tela Registrar — estado local da tela (ADR-026). Placeholder da Etapa 12.2.
document.addEventListener('alpine:init', () => {
  Alpine.data('registrar', () => ({
    // Ex. futuro: formulário (data, descricao, valor, subcategoria_id) + api.criarLancamento
  }));
});
