# Fluxo real de importação com o PDF da fatura de 10/10/2026 (pulado sem FATURA_PDF_PATH)
from app.fatura.leitor import extrair_competencia, extrair_lancamentos, extrair_total_fatura, extrair_vencimento

TOTAL_FATURA = 1699.21


def test_parser_extrai_23_lancamentos_com_o_total_da_fatura(fatura_teste):
    """O parser lê os 23 lançamentos e a soma bate com R$ 1.699,21."""
    lancamentos = extrair_lancamentos(str(fatura_teste))
    assert len(lancamentos) == 23
    assert round(sum(item["valor"] for item in lancamentos), 2) == TOTAL_FATURA


def test_parser_identifica_6_parcelados(fatura_teste):
    """6 parcelados, 17 com parcela None, e o caso colado 'PLAZA05/06' tratado."""
    lancamentos = extrair_lancamentos(str(fatura_teste))
    parcelados = [item for item in lancamentos if item["parcela_total"] is not None]
    assert len(parcelados) == 6
    assert sum(1 for item in lancamentos if item["parcela_atual"] is None) == 17
    miina = next(item for item in lancamentos if item["descricao"].startswith("MIINA"))
    assert miina == {"data": "25/05", "descricao": "MIINA DA PRATA PLAZA NITEROI - Parcela 5/6",
                     "valor": 62.99, "parcela_atual": 5, "parcela_total": 6}


def test_parser_le_competencia_e_total_do_cabecalho(fatura_teste):
    """Vencimento 10/10/2026 (completo) vira competência 10/2026; total do cabeçalho é 1699.21."""
    assert extrair_vencimento(str(fatura_teste)) == "2026-10-10"
    assert extrair_competencia(str(fatura_teste)) == {"mes": 10, "ano": 2026}
    assert extrair_total_fatura(str(fatura_teste)) == TOTAL_FATURA


def test_importacao_grava_23_e_total_confere(importar, fatura_teste, consultar):
    """1ª importação: 23 inseridos, competência do PDF, total confere, tudo em 2026-10-01."""
    resposta = importar(fatura_teste)
    corpo = resposta.get_json()
    assert resposta.status_code == 200
    assert corpo["competencia"] == {"mes": 10, "ano": 2026, "fonte": "pdf", "vencimento": "2026-10-10"}
    assert corpo["simulado"] is False
    assert (corpo["quantidade_total"], corpo["inseridos"], corpo["ignorados_duplicata"]) == (23, 23, 0)
    assert corpo["total_despesas"] == TOTAL_FATURA and corpo["total_confere"] is True
    assert consultar("SELECT DISTINCT data, origem FROM lancamentos") == [("2026-10-01", "fatura")]
    assert consultar("SELECT ROUND(SUM(valor), 2) FROM lancamentos") == [(TOTAL_FATURA,)]


def test_reimportacao_do_mesmo_pdf_ignora_tudo(importar, fatura_teste, consultar):
    """2ª importação do mesmo PDF: 0 inseridos, 23 ignorados, banco continua com 23."""
    importar(fatura_teste)
    corpo = importar(fatura_teste).get_json()
    assert (corpo["inseridos"], corpo["ignorados_duplicata"]) == (0, 23)
    assert consultar("SELECT COUNT(*) FROM lancamentos") == [(23,)]


def test_mes_e_ano_do_formulario_tem_prioridade(importar, fatura_teste):
    """Competência enviada no formulário vence a detectada no PDF (fonte 'formulario')."""
    corpo = importar(fatura_teste, mes="9", ano="2026").get_json()
    # O vencimento detectado no PDF vai junto, para a tela mostrar (ADR-031)
    assert corpo["competencia"] == {"mes": 9, "ano": 2026, "fonte": "formulario", "vencimento": "2026-10-10"}
    assert {item["data"] for item in corpo["lancamentos"]} == {"2026-09-01"}


def test_previa_da_fatura_real_bate_com_a_importacao(importar, fatura_teste, consultar):
    """Prévia: nada gravado, e contagens e status iguais aos da importação real (ADR-031)."""
    previa = importar(fatura_teste, simular="true").get_json()
    assert previa["simulado"] is True and consultar("SELECT COUNT(*) FROM lancamentos") == [(0,)]
    real = importar(fatura_teste).get_json()
    assert (previa["inseridos"], previa["ignorados_duplicata"]) == (real["inseridos"], real["ignorados_duplicata"]) == (23, 0)
    assert [i["status"] for i in previa["lancamentos"]] == [i["status"] for i in real["lancamentos"]]
    depois = importar(fatura_teste, simular="true").get_json()
    assert (depois["inseridos"], depois["ignorados_duplicata"]) == (0, 23)
    assert consultar("SELECT COUNT(*) FROM lancamentos") == [(23,)]
