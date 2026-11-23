# POST /fatura/importar sem o PDF real: o parser é simulado (Etapas 4 e 5.3, ADR-009/010;
# prévia, limite de upload e vencimento completo na 12.6a, ADR-031)
import io

import pytest

import main

CONTAR = "SELECT COUNT(*) FROM lancamentos"

EXTRAIDOS = [
    {"data": "08/05", "descricao": "LOJA A - Parcela 5/6", "valor": 66.66, "parcela_atual": 5, "parcela_total": 6},
    {"data": "12/09", "descricao": "LOJA B", "valor": 33.34, "parcela_atual": None, "parcela_total": None},
]


@pytest.fixture
def parser_simulado(mocker):
    """Substitui as 3 funções do parser no main; devolve os mocks para ajustar por teste."""
    return {
        "lancamentos": mocker.patch.object(main, "extrair_lancamentos", return_value=EXTRAIDOS),
        "vencimento": mocker.patch.object(main, "extrair_vencimento", return_value="2026-10-10"),
        "total": mocker.patch.object(main, "extrair_total_fatura", return_value=100.0),
    }


def _enviar(cliente, conteudo=b"%PDF-falso", nome="fatura.pdf", **campos):
    return cliente.post("/fatura/importar", data={"arquivo": (io.BytesIO(conteudo), nome), **campos},
                        content_type="multipart/form-data")


# Validação do upload ------------------------------------------------------------
def test_sem_arquivo_retorna_400(cliente_flask):
    """POST sem o campo 'arquivo' → 400 'nenhum arquivo enviado'."""
    resposta = cliente_flask.post("/fatura/importar")
    assert resposta.status_code == 400 and resposta.get_json() == {"erro": "nenhum arquivo enviado"}


def test_arquivo_sem_nome_retorna_400(cliente_flask):
    """Formulário enviado sem escolher arquivo (filename vazio) → 400."""
    assert _enviar(cliente_flask, nome="").status_code == 400


@pytest.mark.parametrize("nome", ["fatura.txt", "fatura.pdf.exe", "fatura"])
def test_extensao_diferente_de_pdf_retorna_400(cliente_flask, nome):
    """Só .pdf (sem diferenciar maiúsculas) é aceito."""
    resposta = _enviar(cliente_flask, nome=nome)
    assert resposta.status_code == 400 and resposta.get_json() == {"erro": "arquivo deve ser PDF"}


def test_extensao_pdf_maiuscula_e_aceita(cliente_flask, parser_simulado):
    """'FATURA.PDF' passa pela validação de extensão."""
    assert _enviar(cliente_flask, nome="FATURA.PDF").status_code == 200


def test_arquivo_que_nao_e_pdf_de_verdade_retorna_500_e_limpa_o_temporario(cliente_flask):
    """Texto com extensão .pdf quebra o parser real → 500, e o temporário é apagado (fixture vigia)."""
    resposta = _enviar(cliente_flask, conteudo=b"isto nao e um pdf")
    assert resposta.status_code == 500 and resposta.get_json() == {"erro": "falha ao processar fatura"}


# Competência --------------------------------------------------------------------
def test_competencia_do_pdf(cliente_flask, parser_simulado):
    """Sem mes/ano no formulário, usa o mês/ano do vencimento do PDF (fonte 'pdf'), com o
    vencimento completo (ADR-031); a gravação continua em AAAA-MM-01 (ADR-007)."""
    corpo = _enviar(cliente_flask).get_json()
    assert corpo["competencia"] == {"mes": 10, "ano": 2026, "fonte": "pdf", "vencimento": "2026-10-10"}
    assert {item["data"] for item in corpo["lancamentos"]} == {"2026-10-01"}


def test_formulario_tem_prioridade_sobre_o_pdf(cliente_flask, parser_simulado):
    """mes/ano do formulário vencem o PDF (fonte 'formulario'); o vencimento do PDF vai junto."""
    corpo = _enviar(cliente_flask, mes="9", ano="2026").get_json()
    assert corpo["competencia"] == {"mes": 9, "ano": 2026, "fonte": "formulario", "vencimento": "2026-10-10"}


