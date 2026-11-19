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

// 9 dígitos = até R$ 9.999.999,99
const MAXIMO_DIGITOS_VALOR = 9;
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

function mensagemDeErro(erro) {
  return erro instanceof TypeError
    ? 'Não foi possível conectar à API. Tente de novo.'
    : erro.message;
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

    init() {
      this.$watch('$store.app.telaAtiva', (tela) => {
        if (tela === 'registrar') this.abrir();
      });
      if (this.$store.app.telaAtiva === 'registrar') this.abrir();
    },

    // Formulário limpo a cada abertura + foco no valor.
    // No celular, focus() fora do toque pode não abrir o teclado (a verificar, ADR-028).
    abrir() {
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
      this.$nextTick(() => {
        this.mostrarValor();
        focarQuandoVisivel(this.$refs.valor);
      });
    },

    atualizarDatas() {
      this.hojeIso = isoDiasAtras(0);
      this.ontemIso = isoDiasAtras(1);
      this.minimoIso = isoDiasAtras(DIAS_RETROATIVO_MAXIMO);
    },

    // ---------- Valor: máscara de centavos (decisão D) ----------
    // Só o evento input: no teclado virtual do Android o keydown chega com
    // keyCode 229, sem a tecla real. A cada mudança, os dígitos do campo viram
    // o novo valor — cobre teclado físico, virtual, colar e apagar.
    aoDigitarValor(evento) {
      const digitos = evento.target.value
        .replace(/\D/g, '')
        .replace(/^0+/, '')
        .slice(0, MAXIMO_DIGITOS_VALOR);
      this.centavos = digitos ? Number(digitos) : 0;
      this.mostrarValor();
    },
    // Escreve direto no campo: se os centavos não mudarem (ex.: digitou uma
    // letra), o Alpine não re-renderizaria e a letra ficaria lá
    mostrarValor() {
      const campo = this.$refs.valor;
      campo.value = this.centavos > 0 ? formatar.dinheiro(this.centavos / 100) : '';
      this.cursorNoFim();
    },
    cursorNoFim() {
      const campo = this.$refs.valor;
      const fim = campo.value.length;
      // Alguns navegadores só aceitam setSelectionRange com o campo focado
      try { campo.setSelectionRange(fim, fim); } catch { /* sem efeito */ }
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
          this.erroCriar = mensagemDeErro(erro);
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
        this.erroCriar = mensagemDeErro(erro);
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
      if (this.opcaoData === 'hoje') return this.hojeIso;
      if (this.opcaoData === 'ontem') return this.ontemIso;
      return this.dataOutra;
    },
    // Strings ISO "AAAA-MM-DD" comparam certo em ordem alfabética
    dataNoIntervalo(data) {
      return Boolean(data) && data >= this.minimoIso && data <= this.hojeIso;
    },

    // ---------- Salvar (decisões A e C) ----------
    get faltando() {
      if (this.centavos <= 0) return 'Informe o valor';
      if (!this.subSelecionada) return 'Escolha a subcategoria';
      if (!this.dataNoIntervalo(this.dataEscolhida)) return 'Escolha uma data dos últimos 90 dias';
      return '';
    },
    get podeSalvar() {
      return !this.faltando && !this.enviando;
    },

    async salvar() {
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
        this.erro = mensagemDeErro(erro);
      } finally {
        this.enviando = false;
      }
    },
  }));
});
