// Formatação pt-BR compartilhada pelas telas (ADR-027), com Intl nativo.
// Script comum: expõe window.formatar (mesmo padrão do api.js).
(function () {
  const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

  window.formatar = {
    // 1240.5 -> "R$ 1.240,50" (o Intl usa espaço inquebrável depois do R$)
    dinheiro: (valor) => MOEDA.format(valor ?? 0),

    // Inteiro arredondado PARA BAIXO: 99,6% não aparece como "100%"
    // enquanto o teto ainda não foi atingido
    percentual: (valor) => `${Math.floor(valor ?? 0)}%`,

    // "2026-11-03" -> "03/11" fatiando o texto. new Date("2026-11-03") seria
    // interpretado como UTC e, no fuso de Brasília, viraria 02/11.
    dataCurta: (dataIso) => {
      const [, mes, dia] = dataIso.split('-');
      return `${dia}/${mes}`;
    },

    // (11, 2026) -> "Novembro 2026". new Date(ano, mes - 1, 1) usa o fuso local.
    mes: (mes, ano) => {
      const nome = NOME_DO_MES.format(new Date(ano, mes - 1, 1));
      return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${ano}`;
    },
  };
})();
