// Tela Registrar gasto (ADR-028). Meta: valor → macro → sub → salvar em < 10s.
// Estado local da tela (ADR-026); categorias vêm do store compartilhado.

// Ícones Tabler das macro, pelos ids canônicos da ADR-005
const ICONE_DA_MACRO = {
  1: 'ti-tools-kitchen-2', // Alimentação
  2: 'ti-confetti',        // Lazer
  3: 'ti-shopping-bag',    // Compras
  4: 'ti-heartbeat',       // Saúde
  5: 'ti-school',          // Educação
  6: 'ti-ball-football',   // Esporte
  7: 'ti-car',             // Transporte
  8: 'ti-dots',            // Outros
};

// Mesma janela do backend (ADR-015): hoje − 90 entra, data futura nunca
const DIAS_RETROATIVO_MAXIMO = 90;
// Limites do backend (main.py)
const MAXIMO_NOME_SUBCATEGORIA = 50;

// Comparação de nomes como a ADR-012 (o backend usa NFC + casefold;
// toLowerCase dá o mesmo resultado para nomes em português)
function comparavel(nome) {
  return nome.normalize('NFC').toLowerCase();
}

// Data local de N dias atrás, como "AAAA-MM-DD" (nunca toISOString: é UTC)
function isoDiasAtras(dias) {
  const hoje = new Date();
  return formatar.dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias));
}

// O x-show do Alpine só exibe o elemento no quadro seguinte (requestAnimationFrame,
// ou setTimeout com a aba oculta) — DEPOIS do $nextTick. Um focus() num elemento
// ainda escondido falha em silêncio. Espera com o MESMO agendador do Alpine:
// o nosso callback entra na fila depois do que exibe o elemento.
function focarQuandoVisivel(elemento, tentativas = 10) {
  if (elemento.getClientRects().length > 0) {
    elemento.focus();
    return;
  }
  if (tentativas === 0) return;
  const proximo = document.visibilityState === 'visible' ? requestAnimationFrame : setTimeout;
  proximo(() => focarQuandoVisivel(elemento, tentativas - 1));
}

