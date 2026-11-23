// Tela Registrar gasto (ADR-028). Meta: valor → macro → sub → salvar em < 10s.
// Estado local da tela (ADR-026); categorias vêm do store compartilhado.

// Seletor de categoria (grade, pills, criação e 409): js/util/seletor-categoria.js

// Mesma janela do backend (ADR-015): hoje − 90 entra, data futura nunca
const DIAS_RETROATIVO_MAXIMO = 90;

// Data local de N dias atrás, como "AAAA-MM-DD" (nunca toISOString: é UTC)
function isoDiasAtras(dias) {
  const hoje = new Date();
  return formatar.dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias));
}

document.addEventListener('alpine:init', () => {
  Alpine.data('registrar', () => mesclarComponente(seletorCategoria(), {
    centavos: 0,          // valor como inteiro: 3250 = R$ 32,50 (sem erro de float)
    descricao: '',
    nota: '',
    mostrarNota: false,
    opcaoData: 'hoje',    // 'hoje' | 'ontem' | 'outra'
    dataOutra: '',
    // Calculadas ao abrir a tela (o dia pode virar com o app aberto)
    hojeIso: '',
    ontemIso: '',
    minimoIso: '',
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

    // ---------- Categoria (decisão B): lógica em seletorCategoria() ----------
    get semCategorias() {
      return this.macros.length === 0;
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
