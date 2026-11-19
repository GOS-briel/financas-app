// Estado global da aplicação (ADR-026, estado híbrido):
// o que várias telas usam fica no store 'app'; o resto, em cada tela (js/telas/).
//
// Registro no evento alpine:init — a versão CDN do Alpine se inicializa
// sozinha, então NÃO há Alpine.start() aqui.
document.addEventListener('alpine:init', () => {
  const hoje = new Date();
  // Fora do store: o timer não precisa ser reativo
  let timerAviso = null;

  Alpine.store('app', {
    telaAtiva: 'dashboard',
    mes: hoje.getMonth() + 1,
    ano: hoje.getFullYear(),
    categorias: [],
    tetos: [],
    carregando: false,
    erroApi: null,
    // Sobe quando um lançamento muda fora do Dashboard (ex.: Desfazer):
    // o Dashboard observa e recarrega (ADR-028)
    revisao: 0,
    // Aviso temporário global: { texto, lancamentoId } — lancamentoId habilita "Desfazer"
    aviso: null,
    desfazendo: false,
    // Guarda de alterações não salvas (ADR-029): a tela de Tetos troca esta
    // função por uma que conta as suas alterações. Com alterações, sair da tela
    // não acontece na hora: vira navegacaoPendente e a tela mostra a faixa
    // "Salvar e continuar · Descartar" (sem confirm() do navegador).
    alteracoesNaoSalvas: () => 0,
    navegacaoPendente: null, // { tipo: 'tela', nome } | { tipo: 'mes', mes, ano }
    // Lançamento (formato do GET /lancamentos) aberto no Registrar em modo
    // edição (ADR-030); null = Registrar no modo "novo gasto"
    lancamentoEmEdicao: null,

    // O Alpine chama init() do store automaticamente, logo após registrá-lo
    init() {
      this.carregarDadosBase();
    },

    get rotuloMes() {
      return `${String(this.mes).padStart(2, '0')}/${this.ano}`;
    },

    mostrarTela(nome) {
      if (this.telaAtiva === 'tetos' && nome !== 'tetos' && this.alteracoesNaoSalvas() > 0) {
        this.navegacaoPendente = { tipo: 'tela', nome };
        return;
      }
      this.navegacaoPendente = null;
      // Saiu do Registrar: a edição acabou (salva ou abandonada)
      if (nome !== 'registrar') this.lancamentoEmEdicao = null;
      this.telaAtiva = nome;
    },

    // Botão + : sempre um gasto novo, mesmo no meio de uma edição
    novoGasto() {
      this.mostrarTela('registrar');
      if (this.telaAtiva === 'registrar') this.lancamentoEmEdicao = null;
    },

    editarLancamento(lancamento) {
      this.mostrarTela('registrar');
      if (this.telaAtiva === 'registrar') this.lancamentoEmEdicao = lancamento;
    },

    // Depois de "Salvar e continuar" (sem falhas) ou "Descartar"
    continuarNavegacao() {
      const pendente = this.navegacaoPendente;
      this.navegacaoPendente = null;
      if (!pendente) return;
      if (pendente.tipo === 'tela') this.mostrarTela(pendente.nome);
      else this.trocarMes(pendente.mes, pendente.ano);
    },

    cancelarNavegacao() {
      this.navegacaoPendente = null;
    },

    // Aceita mês fora de 1-12 (ex.: mes + 1 em dezembro vira janeiro do ano seguinte)
    async trocarMes(novoMes, novoAno) {
      const data = new Date(novoAno, novoMes - 1, 1);
      this.mes = data.getMonth() + 1;
      this.ano = data.getFullYear();
      await this.carregarTetos(); // tetos dependem do mês (herança, ADR-013)
    },

    async carregarDadosBase() {
      this.carregando = true;
      this.erroApi = null;
      try {
        [this.categorias, this.tetos] = await Promise.all([
          api.categorias(),
          api.tetos(this.mes, this.ano),
        ]);
      } catch (erro) {
        this.registrarErro(erro);
      } finally {
        this.carregando = false;
      }
    },

    // Depois de criar subcategoria: as telas leem as categorias daqui.
    // Propaga o erro: quem chamou decide como mostrar.
    async recarregarCategorias() {
      this.categorias = await api.categorias();
    },

    mostrarAviso(texto, lancamentoId = null, duracaoMs = 5000) {
      clearTimeout(timerAviso);
      this.aviso = { texto, lancamentoId };
      timerAviso = setTimeout(() => { this.aviso = null; }, duracaoMs);
    },

    fecharAviso() {
      clearTimeout(timerAviso);
      this.aviso = null;
    },

    async desfazerAviso() {
      const id = this.aviso?.lancamentoId;
      if (!id || this.desfazendo) return;
      this.desfazendo = true;
      clearTimeout(timerAviso); // não some no meio do DELETE
      try {
        await api.apagarLancamento(id);
        this.revisao++;
        this.mostrarAviso('Gasto desfeito', null, 3000);
      } catch (erro) {
        this.fecharAviso();
        this.registrarErro(erro);
      } finally {
        this.desfazendo = false;
      }
    },

    async carregarTetos() {
      try {
        this.tetos = await api.tetos(this.mes, this.ano);
      } catch (erro) {
        this.registrarErro(erro);
      }
    },

    registrarErro(erro) {
      console.error('[financas]', erro);
      // fetch lança TypeError quando não alcança o servidor (backend desligado, CORS)
      this.erroApi = erro instanceof TypeError
        ? 'Não foi possível conectar à API. O backend está rodando em 127.0.0.1:5000?'
        : erro.message;
    },
  });
});
