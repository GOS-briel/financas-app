// Tela Histórico (ADR-030): lançamentos do mês do store, agrupados por macro.
// Totais e quantidades por grupo e o total do mês vêm do /dashboard (o
// frontend exibe, não recalcula); a ordem dos grupos pelo gasto é só exibição.

// As N macro de maior gasto começam abertas; "Sem categoria" abre se tiver itens
const GRUPOS_ABERTOS = 2;

document.addEventListener('alpine:init', () => {
  Alpine.data('historico', () => ({
    lancamentos: [],      // GET /lancamentos (data desc, id desc)
    dashboard: null,      // GET /dashboard do mesmo mês
    mesCarregado: null,
    carregando: false,
    erro: false,
    sequencia: 0,
    abertos: {},          // chave do grupo -> true/false (o que o usuário mudou)
    itemAtivo: null,      // id do item com "Editar · Apagar" visível
    confirmandoApagar: null,
    ocupado: null,        // id em operação (aceitar / apagar)
    erroItem: { id: null, texto: '' },

    init() {
      this.$watch('$store.app.telaAtiva', (tela) => {
        if (tela !== 'historico') return;
        // Voltando (ex.: da edição): ações do item fechadas; grupos como estavam
        this.itemAtivo = null;
        this.confirmandoApagar = null;
        this.carregar();
      });
      this.$watch('`${$store.app.ano}-${$store.app.mes}`', () => {
        if (this.$store.app.telaAtiva === 'historico') this.carregar();
      });
      // Lançamento mudou (aqui ou no Desfazer do aviso): lista e totais juntos
      this.$watch('$store.app.revisao', () => {
        if (this.$store.app.telaAtiva === 'historico') this.carregar();
      });
      if (this.$store.app.telaAtiva === 'historico') this.carregar();
    },

    async carregar() {
      const store = this.$store.app;
      const { mes, ano } = store;
      const minhaVez = ++this.sequencia;
      this.carregando = true;
      this.erro = false;
      try {
        const [lancamentos, dashboard] = await Promise.all([api.lancamentos(mes, ano), api.dashboard(mes, ano)]);
        if (minhaVez !== this.sequencia) return;
        const mesmoMes = this.mesCarregado?.mes === mes && this.mesCarregado?.ano === ano;
        if (!mesmoMes) {
          this.abertos = {};
          this.itemAtivo = null;
          this.confirmandoApagar = null;
        }
        this.lancamentos = lancamentos;
        this.dashboard = dashboard;
        this.mesCarregado = { mes, ano };
        store.erroApi = null;
      } catch (erro) {
        if (minhaVez !== this.sequencia) return;
        this.erro = true;
        store.registrarErro(erro);
      } finally {
        if (minhaVez === this.sequencia) this.carregando = false;
      }
    },

    // ---------- Navegação de mês (store compartilhado) ----------
    get rotuloMes() {
      return formatar.mes(this.$store.app.mes, this.$store.app.ano);
    },
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
    get posicaoMesExibido() {
      return posicaoDoMes(this.$store.app.mes, this.$store.app.ano); // dashboard.js
    },

    // ---------- Estados ----------
    get primeiraCarga() {
      return this.dashboard === null && this.carregando;
    },
    get atualizando() {
      return this.dashboard !== null && this.carregando;
    },
    get mesVazio() {
      return this.dashboard !== null && this.lancamentos.length === 0;
    },
    get resumo() {
      const n = this.lancamentos.length;
      const total = formatar.dinheiro(this.dashboard.hero.total_gasto);
      return `${n} ${n === 1 ? 'lançamento' : 'lançamentos'} · ${total}`;
    },

    // ---------- Grupos ----------
    get grupos() {
      if (!this.dashboard) return [];
      const itensPorMacro = new Map();
      for (const l of this.lancamentos) {
        const chave = l.categoria_macro_id ?? 'sem';
        if (!itensPorMacro.has(chave)) itensPorMacro.set(chave, []);
        itensPorMacro.get(chave).push(l);
      }
      // Só ordem de exibição: o gasto vem pronto do backend (sort estável:
      // empate mantém a ordem do /dashboard)
      const macros = this.dashboard.categorias
        .filter((c) => c.categoria_macro && c.quantidade > 0)
        .sort((a, b) => b.gasto - a.gasto)
        .map((c, posicao) => ({
          chave: c.categoria_macro.id,
          nome: c.categoria_macro.nome,
          quantidade: c.quantidade,
          gasto: c.gasto,
          itens: itensPorMacro.get(c.categoria_macro.id) ?? [],
          padraoAberto: posicao < GRUPOS_ABERTOS,
        }));
      const sem = this.dashboard.categorias.find((c) => !c.categoria_macro);
      if (sem && sem.quantidade > 0) {
        macros.push({
          chave: 'sem',
          nome: sem.categoria_virtual_nome,
          quantidade: sem.quantidade,
          gasto: sem.gasto,
          itens: itensPorMacro.get('sem') ?? [],
          padraoAberto: true,
        });
      }
      return macros;
    },
    aberto(g) {
      return this.abertos[g.chave] ?? g.padraoAberto;
    },
    alternarGrupo(g) {
      this.abertos = { ...this.abertos, [g.chave]: !this.aberto(g) };
    },
    cabecalho(g) {
      return `${g.quantidade} · ${formatar.dinheiro(g.gasto)}`;
    },

    // ---------- Itens ----------
    detalhe(l) {
      const partes = [formatar.dataCurta(l.data), l.subcategoria_nome ?? 'Sem categoria',
        l.origem === 'fatura' ? 'fatura' : 'manual'];
      return partes.join(' · ');
    },
    alternarItem(l) {
      this.itemAtivo = this.itemAtivo === l.id ? null : l.id;
      this.confirmandoApagar = null;
      this.limparErroItem();
    },
    limparErroItem() {
      this.erroItem = { id: null, texto: '' };
    },
    editar(l) {
      this.$store.app.editarLancamento(l);
    },

    // Sugestão (ADRs 018-020): Aceitar categoriza E ensina
    async aceitar(l) {
      if (this.ocupado) return;
      this.ocupado = l.id;
      this.limparErroItem();
      try {
        await api.categorizar(l.id, l.subcategoria_sugerida.id);
        this.$store.app.revisao++; // recarrega lista + /dashboard (grupos e totais)
      } catch (erro) {
        this.erroItem = { id: l.id, texto: api.mensagemDeErro(erro) };
      } finally {
        this.ocupado = null;
      }
    },

    // DELETE definitivo (ADR-016): a confirmação é inline, sem confirm()
    pedirApagar(l) {
      this.confirmandoApagar = l.id;
    },
    async apagar(l) {
      if (this.ocupado) return;
      this.ocupado = l.id;
      this.limparErroItem();
      try {
        await api.apagarLancamento(l.id);
        this.confirmandoApagar = null;
        this.itemAtivo = null;
        this.$store.app.revisao++;
      } catch (erro) {
        this.erroItem = { id: l.id, texto: api.mensagemDeErro(erro) };
      } finally {
        this.ocupado = null;
      }
    },
  }));
});
