// Tela Dashboard (ADR-027): EXIBE o GET /dashboard. O backend já calcula e
// ordena tudo (ADRs 021-023); aqui só se decide o que mostrar e como.

// v1 é monousuário
const NOME_USUARIO = 'Gabriel';

// Camada de categorias do variables.css (ids canônicos da ADR-005)
const VARIAVEL_DA_CATEGORIA = {
  1: '--cor-cat-alimentacao',
  2: '--cor-cat-lazer',
  3: '--cor-cat-compras',
  4: '--cor-cat-saude',
  5: '--cor-cat-educacao',
  6: '--cor-cat-esporte',
  7: '--cor-cat-transporte',
  8: '--cor-cat-outros',
};

// Status do backend -> classe com as variáveis de estado (quase_no_teto usa "alerta")
const CLASSE_DO_STATUS = {
  estourado: 'estado-estourado',
  quase_no_teto: 'estado-alerta',
  folgado: 'estado-folgado',
};

// -1 mês passado, 0 mês atual, 1 mês futuro (comparado com hoje, fuso local)
function posicaoDoMes(mes, ano) {
  const hoje = new Date();
  return Math.sign((ano * 12 + mes) - (hoje.getFullYear() * 12 + hoje.getMonth() + 1));
}

document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => ({
    nomeUsuario: NOME_USUARIO,
    dados: null,          // última resposta do /dashboard
    carregando: false,
    erro: false,
    mostrarRecolhidas: false,
    sequencia: 0,         // só a busca mais recente é aplicada

    init() {
      // Decisão F: recarrega ao ficar visível e ao trocar de mês, sem cache
      this.$watch('$store.app.telaAtiva', (tela) => {
        if (tela === 'dashboard') this.carregar();
      });
      // Chave única: na virada dez -> jan, mes e ano mudam juntos (1 busca, não 2)
      this.$watch('`${$store.app.ano}-${$store.app.mes}`', () => {
        this.mostrarRecolhidas = false;
        // Escondido, não busca: recarrega quando voltar a ficar visível
        if (this.$store.app.telaAtiva === 'dashboard') this.carregar();
      });
      if (this.$store.app.telaAtiva === 'dashboard') this.carregar();
    },

    async carregar() {
      const store = this.$store.app;
      const minhaVez = ++this.sequencia;
      this.carregando = true;
      this.erro = false;
      try {
        const dados = await api.dashboard(store.mes, store.ano);
        if (minhaVez !== this.sequencia) return; // resposta antiga (cliques rápidos): descarta
        this.dados = dados;
        store.erroApi = null;
      } catch (erro) {
        if (minhaVez !== this.sequencia) return;
        this.erro = true;
        store.registrarErro(erro);
      } finally {
        if (minhaVez === this.sequencia) this.carregando = false;
      }
    },

    tentarDeNovo() {
      if (this.$store.app.categorias.length === 0) this.$store.app.carregarDadosBase();
      this.carregar();
    },

    // ---------- Navegação de mês (store compartilhado) ----------
    mesAnterior() {
      this.$store.app.trocarMes(this.$store.app.mes - 1, this.$store.app.ano);
    },
    proximoMes() {
      this.$store.app.trocarMes(this.$store.app.mes + 1, this.$store.app.ano);
    },
    voltarParaHoje() {
      const hoje = new Date();
      this.$store.app.trocarMes(hoje.getMonth() + 1, hoje.getFullYear());
    },
    get rotuloMes() {
      return formatar.mes(this.$store.app.mes, this.$store.app.ano);
    },
    get posicaoMesExibido() {
      return posicaoDoMes(this.$store.app.mes, this.$store.app.ano);
    },

    // ---------- Estados (decisão D) ----------
    get primeiraCarga() {
      return this.dados === null && this.carregando;
    },
    get atualizando() {
      return this.dados !== null && this.carregando;
    },
    get mesVazio() {
      return this.dados.categorias.every((c) => c.quantidade === 0);
    },
    get rotuloMesDosDados() {
      return formatar.mes(this.dados.mes, this.dados.ano);
    },

    // ---------- Hero (decisão B) ----------
    get semTetos() {
      return this.dados.hero.total_teto === 0;
    },
    get textoPrazo() {
      const posicao = posicaoDoMes(this.dados.mes, this.dados.ano);
      if (posicao < 0) return 'mês fechado';
      if (posicao > 0) return 'mês ainda não começou';
      const dias = this.dados.dias_restantes_no_mes;
      if (dias === 0) return 'último dia do mês';
      return dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`;
    },

    // ---------- Categorias (decisão C), sempre na ordem do backend ----------
    get categoriasVisiveis() {
      return this.dados.categorias.filter((c) => c.gasto > 0 || c.teto !== null);
    },
    get categoriasRecolhidas() {
      return this.dados.categorias.filter((c) => !(c.gasto > 0 || c.teto !== null));
    },
    get rotuloRecolhidas() {
      const n = this.categoriasRecolhidas.length;
      return n === 1 ? '1 categoria sem movimento' : `${n} categorias sem movimento`;
    },
    chave(c) {
      return c.categoria_macro ? c.categoria_macro.id : 'sem-categoria';
    },
    nomeCategoria(c) {
      return c.categoria_macro ? c.categoria_macro.nome : c.categoria_virtual_nome;
    },
    estiloCategoria(c) {
      const variavel = c.categoria_macro ? VARIAVEL_DA_CATEGORIA[c.categoria_macro.id] : null;
      return variavel ? `--cor-categoria: var(${variavel})` : '';
    },
    valorCategoria(c) {
      const gasto = formatar.dinheiro(c.gasto);
      if (!c.categoria_macro) return `${gasto} · ${c.quantidade} para categorizar`;
      if (c.teto === null) return `${gasto} · sem teto`;
      return `${gasto} de ${formatar.dinheiro(c.teto)}`;
    },
    textoEstouro(c) {
      return `+${formatar.dinheiro(-c.diferenca)} acima do teto`;
    },

    // ---------- Barras ----------
    classeStatus(status) {
      return CLASSE_DO_STATUS[status] ?? '';
    },
    // Limitada a 100%; percentual null com estouro = teto 0 com gasto (barra cheia)
    largura(percentual, status) {
      if (percentual === null) return status === 'estourado' ? 100 : 0;
      return Math.min(percentual, 100);
    },
  }));
});