def test_formulario_sem_vencimento_no_pdf_traz_vencimento_null(cliente_flask, parser_simulado):
    """A chave vencimento está sempre presente: null quando o PDF não tem (convenção da ADR-018)."""
    parser_simulado["vencimento"].return_value = None
    corpo = _enviar(cliente_flask, mes="9", ano="2026").get_json()
    assert corpo["competencia"] == {"mes": 9, "ano": 2026, "fonte": "formulario", "vencimento": None}


def test_competencia_de_vencimento_em_outro_mes(cliente_flask, parser_simulado):
    """Dia e mês não se confundem: vencimento 2026-11-05 é competência 11/2026."""
    parser_simulado["vencimento"].return_value = "2026-11-05"
    corpo = _enviar(cliente_flask).get_json()
    assert (corpo["competencia"]["mes"], corpo["competencia"]["ano"]) == (11, 2026)
    assert {item["data"] for item in corpo["lancamentos"]} == {"2026-11-01"}


@pytest.mark.parametrize(
    "campos",
    [{"mes": "13", "ano": "2026"}, {"mes": "10"}, {"ano": "2026"}, {"mes": "abc", "ano": "2026"}, {"mes": "10", "ano": "1999"}],
    ids=["mes-13", "so-mes", "so-ano", "mes-texto", "ano-1999"],
)
def test_mes_ano_invalidos_no_formulario_retornam_400(cliente_flask, parser_simulado, campos):
    """mes/ano incompletos ou fora do intervalo → 400 'mes/ano invalidos'."""
    resposta = _enviar(cliente_flask, **campos)
    assert resposta.status_code == 400 and resposta.get_json() == {"erro": "mes/ano invalidos"}


def test_sem_competencia_detectada_pede_ao_usuario(cliente_flask, parser_simulado, consultar):
    """PDF sem vencimento e sem mes/ano no formulário → 422 com pedir_do_usuario, nada gravado."""
    parser_simulado["vencimento"].return_value = None
    resposta = _enviar(cliente_flask)
    assert resposta.status_code == 422
    assert resposta.get_json() == {"erro": "nao foi possivel detectar o mes/ano", "pedir_do_usuario": True}
    assert consultar("SELECT COUNT(*) FROM lancamentos") == [(0,)]


def test_sem_competencia_no_pdf_mas_com_formulario_funciona(cliente_flask, parser_simulado):
    """O fallback do 422: o usuário informa mes/ano e a importação segue."""
    parser_simulado["vencimento"].return_value = None
    assert _enviar(cliente_flask, mes="10", ano="2026").status_code == 200


# Resposta e persistência -------------------------------------------------------------
def test_resposta_traz_contagens_e_conferencia_do_total(cliente_flask, parser_simulado):
    """quantidade/inseridos/ignorados, total das despesas e total_confere com o cabeçalho."""
    corpo = _enviar(cliente_flask).get_json()
    assert (corpo["quantidade_total"], corpo["inseridos"], corpo["ignorados_duplicata"]) == (2, 2, 0)
    assert corpo["total_despesas"] == 100.0 and corpo["total_fatura_pdf"] == 100.0 and corpo["total_confere"] is True
    assert [item["status"] for item in corpo["lancamentos"]] == ["inserido", "inserido"]


def test_total_divergente_e_sinalizado(cliente_flask, parser_simulado):
    """Se o parser perder linhas, a soma não bate com o cabeçalho: total_confere false."""
    parser_simulado["total"].return_value = 150.0
    assert _enviar(cliente_flask).get_json()["total_confere"] is False


def test_total_ausente_no_cabecalho_deixa_conferencia_null(cliente_flask, parser_simulado):
    """Sem total no cabeçalho, total_confere é null (não dá para conferir)."""
    parser_simulado["total"].return_value = None
    assert _enviar(cliente_flask).get_json()["total_confere"] is None


def test_reimportacao_nao_duplica(cliente_flask, parser_simulado, consultar):
    """Mesmo conteúdo duas vezes: 2ª importação ignora tudo (ADR-010)."""
    _enviar(cliente_flask)
    corpo = _enviar(cliente_flask).get_json()
    assert (corpo["inseridos"], corpo["ignorados_duplicata"]) == (0, 2)
    assert consultar("SELECT COUNT(*) FROM lancamentos") == [(2,)]


