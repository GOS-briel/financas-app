// Tela Tetos (ADR-029): edita os tetos do mês do store em lote.
// Herança (ADR-013) e upsert/DELETE (ADR-014) são do backend; o gasto de
// referência vem pronto do /dashboard (o frontend exibe, não recalcula).

// Valor da API (reais ou null) -> centavos inteiros (ou null = sem teto)
function paraCentavos(valor) {
  return valor === null ? null : Math.round(valor * 100);
}

document.addEventListener('alpine:init', () => {
  Alpine.data('tetos', () => ({
    // Uma por macro, na ordem do GET /tetos (ADR-005):
    // { id, nome, original: { valor, herdado, origemMes, origemAno },
    //   editado: centavos | null (null = sem alteração), apagado, voltarAHerdar, erro }
    linhas: [],
    gastos: {},           // macroId -> gasto do mês (do /dashboard)
    mesCarregado: null,   // { mes, ano } das linhas exibidas
    carregando: false,
    erro: false,
    salvando: false,
    mensagem: '',
    sequencia: 0,         // só a busca mais recente é aplicada (como no Dashboard)

    init() {
      // Guarda de navegação do store (ADR-029): conta as alterações desta tela
      this.$store.app.alteracoesNaoSalvas = () => this.quantidadeAlterada;

      this.$watch('$store.app.telaAtiva', (tela) => {
        if (tela === 'tetos') this.carregar();
      });
      this.$watch('`${$store.app.ano}-${$store.app.mes}`', () => {
        if (this.$store.app.telaAtiva === 'tetos') this.carregar();
      });
      if (this.$store.app.telaAtiva === 'tetos') this.carregar();
    },

    async carregar() {
      const store = this.$store.app;
      const { mes, ano } = store;
      const minhaVez = ++this.sequencia;
      this.carregando = true;
      this.erro = false;
      try {
        const [lista, dashboard] = await Promise.all([api.tetos(mes, ano), api.dashboard(mes, ano)]);
        if (minhaVez !== this.sequencia) return;
        store.tetos = lista;
        this.gastos = Object.fromEntries(dashboard.categorias
          .filter((c) => c.categoria_macro)
          .map((c) => [c.categoria_macro.id, c.gasto]));
        // Mesmo mês (ex.: recarga depois de salvar): preserva o que não foi salvo
        const mesmoMes = this.mesCarregado?.mes === mes && this.mesCarregado?.ano === ano;
        this.aplicarTetos(lista, mesmoMes);
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

    aplicarTetos(lista, manterEdicoes) {
      const anteriores = Object.fromEntries(this.linhas.map((l) => [l.id, l]));
      this.linhas = lista.map((t) => {
        const antes = manterEdicoes ? anteriores[t.categoria_macro.id] : null;
        const original = {
          valor: paraCentavos(t.valor),
          herdado: t.herdado,
          origemMes: t.origem_mes,
          origemAno: t.origem_ano,
        };
        const definido = original.valor !== null && !original.herdado;
        return {
          id: t.categoria_macro.id,
          nome: t.categoria_macro.nome,
          original,
          editado: antes?.editado ?? null,
          apagado: false, // apagou tudo e ainda está no campo: mostra vazio
          // Só faz sentido enquanto o teto continuar definido neste mês
          voltarAHerdar: Boolean(antes?.voltarAHerdar) && definido,
          erro: antes?.erro ?? '',
        };
      });
    },

    // ---------- Navegação de mês (store compartilhado + guarda) ----------
    get rotuloMes() {
      return formatar.mes(this.$store.app.mes, this.$store.app.ano);
    },
    irParaMes(deslocamento) {
      const store = this.$store.app;
      // Normaliza aqui também: a navegação pendente guarda o mês já resolvido
      const destino = new Date(store.ano, store.mes - 1 + deslocamento, 1);
      const mes = destino.getMonth() + 1;
      const ano = destino.getFullYear();
      if (this.quantidadeAlterada > 0) {
        store.navegacaoPendente = { tipo: 'mes', mes, ano };
        return;
      }
      store.trocarMes(mes, ano);
    },
    get textoPendentes() {
      const n = this.quantidadeAlterada;
      return n === 1 ? '1 alteração não salva' : `${n} alterações não salvas`;
    },

    // ---------- Estados ----------
    get primeiraCarga() {
      return this.linhas.length === 0 && this.carregando;
    },
    get atualizando() {
      return this.linhas.length > 0 && this.carregando;
    },

    // ---------- Linhas ----------
    alterada(l) {
      return l.voltarAHerdar || (l.editado !== null && l.editado !== l.original.valor);
    },
    get quantidadeAlterada() {
      return this.linhas.filter((l) => this.alterada(l)).length;
    },
    podeVoltarAHerdar(l) {
      return l.original.valor !== null && !l.original.herdado && !l.voltarAHerdar;
    },
    classeLinha(l) {
      return {
        'teto--herdado': l.original.herdado && !this.alterada(l),
        'teto--alterado': this.alterada(l),
        'teto--erro': Boolean(l.erro),
      };
    },
    textoCampo(l) {
      if (l.apagado) return '';
      const centavos = l.editado ?? l.original.valor;
      return centavos === null ? '' : formatar.dinheiro(centavos / 100);
    },
    // "herdado de Outubro 2026 · não gastar nada · gasto R$ 12,00"
    contexto(l) {
      const o = l.original;
      const partes = [];
      if (o.valor === null) partes.push('sem teto');
      else if (o.herdado) partes.push(`herdado de ${formatar.mes(o.origemMes, o.origemAno)}`);
      else partes.push('definido neste mês');
      if (o.valor === 0) partes.push('não gastar nada'); // 0 ≠ sem teto (ADR-022)
      if (l.id in this.gastos) partes.push(`gasto ${formatar.dinheiro(this.gastos[l.id])}`);
      return partes.join(' · ');
    },

    // Campo vazio = sem alteração; R$ 0 só digitando 0 (ADR-029)
    aoDigitar(l, evento) {
      l.erro = '';
      l.editado = mascaraCentavos.ler(evento, { permitirZero: true });
      l.apagado = l.editado === null;
      mascaraCentavos.escrever(evento.target, l.editado);
    },
    // Ao sair: vazio ou igual ao original volta a mostrar o original
    aoSair(l, evento) {
      if (l.editado === l.original.valor) l.editado = null;
      l.apagado = false;
      if (l.editado === null) mascaraCentavos.escrever(evento.target, l.original.valor);
    },
    voltarAHerdar(l) {
      l.editado = null;
      l.apagado = false;
      l.voltarAHerdar = true;
      l.erro = '';
    },
    desfazerVoltarAHerdar(l) {
      l.voltarAHerdar = false;
    },

    // ---------- Salvar / descartar ----------
    get textoBotao() {
      if (this.salvando) return 'Salvando…';
      const n = this.quantidadeAlterada;
      if (n === 0) return 'Salvar tetos';
      return `Salvar tetos (${n} ${n === 1 ? 'alterado' : 'alterados'})`;
    },

    descartar() {
      for (const l of this.linhas) {
        l.editado = null;
        l.apagado = false;
        l.voltarAHerdar = false;
        l.erro = '';
      }
      this.mensagem = '';
      this.$store.app.continuarNavegacao(); // sem navegação pendente, não faz nada
    },

    // Em SEQUÊNCIA, não em paralelo: o SQLite serializa escritas e PUTs
    // simultâneos poderiam falhar com "database is locked" (falha artificial).
    async salvar() {
      if (this.salvando || this.quantidadeAlterada === 0 || !this.mesCarregado) return;
      const store = this.$store.app;
      const { mes, ano } = this.mesCarregado;
      const alvo = this.linhas.filter((l) => this.alterada(l));
      this.salvando = true;
      this.mensagem = '';
      let salvas = 0;
      for (const l of alvo) {
        l.erro = '';
        try {
          if (l.voltarAHerdar) {
            await api.apagarTeto(l.id, mes, ano);
            l.voltarAHerdar = false; // o original certo (herança) vem na recarga
          } else {
            await api.definirTeto(l.id, mes, ano, l.editado / 100);
            l.original = { valor: l.editado, herdado: false, origemMes: mes, origemAno: ano };
            l.editado = null;
          }
          salvas++;
        } catch (erro) {
          // Fica marcada como alterada, com o valor digitado e o motivo
          l.erro = api.mensagemDeErro(erro);
        }
      }
      const falhas = alvo.length - salvas;
      if (falhas === 0) {
        this.mensagem = salvas === 1 ? '1 teto salvo.' : `${salvas} tetos salvos.`;
      } else {
        this.mensagem = `${salvas} de ${alvo.length} tetos salvos. `
          + `${falhas === 1 ? '1 não salvou' : `${falhas} não salvaram`}: confira a linha marcada e tente de novo.`;
      }
      if (salvas > 0) {
        store.revisao++; // o Dashboard observa (ADR-028)
        await this.carregar(); // tetos do store + herança atualizada; preserva as falhas
      }
      this.salvando = false;
      if (falhas === 0) store.continuarNavegacao();
    },
  }));
});
