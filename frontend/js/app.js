// Estado global da aplicação (ADR-026, estado híbrido):
// o que várias telas usam fica no store 'app'; o resto, em cada tela (js/telas/).
//
// Registro no evento alpine:init — a versão CDN do Alpine se inicializa
// sozinha, então NÃO há Alpine.start() aqui.
document.addEventListener('alpine:init', () => {
  const hoje = new Date();

  Alpine.store('app', {
    telaAtiva: 'dashboard',
    mes: hoje.getMonth() + 1,
    ano: hoje.getFullYear(),
    categorias: [],
    tetos: [],
    carregando: false,
    erroApi: null,

    // O Alpine chama init() do store automaticamente, logo após registrá-lo
    init() {
      this.carregarDadosBase();
    },

    get rotuloMes() {
      return `${String(this.mes).padStart(2, '0')}/${this.ano}`;
    },

    mostrarTela(nome) {
      this.telaAtiva = nome;
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
