// Tela Importar fatura (ADR-032): escolher o PDF -> prévia sem gravar
// (simular, ADR-031) -> importar -> categorizar em lista.
// O seletor compacto de categoria reaproveita a lógica do Registrar
// (js/util/seletor-categoria.js); tudo é categorizado via POST categorizar,
// que ensina o app (ADR-017).

// Mesmo limite do backend (TAMANHO_MAXIMO_UPLOAD_MB no main.py, ADR-031):
// conferido no navegador ANTES de enviar, para não mandar 5 MB à toa
const LIMITE_UPLOAD_MB = 5;
const LIMITE_UPLOAD_BYTES = LIMITE_UPLOAD_MB * 1024 * 1024;

const NOME_DO_MES_MINUSCULO = new Intl.DateTimeFormat('pt-BR', { month: 'long' });

function dataBr(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

document.addEventListener('alpine:init', () => {
  Alpine.data('importar', () => mesclarComponente(seletorCategoria(), {
    passo: 'escolher',        // 'escolher' | 'previa' | 'categorizar'
    arquivo: null,            // File guardado para a prévia e para a importação
    erroArquivo: '',
    enviando: false,
    previa: null,             // resposta do POST com simular=true
    // 422: vencimento não detectado -> o usuário informa o mês
    pedirMes: false,
    mesInformado: null,
    anoInformado: null,
    competenciaInformada: null,
    pendentesJaImportada: null, // N = 0: quantos dessa fatura ainda estão sem categoria
    // Passo 3
    itens: [],                // GET /lancamentos?origem=fatura da competência
    carregandoLista: false,
    erroLista: '',
    itemAberto: null,         // id com o seletor compacto aberto
    ocupado: null,            // id sendo categorizado
    aceitandoTodas: false,
    errosItem: {},            // id -> mensagem da última falha
    mensagem: '',
    sequencia: 0,

    init() {
      this.$watch('$store.app.telaAtiva', (tela) => {
        if (tela === 'importar') this.aoAbrir();
      });
      if (this.$store.app.telaAtiva === 'importar') this.aoAbrir();
    },

    // Volta à tela: retoma a categorização em andamento (só em memória)
    aoAbrir() {
      if (this.$store.app.importacaoEmAndamento) {
        this.passo = 'categorizar';
        this.itemAberto = null;
        this.carregarLista();
      } else if (this.passo === 'categorizar') {
        this.recomecar();
      }
    },

    recomecar() {
      this.$store.app.importacaoEmAndamento = null;
      this.passo = 'escolher';
      this.arquivo = null;
      this.erroArquivo = '';
      this.previa = null;
      this.pedirMes = false;
      this.competenciaInformada = null;
      this.pendentesJaImportada = null;
      this.itens = [];
      this.erroLista = '';
      this.errosItem = {};
      this.mensagem = '';
      this.itemAberto = null;
    },

    // ---------- Passo 1: escolher o PDF ----------
    selecionarArquivo(evento) {
      const arquivo = evento.target.files?.[0];
      evento.target.value = ''; // permite escolher o mesmo arquivo de novo
      if (!arquivo) return;
      this.erroArquivo = '';
      if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
        this.erroArquivo = 'Escolha o PDF da fatura (arquivo .pdf).';
        return;
      }
      if (arquivo.size > LIMITE_UPLOAD_BYTES) {
        const mb = (arquivo.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        this.erroArquivo = `O arquivo tem ${mb} MB; o limite é ${LIMITE_UPLOAD_MB} MB.`;
        return;
      }
      this.arquivo = arquivo;
      this.competenciaInformada = null;
      this.gerarPrevia();
    },

    // ---------- Passo 2: prévia (nada é gravado) ----------
    async gerarPrevia() {
      this.enviando = true;
      this.erroArquivo = '';
      this.pedirMes = false;
      this.pendentesJaImportada = null;
      try {
        this.previa = await api.importarFatura(this.arquivo, { ...this.competenciaInformada, simular: true });
        this.passo = 'previa';
        if (this.quantidadeNovos === 0) this.contarPendentes();
      } catch (erro) {
        if (erro.status === 422 && erro.dados?.pedir_do_usuario) {
          // Vencimento não detectado: pergunta o mês (ADR-009)
          this.previa = null;
          this.pedirMes = true;
          this.mesInformado = this.$store.app.mes;
          this.anoInformado = this.$store.app.ano;
          this.passo = 'previa';
        } else {
          this.erroArquivo = api.mensagemDeErro(erro);
          this.passo = 'escolher';
        }
      } finally {
        this.enviando = false;
      }
    },
    confirmarMes() {
      this.competenciaInformada = { mes: Number(this.mesInformado), ano: Number(this.anoInformado) };
      this.gerarPrevia();
    },
    get opcoesMes() {
      return Array.from({ length: 12 }, (_, i) => ({ valor: i + 1, nome: formatar.mes(i + 1, 2000).split(' ')[0] }));
    },
    get opcoesAno() {
      const ano = this.$store.app.ano;
      return [ano - 1, ano, ano + 1];
    },

    get novos() {
      return this.previa ? this.previa.lancamentos.filter((l) => l.status === 'inserido') : [];
    },
    get jaImportados() {
      return this.previa ? this.previa.lancamentos.filter((l) => l.status === 'ignorado_duplicata') : [];
    },
    get quantidadeNovos() {
      return this.previa ? this.previa.inseridos : 0;
    },
    get rotuloMesCompetencia() {
      const c = this.previa?.competencia;
      return c ? formatar.mes(c.mes, c.ano) : '';
    },
    // "Vencimento 10/10/2026 · compras de setembro · entra em Outubro 2026".
    // "compras de <mês anterior>" é aproximação: a fatura fecha por volta do
    // dia 27, então parte das compras é do fim do mês antes desse (ADR-032)
    get textoCompetencia() {
      const c = this.previa.competencia;
      const partes = [];
      if (c.vencimento) {
        const [ano, mes] = c.vencimento.split('-').map(Number);
        partes.push(`Vencimento ${dataBr(c.vencimento)}`);
        partes.push(`compras de ${NOME_DO_MES_MINUSCULO.format(new Date(ano, mes - 2, 1))}`);
      }
      partes.push(`entra em ${formatar.mes(c.mes, c.ano)}`);
      const texto = partes.join(' · ');
      const frase = texto.charAt(0).toUpperCase() + texto.slice(1);
      return c.fonte === 'formulario' ? `${frase} (mês informado)` : frase;
    },
    get textoTotal() {
      const p = this.previa;
      const total = `Total ${formatar.dinheiro(p.total_despesas)}`;
      if (p.total_confere === true) return `${total} · confere com a fatura`;
      if (p.total_confere === false) {
        return `${total} · não confere com a fatura (${formatar.dinheiro(p.total_fatura_pdf)}): confira antes de importar`;
      }
      return `${total} · não deu para conferir com a fatura`;
    },
    get textoBotaoImportar() {
      if (this.enviando) return 'Importando…';
      const n = this.quantidadeNovos;
      return n === 1 ? 'Importar 1 lançamento' : `Importar ${n} lançamentos`;
    },

    // N = 0: a fatura já foi importada; ainda falta categorizar algum?
    async contarPendentes() {
      const { mes, ano } = this.previa.competencia;
      try {
        const lista = await api.lancamentos(mes, ano, { origem: 'fatura' });
        this.pendentesJaImportada = lista.filter((l) => l.subcategoria_id === null).length;
      } catch {
        this.pendentesJaImportada = null; // só um atalho; sem ele, o Histórico resolve
      }
    },

    // Só este botão grava
    async importar() {
      if (this.enviando || this.quantidadeNovos === 0) return;
      this.enviando = true;
      this.erroArquivo = '';
      try {
        const resposta = await api.importarFatura(this.arquivo, { ...this.competenciaInformada, simular: false });
        this.$store.app.revisao++;
        const n = resposta.inseridos;
        this.$store.app.mostrarAviso(n === 1 ? '1 lançamento importado' : `${n} lançamentos importados`, null, 3000);
        this.iniciarCategorizacao(resposta.competencia);
      } catch (erro) {
        this.erroArquivo = api.mensagemDeErro(erro);
      } finally {
        this.enviando = false;
      }
    },

    iniciarCategorizacao(competencia) {
      const { mes, ano, vencimento } = competencia;
      this.$store.app.importacaoEmAndamento = { mes, ano, vencimento };
      this.passo = 'categorizar';
      this.itens = [];
      this.errosItem = {};
      this.mensagem = '';
      this.itemAberto = null;
      this.carregarLista();
    },

    irParaHistorico() {
      const { mes, ano } = this.previa.competencia;
      this.$store.app.trocarMes(mes, ano);
      this.$store.app.mostrarTela('historico');
    },

    // ---------- Passo 3: categorizar ----------
    get competencia() {
      return this.$store.app.importacaoEmAndamento;
    },
    get rotuloCompetencia() {
      return this.competencia ? formatar.mes(this.competencia.mes, this.competencia.ano) : '';
    },
    async carregarLista() {
      const c = this.competencia;
      if (!c) return;
      const minhaVez = ++this.sequencia;
      this.carregandoLista = true;
      this.erroLista = '';
      try {
        // Uma requisição dá a lista E a barra: o filtro "sem categoria" é o
        // mesmo do sem_categoria=true, feito aqui (ADR-032)
        const lista = await api.lancamentos(c.mes, c.ano, { origem: 'fatura' });
        if (minhaVez !== this.sequencia) return;
        this.itens = lista;
      } catch (erro) {
        if (minhaVez !== this.sequencia) return;
        this.erroLista = api.mensagemDeErro(erro);
      } finally {
        if (minhaVez === this.sequencia) this.carregandoLista = false;
      }
    },
    get total() {
      return this.itens.length;
    },
    get pendentes() {
      return this.itens.filter((l) => l.subcategoria_id === null);
    },
    get categorizados() {
      return this.total - this.pendentes.length;
    },
    get sugeridos() {
      return this.pendentes.filter((l) => l.subcategoria_sugerida);
    },
    get concluido() {
      return this.total > 0 && this.pendentes.length === 0;
    },
    get textoBarra() {
      return `${this.categorizados} de ${this.total} categorizados`;
    },
    get percentual() {
      return this.total ? Math.floor((this.categorizados / this.total) * 100) : 0;
    },
    get textoAceitarTodas() {
      if (this.aceitandoTodas) return 'Aceitando…';
      const n = this.sugeridos.length;
      return n === 1 ? 'Aceitar 1 sugestão' : `Aceitar ${n} sugestões`;
    },
    // O parser grava "LOJA X - Parcela 5/6"; a linha de baixo já diz a parcela,
    // então a descrição aparece sem o sufixo (só exibição)
    descricaoExibida(l) {
      return l.parcela_total ? l.descricao.replace(/\s*-\s*Parcela\s+\d+\/\d+\s*$/, '') : l.descricao;
    },
    // "Parcela 5/6 · falta 1" (só exibição: quantas parcelas ainda vêm)
    textoParcela(l) {
      if (!l.parcela_total) return '';
      const faltam = l.parcela_total - l.parcela_atual;
      const resto = faltam === 0 ? 'última' : faltam === 1 ? 'falta 1' : `faltam ${faltam}`;
      return `Parcela ${l.parcela_atual}/${l.parcela_total} · ${resto}`;
    },

    // Seletor compacto: um aberto por vez; o estado (macroId, subId, criação)
    // é o do seletorCategoria, zerado ao abrir em outro item
    abrirSeletor(l) {
      this.itemAberto = l.id;
      this.macroId = l.subcategoria_sugerida?.categoria_macro_id ?? null;
      this.subId = null;
      this.mensagemSub = '';
      this.fecharCriacao();
    },
    fecharSeletor() {
      this.itemAberto = null;
      this.fecharCriacao();
    },
    // Gancho do seletorCategoria: escolher (ou criar) a sub já categoriza
    depoisDeEscolherSub(subId) {
      const item = this.itens.find((l) => l.id === this.itemAberto);
      if (item) this.categorizar(item, subId);
    },
    aceitar(l) {
      return this.categorizar(l, l.subcategoria_sugerida.id);
    },

    async categorizar(l, subId) {
      if (this.ocupado || this.aceitandoTodas) return;
      this.ocupado = l.id;
      this.mensagem = '';
      delete this.errosItem[l.id];
      try {
        await api.categorizar(l.id, subId); // ensina (ADR-017)
        this.itemAberto = null;
        this.$store.app.revisao++;
        // Recarrega: itens iguais ganham a sugestão que acabou de ser aprendida
        await this.carregarLista();
      } catch (erro) {
        this.errosItem = { ...this.errosItem, [l.id]: api.mensagemDeErro(erro) };
      } finally {
        this.ocupado = null;
      }
    },

    // Em SEQUÊNCIA (uma requisição por vez, como nos tetos, ADR-029)
    async aceitarTodas() {
      if (this.aceitandoTodas || this.ocupado) return;
      const alvo = [...this.sugeridos];
      if (alvo.length === 0) return;
      this.aceitandoTodas = true;
      this.mensagem = '';
      this.itemAberto = null;
      let aceitas = 0;
      const erros = { ...this.errosItem };
      for (const l of alvo) {
        try {
          await api.categorizar(l.id, l.subcategoria_sugerida.id);
          delete erros[l.id];
          aceitas++;
        } catch (erro) {
          erros[l.id] = api.mensagemDeErro(erro);
        }
      }
      this.errosItem = erros;
      const falhas = alvo.length - aceitas;
      if (falhas === 0) {
        this.mensagem = aceitas === 1 ? '1 sugestão aceita.' : `${aceitas} sugestões aceitas.`;
      } else {
        this.mensagem = `${aceitas} de ${alvo.length} sugestões aceitas. `
          + `${falhas === 1 ? '1 falhou' : `${falhas} falharam`}: confira o item marcado e tente de novo.`;
      }
      if (aceitas > 0) {
        this.$store.app.revisao++;
        await this.carregarLista();
      }
      this.aceitandoTodas = false;
    },

    // Dashboard do mês da COMPETÊNCIA importada. "Terminar depois" mantém a
    // categorização em andamento (voltar à tela retoma); "Ver no Dashboard"
    // (tudo categorizado) encerra.
    irParaDashboard({ encerrar }) {
      const { mes, ano } = this.competencia;
      if (encerrar) this.recomecar();
      this.$store.app.trocarMes(mes, ano);
      this.$store.app.mostrarTela('dashboard');
    },
  }));
});
