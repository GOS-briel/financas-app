// Máscara de centavos compartilhada (Registrar e Tetos — ADRs 028 e 029).
// Script comum: expõe window.mascaraCentavos (mesmo padrão do formatar).
//
// Só o evento input, nunca keydown: no teclado virtual do Android o keydown
// chega com keyCode 229, sem a tecla real. A cada mudança, os dígitos do campo
// viram o novo valor — cobre teclado físico, virtual, colar e apagar.
(function () {
  // 9 dígitos = até R$ 9.999.999,99
  const MAXIMO_DIGITOS = 9;

  window.mascaraCentavos = {
    // Centavos (inteiro) a partir do evento input, ou null se não sobrou dígito.
    // permitirZero: digitar ou colar "0" vira 0 EXPLÍCITO (teto "não gastar
    // nada"); apagar até zerar vira null. Sem a opção, zero também é null.
    ler(evento, { permitirZero = false } = {}) {
      const todos = evento.target.value.replace(/\D/g, '');
      const digitos = todos.replace(/^0+/, '').slice(0, MAXIMO_DIGITOS);
      if (digitos) return Number(digitos);
      if (!permitirZero || !todos) return null;
      // Só zeros no campo: veio de apagar ("R$ 0,05" -> "R$ 0,0") ou de digitar 0?
      return (evento.inputType ?? '').startsWith('delete') ? null : 0;
    },

    // Escreve direto no campo: se os centavos não mudarem (ex.: digitou uma
    // letra), o Alpine não re-renderizaria e a letra ficaria lá
    escrever(campo, centavos) {
      campo.value = centavos === null ? '' : formatar.dinheiro(centavos / 100);
      this.cursorNoFim(campo);
    },

    cursorNoFim(campo) {
      const fim = campo.value.length;
      // Alguns navegadores só aceitam setSelectionRange com o campo focado
      try { campo.setSelectionRange(fim, fim); } catch { /* sem efeito */ }
    },
  };
})();