def test_erro_ao_gravar_retorna_500_sem_gravar_nada(cliente_flask, parser_simulado, mocker, consultar):
    """Falha no banco durante a gravação → 500 'falha ao salvar...' e nenhum lançamento fica."""
    mocker.patch.object(main.lancamentos, "salvar_lancamentos_fatura", side_effect=RuntimeError("disco cheio"))
    resposta = _enviar(cliente_flask)
    assert resposta.status_code == 500 and resposta.get_json() == {"erro": "falha ao salvar lancamentos no banco"}
    assert consultar("SELECT COUNT(*) FROM lancamentos") == [(0,)]


def test_importacao_e_atomica(cliente_flask, parser_simulado, consultar):
    """Erro no meio da gravação desfaz tudo: ou entra a fatura inteira, ou nada (ADR-010)."""
    # O 3º item viola o NOT NULL de descricao: os 2 primeiros já tinham sido inseridos na transação
    parser_simulado["lancamentos"].return_value = EXTRAIDOS + [
        {"data": "13/09", "descricao": None, "valor": 1.0, "parcela_atual": None, "parcela_total": None}]
    resposta = _enviar(cliente_flask)
    assert resposta.status_code == 500
    assert consultar("SELECT COUNT(*) FROM lancamentos") == [(0,)]


# Prévia: simular=true (ADR-031) ---------------------------------------------------
CAFE = {"data": "03/09", "descricao": "CAFE DA ESQUINA", "valor": 8.0, "parcela_atual": None, "parcela_total": None}


def _contagens(corpo):
    return corpo["inseridos"], corpo["ignorados_duplicata"], [item["status"] for item in corpo["lancamentos"]]


def test_importacao_normal_traz_simulado_false(cliente_flask, parser_simulado):
    """Sem o campo, simular é false e a resposta diz isso."""
    assert _enviar(cliente_flask).get_json()["simulado"] is False


def test_simular_nao_grava_nada(cliente_flask, parser_simulado, consultar):
    """Prévia: mesma resposta (o que seria inserido), simulado true, banco intocado."""
    assert consultar(CONTAR) == [(0,)]
    corpo = _enviar(cliente_flask, simular="true").get_json()
    assert corpo["simulado"] is True
    assert _contagens(corpo) == (2, 0, ["inserido", "inserido"])
    assert corpo["total_confere"] is True and corpo["competencia"]["vencimento"] == "2026-10-10"
    assert consultar(CONTAR) == [(0,)]


def test_simular_false_explicito_grava(cliente_flask, parser_simulado, consultar):
    """simular="false" é a importação de verdade."""
    assert _enviar(cliente_flask, simular="false").get_json()["simulado"] is False
    assert consultar(CONTAR) == [(2,)]


def test_simular_depois_de_importar_mostra_tudo_ja_importado(cliente_flask, parser_simulado, consultar):
    """Depois da importação real, a prévia da mesma fatura não traria nada novo."""
    _enviar(cliente_flask)
    corpo = _enviar(cliente_flask, simular="true").get_json()
    assert _contagens(corpo) == (0, 2, ["ignorado_duplicata", "ignorado_duplicata"])
    assert consultar(CONTAR) == [(2,)]


def test_previa_bate_com_a_importacao_real(cliente_flask, parser_simulado, consultar):
    """Banco com parte da fatura: a prévia prevê exatamente o que a importação real faz."""
    parser_simulado["lancamentos"].return_value = [EXTRAIDOS[0], CAFE]
    _enviar(cliente_flask)  # já no banco: LOJA A e 1 café
    parser_simulado["lancamentos"].return_value = EXTRAIDOS + [CAFE, CAFE]
    previa = _enviar(cliente_flask, simular="true").get_json()
    real = _enviar(cliente_flask).get_json()
    assert _contagens(previa) == _contagens(real) == (
        2, 2, ["ignorado_duplicata", "inserido", "ignorado_duplicata", "inserido"])
    assert consultar(CONTAR) == [(4,)]