document.addEventListener('alpine:init', () => {
  Alpine.data('registrar', () => ({
    centavos: 0,          // valor como inteiro: 3250 = R$ 32,50 (sem erro de float)
    macroId: null,
    subId: null,
    descricao: '',
    nota: '',
    mostrarNota: false,
    opcaoData: 'hoje',    // 'hoje' | 'ontem' | 'outra'
    dataOutra: '',
    // Calculadas ao abrir a tela (o dia pode virar com o app aberto)
    hojeIso: '',
    ontemIso: '',
    minimoIso: '',
    // Criação inline de subcategoria (decisão F)
    criando: false,
    nomeNovo: '',
    criandoEnviando: false,
    erroCriar: '',
    mensagemSub: '',
    enviando: false,
    erro: '',
    // Modo edição (ADR-030): base do lançamento como está no banco, para
    // mandar só o que mudou. null = gasto novo.
    edicao: null,

    init() {
      // Chave única tela|lançamento: o + no meio de uma edição troca o
      // lançamento para null sem trocar de tela, e o formulário volta a "novo"
      this.$watch('`${$store.app.telaAtiva}|${$store.app.lancamentoEmEdicao?.id ?? "novo"}`', () => {
        if (this.$store.app.telaAtiva === 'registrar') this.abrir();
      });
      if (this.$store.app.telaAtiva === 'registrar') this.abrir();
    },

    get modoEdicao() {
      return this.edicao !== null;
    },
    // Importado da fatura: só subcategoria e nota mudam (ADR-016)
    get importado() {
      return this.edicao?.origem === 'fatura';
    },

    // Formulário limpo (ou preenchido, na edição) a cada abertura + foco no valor.
    // No celular, focus() fora do toque pode não abrir o teclado (a verificar, ADR-028).
    abrir() {
      this.edicao = null;
      this.centavos = 0;
      this.macroId = null;
      this.subId = null;
      this.descricao = '';
      this.nota = '';
      this.mostrarNota = false;
      this.opcaoData = 'hoje';
      this.dataOutra = '';
      this.atualizarDatas();
      this.fecharCriacao();
      this.mensagemSub = '';
      this.erro = '';
      const emEdicao = this.$store.app.lancamentoEmEdicao;
      if (emEdicao) this.preencher(emEdicao);
      this.$nextTick(() => {
        this.mostrarValor();
        // Importado: o valor está travado; não faz sentido focar nem abrir teclado
        if (!this.importado) focarQuandoVisivel(this.$refs.valor);
      });
    },

    preencher(l) {
      const centavos = Math.round(l.valor * 100);
      this.edicao = {
        id: l.id,
        origem: l.origem,
        data: l.data,
        descricao: l.descricao,
        centavos,
        subId: l.subcategoria_id,
        nota: l.nota ?? null,
      };
      this.centavos = centavos;
      this.macroId = l.categoria_macro_id;
      this.subId = l.subcategoria_id;
      this.descricao = l.descricao;
      this.nota = l.nota ?? '';
      this.mostrarNota = Boolean(l.nota);
      // A pill marcada é a que corresponde à data original
      if (l.data === this.hojeIso) this.opcaoData = 'hoje';
      else if (l.data === this.ontemIso) this.opcaoData = 'ontem';
      else {
        this.opcaoData = 'outra';
        this.dataOutra = l.data;
      }
    },

    cancelarEdicao() {
      this.$store.app.mostrarTela('historico');
    },

    atualizarDatas() {
      this.hojeIso = isoDiasAtras(0);
      this.ontemIso = isoDiasAtras(1);
      this.minimoIso = isoDiasAtras(DIAS_RETROATIVO_MAXIMO);
    },

    // ---------- Valor: máscara de centavos (decisão D, js/util/mascara.js) ----------
    // Aqui zero não existe: campo sem valor = 0 centavos = "Informe o valor"
    aoDigitarValor(evento) {
      this.centavos = mascaraCentavos.ler(evento) ?? 0;
      this.mostrarValor();
    },
    mostrarValor() {
      mascaraCentavos.escrever(this.$refs.valor, this.centavos > 0 ? this.centavos : null);
    },
    cursorNoFim() {
      mascaraCentavos.cursorNoFim(this.$refs.valor);
    },

    // ---------- Categoria (decisão B) ----------
    get macros() {
      return this.$store.app.categorias;
    },
    get semCategorias() {
      return this.macros.length === 0;
    },
    get macroSelecionada() {
      return this.macros.find((m) => m.id === this.macroId) ?? null;
    },
    get subcategorias() {
      return this.macroSelecionada?.subcategorias ?? [];
    },
    get subSelecionada() {
      return this.subcategorias.find((s) => s.id === this.subId) ?? null;
    },
    icone(macroId) {
      return ICONE_DA_MACRO[macroId] ?? 'ti-category';
    },
    escolherMacro(id) {
      if (this.macroId === id) return;
      this.macroId = id;
      this.subId = null;
      this.mensagemSub = '';
      this.fecharCriacao();
      // Macro sem subcategoria: abre direto a criação
      if (this.subcategorias.length === 0) this.abrirCriacao();
    },
    escolherSub(id) {
      this.subId = id;
      this.mensagemSub = '';
    },

    // ---------- Criação inline de subcategoria (decisão F) ----------
    abrirCriacao() {
      this.criando = true;
      this.nomeNovo = '';
      this.erroCriar = '';
      this.$nextTick(() => focarQuandoVisivel(this.$refs.novoNome));
    },
    fecharCriacao() {
      this.criando = false;
      this.nomeNovo = '';
      this.erroCriar = '';
    },
    async criarSub() {
      const nome = this.nomeNovo.trim();
      if (!nome) {
        this.erroCriar = 'Digite um nome.';
        return;
      }
      if (nome.length > MAXIMO_NOME_SUBCATEGORIA) {
        this.erroCriar = `Use no máximo ${MAXIMO_NOME_SUBCATEGORIA} caracteres.`;
        return;
      }
      if (this.criandoEnviando) return;
      const macroId = this.macroId;
      this.criandoEnviando = true;
      this.erroCriar = '';
      try {
        const criada = await api.criarSubcategoria(nome, macroId);
        await this.$store.app.recarregarCategorias();
        this.escolherSub(criada.id);
        this.mensagemSub = `“${criada.nome}” criada e selecionada.`;
        this.fecharCriacao();
      } catch (erro) {
        if (erro.status === 409) {
          await this.usarExistente(nome, macroId);
        } else {
          this.erroCriar = api.mensagemDeErro(erro);
        }
      } finally {
        this.criandoEnviando = false;
      }
    },
    // O 409 não devolve o id: recarrega e acha o nome na macro
    async usarExistente(nome, macroId) {
      try {
        await this.$store.app.recarregarCategorias();
      } catch (erro) {
        this.erroCriar = api.mensagemDeErro(erro);
        return;
      }
      const macro = this.macros.find((m) => m.id === macroId);
      const existente = macro?.subcategorias.find((s) => comparavel(s.nome) === comparavel(nome));
      if (!existente) {
        this.erroCriar = 'Já existe uma subcategoria com esse nome, mas não foi possível encontrá-la.';
        return;
      }
      this.escolherSub(existente.id);
      this.mensagemSub = `“${existente.nome}” já existia e foi selecionada.`;
      this.fecharCriacao();
    },

    // ---------- Data (decisão E) ----------
    escolherData(opcao) {
      this.opcaoData = opcao;
      if (opcao === 'outra') this.$nextTick(() => focarQuandoVisivel(this.$refs.dataOutra));
    },
    abrirNota() {
      this.mostrarNota = true;
      this.$nextTick(() => focarQuandoVisivel(this.$refs.nota));
    },
    get dataEscolhida() {
      if (this.importado) return this.edicao.data; // travada (ADR-016)
      if (this.opcaoData === 'hoje') return this.hojeIso;
      if (this.opcaoData === 'ontem') return this.ontemIso;
      return this.dataOutra;
    },
    // Strings ISO "AAAA-MM-DD" comparam certo em ordem alfabética
    dataNoIntervalo(data) {
      return Boolean(data) && data >= this.minimoIso && data <= this.hojeIso;
    },
    // Na edição, a janela de 90 dias só vale se a data MUDAR (ADR-015/016):
    // manter a data original de um gasto antigo é sempre aceito
    dataValida(data) {
      return this.dataNoIntervalo(data) || (this.modoEdicao && data === this.edicao.data);
    },
    get dataOriginalAntiga() {
      return this.modoEdicao && !this.importado && this.edicao.data < this.minimoIso;
    },
    get dataOriginalTexto() {
      if (!this.edicao) return '';
      const [ano, mes, dia] = this.edicao.data.split('-');
      return `${dia}/${mes}/${ano}`;
    },

    // ---------- Salvar (decisões A e C) ----------
    get faltando() {
      // Importado: valor e data vêm da fatura e não são validados aqui
      if (!this.importado && this.centavos <= 0) return 'Informe o valor';
      if (!this.subSelecionada) return 'Escolha a subcategoria';
      if (!this.importado && !this.dataValida(this.dataEscolhida)) return 'Escolha uma data dos últimos 90 dias';
      return '';
    },
    get podeSalvar() {
      return !this.faltando && !this.enviando;
    },
    get textoSalvar() {
      if (this.enviando) return 'Salvando…';
      return this.modoEdicao ? 'Salvar alterações' : 'Salvar gasto';
    },

    salvar() {
      return this.modoEdicao ? this.atualizar() : this.criar();
    },

    // ---------- Edição (ADR-030) ----------
    // Manual: um PUT com o que mudou (subcategoria em silêncio, ADR-017).
    // Importado: POST categorizar (ensina) e DEPOIS PUT da nota; se a nota
    // falhar, a categoria já salva vira a base e um novo Salvar manda só a nota.
    async atualizar() {
      if (!this.podeSalvar) return;
      const store = this.$store.app;
      const base = this.edicao;
      const sub = this.subSelecionada;
      const data = this.dataEscolhida;
      if (!this.importado) {
        this.atualizarDatas(); // confere com o relógio de agora
        if (!this.dataValida(data)) {
          this.erro = 'A data saiu do intervalo permitido (últimos 90 dias). Escolha de novo.';
          return;
        }
      }
      const nota = this.nota.trim() || null;
      const mudouSub = sub.id !== base.subId;
      const mudouNota = nota !== base.nota;
      const campos = {};
      if (!this.importado) {
        const descricao = this.descricao.trim() || sub.nome; // mesma regra do novo (ADR-028 A)
        if (data !== base.data) campos.data = data;
        if (this.centavos !== base.centavos) campos.valor = this.centavos / 100;
        if (descricao !== base.descricao) campos.descricao = descricao;
        if (mudouSub) campos.subcategoria_id = sub.id;
        if (mudouNota) campos.nota = nota;
      }
      const houveMudanca = this.importado ? (mudouSub || mudouNota) : Object.keys(campos).length > 0;
      if (!houveMudanca) {
        store.mostrarTela('historico'); // nada a gravar
        return;
      }

      this.enviando = true;
      this.erro = '';
      try {
        if (this.importado) {
          if (mudouSub) {
            await api.categorizar(base.id, sub.id);
            base.subId = sub.id; // salvo: um novo Salvar não repete o categorizar
            store.revisao++;
          }
          if (mudouNota) {
            try {
              await api.atualizarLancamento(base.id, { nota });
            } catch (erro) {
              if (!mudouSub) throw erro;
              this.erro = `Categoria salva, mas a nota não: ${api.mensagemDeErro(erro)}. Toque em Salvar de novo.`;
              return;
            }
            store.revisao++;
          }
        } else {
          await api.atualizarLancamento(base.id, campos);
          store.revisao++;
        }
        // Volta ao Histórico no mesmo mês; se a data mudou de mês, o item some daqui
        let texto = 'Gasto atualizado';
        if (data.slice(0, 7) !== base.data.slice(0, 7)) {
          const [ano, mes] = data.split('-').map(Number);
          texto += ` · agora em ${formatar.mes(mes, ano)}`;
        }
        store.mostrarTela('historico');
        store.mostrarAviso(texto, null, 3000);
      } catch (erro) {
        this.erro = api.mensagemDeErro(erro);
      } finally {
        this.enviando = false;
      }
    },

    // ---------- Novo gasto ----------
    async criar() {
      if (!this.podeSalvar) return;
      // Confere de novo com o relógio de agora (o dia pode ter virado)
      const dataAntes = this.dataEscolhida;
      this.atualizarDatas();
      if (!this.dataNoIntervalo(dataAntes)) {
        this.erro = 'A data saiu do intervalo permitido (últimos 90 dias). Escolha de novo.';
        return;
      }
      const sub = this.subSelecionada;
      const valor = this.centavos / 100;
      this.enviando = true;
      this.erro = '';
      try {
        const criado = await api.criarLancamento({
          data: dataAntes,
          // Decisão A: descrição vazia (ou só espaços) vira o nome da subcategoria
          descricao: this.descricao.trim() || sub.nome,
          valor,
          subcategoria_id: sub.id,
          nota: this.nota.trim() || null,
        });
        const store = this.$store.app;
        const [ano, mes] = dataAntes.split('-').map(Number);
        // Leva o Dashboard para o mês do gasto (ex.: "Outra data" no mês passado)
        if (mes !== store.mes || ano !== store.ano) store.trocarMes(mes, ano);
        store.mostrarTela('dashboard');
        store.mostrarAviso(`Gasto salvo · ${formatar.dinheiro(valor)} em ${sub.nome}`, criado.id);
      } catch (erro) {
        this.erro = api.mensagemDeErro(erro);
      } finally {
        this.enviando = false;
      }
    },
  }));
});
