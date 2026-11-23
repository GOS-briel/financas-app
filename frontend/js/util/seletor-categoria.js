// Seletor de categoria compartilhado (Registrar e Importar — ADRs 028 e 032):
// macro -> subcategoria, com criação inline e o 409 da ADR-012.
// Só a LÓGICA é compartilhada; cada tela tem o seu markup (sem build, o Alpine
// não tem componente de template). Script comum: expõe funções em window.
(function () {
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

  // Limite do backend (main.py)
  const MAXIMO_NOME_SUBCATEGORIA = 50;

  // Comparação de nomes como a ADR-012 (o backend usa NFC + casefold;
  // toLowerCase dá o mesmo resultado para nomes em português)
  function comparavel(nome) {
    return nome.normalize('NFC').toLowerCase();
  }

  // O x-show do Alpine só exibe o elemento no quadro seguinte (requestAnimationFrame,
  // ou setTimeout com a aba oculta) — DEPOIS do $nextTick. Um focus() num elemento
  // ainda escondido falha em silêncio. Espera com o MESMO agendador do Alpine:
  // o nosso callback entra na fila depois do que exibe o elemento (ADR-028 G).
  function focarQuandoVisivel(elemento, tentativas = 10) {
    if (!elemento) return;
    if (elemento.getClientRects().length > 0) {
      elemento.focus();
      return;
    }
    if (tentativas === 0) return;
    const proximo = document.visibilityState === 'visible' ? requestAnimationFrame : setTimeout;
    proximo(() => focarQuandoVisivel(elemento, tentativas - 1));
  }

  // Junta objetos de componente COPIANDO OS DESCRITORES: um {...spread}
  // avaliaria os getters (ex.: subSelecionada) uma vez só, e eles parariam de reagir
  function mesclarComponente(...partes) {
    const componente = {};
    for (const parte of partes) {
      Object.defineProperties(componente, Object.getOwnPropertyDescriptors(parte));
    }
    return componente;
  }

  // Estado e ações do seletor. Quem usa pode definir depoisDeEscolherSub(id)
  // (a Importar categoriza na hora); o Registrar não define e só seleciona.
  function seletorCategoria() {
    return {
      macroId: null,
      subId: null,
      // Criação inline de subcategoria (ADR-028 F)
      criando: false,
      nomeNovo: '',
      criandoEnviando: false,
      erroCriar: '',
      mensagemSub: '',

      get macros() {
        return this.$store.app.categorias;
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
        if (typeof this.depoisDeEscolherSub === 'function') this.depoisDeEscolherSub(id);
      },

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
    };
  }

  window.seletorCategoria = seletorCategoria;
  window.mesclarComponente = mesclarComponente;
  window.focarQuandoVisivel = focarQuandoVisivel;
})();