def test_previa_com_dois_iguais_legitimos(cliente_flask, parser_simulado, lancamento_manual):
    """O caso dos cafés (ADR-010) na prévia: n − m por chave, com a mesma regra da gravação."""
    parser_simulado["lancamentos"].return_value = [CAFE, CAFE]
    assert _contagens(_enviar(cliente_flask, simular="true").get_json()) == (2, 0, ["inserido", "inserido"])
    # Um café já importado (m = 1): só o segundo seria inserido
    lancamento_manual(descricao="CAFE DA ESQUINA", valor=8.0, data="2026-10-01", origem="fatura")
    assert _contagens(_enviar(cliente_flask, simular="true").get_json()) == (1, 1, ["ignorado_duplicata", "inserido"])
    # Um manual idêntico não conta como duplicata (só origem 'fatura')
    lancamento_manual(descricao="CAFE DA ESQUINA", valor=8.0, data="2026-10-01", origem="manual")
    assert _contagens(_enviar(cliente_flask, simular="true").get_json())[:2] == (1, 1)


def test_simular_sem_competencia_retorna_422(cliente_flask, parser_simulado, consultar):
    """O 422 de competência não detectada vale igual na prévia."""
    parser_simulado["vencimento"].return_value = None
    resposta = _enviar(cliente_flask, simular="true")
    assert resposta.status_code == 422 and resposta.get_json()["pedir_do_usuario"] is True


@pytest.mark.parametrize("valor", ["sim", "1", "True", ""])
def test_simular_invalido_retorna_400(cliente_flask, parser_simulado, consultar, valor):
    """Só "true" ou "false"; o resto é 400 antes de processar o PDF."""
    resposta = _enviar(cliente_flask, simular=valor)
    assert resposta.status_code == 400 and resposta.get_json() == {"erro": "simular deve ser 'true' ou 'false'"}
    parser_simulado["lancamentos"].assert_not_called()
    assert consultar(CONTAR) == [(0,)]


# Limite de upload (ADR-031) ----------------------------------------------------------
@pytest.fixture
def limite_pequeno(monkeypatch):
    """Limite de 1 KB no teste, para não gerar um corpo de 5 MB."""
    monkeypatch.setitem(main.app.config, "MAX_CONTENT_LENGTH", 1024)


def test_limite_padrao_e_5_mb():
    """O valor configurado no app (a fatura real tem ~200 KB)."""
    assert main.app.config["MAX_CONTENT_LENGTH"] == 5 * 1024 * 1024 == main.TAMANHO_MAXIMO_UPLOAD_MB * 1024 * 1024


def test_upload_acima_do_limite_retorna_413_em_json(cliente_flask, limite_pequeno, parser_simulado, consultar,
                                                    pasta_temp_monitorada):
    """413 no padrão {"erro"}, sem processar, sem gravar e sem nenhum arquivo temporário."""
    resposta = _enviar(cliente_flask, conteudo=b"%PDF" + b"0" * 5000)
    assert resposta.status_code == 413
    assert resposta.get_json() == {"erro": "arquivo maior que o limite de 5 MB"}
    parser_simulado["lancamentos"].assert_not_called()
    assert consultar(CONTAR) == [(0,)]
    assert list(pasta_temp_monitorada.iterdir()) == []


def test_413_sai_com_cabecalho_cors(cliente_flask, limite_pequeno, parser_simulado):
    """Sem o cabeçalho CORS, o navegador não deixaria a tela ler o 413 (ADR-025)."""
    resposta = cliente_flask.post(
        "/fatura/importar", headers={"Origin": "http://localhost:5500"},
        data={"arquivo": (io.BytesIO(b"%PDF" + b"0" * 5000), "fatura.pdf")}, content_type="multipart/form-data")
    assert resposta.status_code == 413
    assert resposta.headers["Access-Control-Allow-Origin"] == "http://localhost:5500"


def test_upload_abaixo_do_limite_passa(cliente_flask, limite_pequeno, parser_simulado):
    """Com o mesmo limite, um arquivo pequeno segue normalmente."""
    assert _enviar(cliente_flask, conteudo=b"%PDF-pequeno").status_code == 200
