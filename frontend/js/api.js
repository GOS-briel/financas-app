// Cliente da API Flask (ADR-026): fetch nativo, URL e tratamento de erro num lugar só.
//
// Script comum (não módulo ES): sem build, é o jeito de `api` ficar global —
// inclusive no console do navegador (await api.categorias()).
(function () {
  // Futuro: variável de ambiente/config quando o backend for hospedado
  const BASE_URL = 'http://127.0.0.1:5000';

  async function requisitar(metodo, caminho, corpo) {
    const opcoes = { method: metodo, headers: {} };
    if (corpo instanceof FormData) {
      // Upload: o navegador monta o Content-Type com o boundary do multipart
      opcoes.body = corpo;
    } else if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }

    const resposta = await fetch(BASE_URL + caminho, opcoes);
    if (resposta.status === 204) {
      return null; // DELETE bem-sucedido: sem corpo
    }
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      // O backend devolve {"erro": "..."}; a mensagem real vai junto do status
      const erro = new Error(`${resposta.status}: ${dados?.erro ?? resposta.statusText}`);
      erro.status = resposta.status;
      erro.dados = dados;
      throw erro;
    }
    return dados;
  }

  const get = (caminho) => requisitar('GET', caminho);
  const post = (caminho, dados) => requisitar('POST', caminho, dados);
  const put = (caminho, dados) => requisitar('PUT', caminho, dados);
  const del = (caminho) => requisitar('DELETE', caminho); // "delete" é palavra reservada

  // Query string sem os parâmetros vazios (null, undefined, '')
  function consulta(parametros) {
    const busca = new URLSearchParams();
    for (const [chave, valor] of Object.entries(parametros)) {
      if (valor !== null && valor !== undefined && valor !== '') {
        busca.append(chave, String(valor));
      }
    }
    return busca.toString();
  }

  window.api = {
    // Dashboard (ADRs 021-023)
    dashboard: (mes, ano) => get(`/dashboard?${consulta({ mes, ano })}`),

    // Categorias (ADRs 011-012)
    categorias: () => get('/categorias/macro'),
    criarSubcategoria: (nome, categoriaMacroId) =>
      post('/subcategorias', { nome, categoria_macro_id: categoriaMacroId }),
    renomearSubcategoria: (id, nome) => put(`/subcategorias/${id}`, { nome }),
    apagarSubcategoria: (id) => del(`/subcategorias/${id}`),

    // Tetos (ADRs 013-014)
    tetos: (mes, ano) => get(`/tetos?${consulta({ mes, ano })}`),
    definirTeto: (categoriaMacroId, mes, ano, valor) =>
      put('/tetos', { categoria_macro_id: categoriaMacroId, mes, ano, valor }),
    apagarTeto: (categoriaMacroId, mes, ano) =>
      del(`/tetos?${consulta({ categoria_macro_id: categoriaMacroId, mes, ano })}`),

    // Lançamentos (ADRs 015-020)
    // filtros: { categoria_macro_id, origem: 'manual' | 'fatura', sem_categoria: true }
    lancamentos: (mes, ano, filtros = {}) =>
      get(`/lancamentos?${consulta({
        mes,
        ano,
        categoria_macro_id: filtros.categoria_macro_id,
        origem: filtros.origem,
        sem_categoria: filtros.sem_categoria ? 'true' : null,
      })}`),
    criarLancamento: (dados) => post('/lancamentos', dados),
    atualizarLancamento: (id, dados) => put(`/lancamentos/${id}`, dados),
    apagarLancamento: (id) => del(`/lancamentos/${id}`),
    // subcategoriaId null = descategorizar (ADR-019)
    categorizar: (id, subcategoriaId) =>
      post(`/lancamentos/${id}/categorizar`, { subcategoria_id: subcategoriaId }),

    // Importação da fatura (ADRs 009-010): multipart; mes/ano opcionais
    importarFatura: (arquivo, mes, ano) => {
      const formulario = new FormData();
      formulario.append('arquivo', arquivo);
      if (mes && ano) {
        formulario.append('mes', String(mes));
        formulario.append('ano', String(ano));
      }
      return post('/fatura/importar', formulario);
    },
  };
})();
