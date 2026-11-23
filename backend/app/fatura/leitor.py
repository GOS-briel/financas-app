# Leitura da fatura Bradesco
#
# Extrai os lançamentos (despesas) do PDF da fatura Bradesco e
# devolve uma lista estruturada. Pagamentos/créditos são ignorados.
#
# Parcelas são identificadas, mas a data e o valor continuam sendo os
# do mês da fatura (ADR-002). Transações internacionais: ver ADR-003.
#
# Também lê o cabeçalho da 1ª página: a data de vencimento (completa,
# ADR-031; o mês/ano dela é a competência, ADR-009) e o total oficial da
# fatura, usado para conferir a soma dos lançamentos.

import re
import sys
from datetime import date

import pdfplumber

# Linha de lançamento começa com a data "DD/MM "
RE_LINHA_LANCAMENTO = re.compile(r"\d{2}/\d{2} ")
# Valor no fim da linha, ex: "1.940,44" ou "1.940,44-" (pagamento/crédito)
RE_VALOR = re.compile(r"(\d[\d.]*,\d{2})(-?)\s*$")
# Parcela "DD/DD" na descrição, pode vir colada no nome (ex: "PLAZA05/06")
RE_PARCELA = re.compile(r"(?<!\d)(\d{2})/(\d{2})(?!\d)")
# Cabeçalho da 1ª página: rótulos numa linha, valores na linha seguinte
#   "Total de fatura Vencimento Limite de compras ..."
#   "R$ 1.699,21 10/10/2026 R$ 7.200,00 ..."
RE_VENCIMENTO = re.compile(r"Vencimento.*\n.*?(\d{2})/(\d{2})/(\d{4})")
RE_TOTAL_FATURA = re.compile(r"Total de fatura.*\n\s*R\$\s*(\d[\d.]*,\d{2})")


def _converter_valor(texto: str) -> float:
    """Converte "1.940,44" em 1940.44."""
    return float(texto.replace(".", "").replace(",", "."))


def _detectar_parcela(descricao: str) -> tuple[str, int | None, int | None]:
    """
    Procura "DD/DD" na descrição. Se for parcela, devolve a descrição sem
    o "DD/DD" e com " - Parcela X/Y" no final, mais (atual, total).
    Se não for, devolve a descrição original e (None, None).
    """
    achado = RE_PARCELA.search(descricao)
    if achado is None:
        return descricao, None, None
    atual, total = int(achado.group(1)), int(achado.group(2))
    if not 1 <= atual <= total:
        return descricao, None, None  # ex: uma data no meio do nome, não parcela
    sem_parcela = descricao[:achado.start()] + " " + descricao[achado.end():]
    sem_parcela = " ".join(sem_parcela.split())
    return f"{sem_parcela} - Parcela {atual}/{total}", atual, total


def _texto_primeira_pagina(pdf_path: str) -> str:
    """Texto da 1ª página inteira (sem crop: o cabeçalho ocupa a largura toda)."""
    with pdfplumber.open(pdf_path) as pdf:
        return pdf.pages[0].extract_text() or ""


def _vencimento_do_texto(texto: str) -> str | None:
    """"... Vencimento ...\\nR$ 1.699,21 10/10/2026 ..." -> "2026-10-10"; data impossível -> None."""
    achado = RE_VENCIMENTO.search(texto)
    if achado is None:
        return None
    dia, mes, ano = int(achado.group(1)), int(achado.group(2)), int(achado.group(3))
    try:
        return date(ano, mes, dia).isoformat()
    except ValueError:  # ex: 31/02 ou mês 13
        return None


def extrair_vencimento(pdf_path: str) -> str | None:
    """Data de vencimento do cabeçalho em "AAAA-MM-DD" (ADR-031), ou None se não encontrar."""
    return _vencimento_do_texto(_texto_primeira_pagina(pdf_path))


def extrair_competencia(pdf_path: str) -> dict | None:
    """
    Retorna {"mes": int, "ano": int} a partir da data de vencimento
    (ADR-009), ou None se não encontrar.
    """
    vencimento = extrair_vencimento(pdf_path)
    if vencimento is None:
        return None
    ano, mes, _ = (int(parte) for parte in vencimento.split("-"))
    return {"mes": mes, "ano": ano}


def extrair_total_fatura(pdf_path: str) -> float | None:
    """Total oficial do cabeçalho da fatura, ou None se não encontrar."""
    achado = RE_TOTAL_FATURA.search(_texto_primeira_pagina(pdf_path))
    if achado is None:
        return None
    return _converter_valor(achado.group(1))


def extrair_lancamentos(pdf_path: str) -> list[dict]:
    """
    Lê a fatura Bradesco e retorna a lista de despesas, cada uma como
    {"data": "DD/MM", "descricao": str, "valor": float,
     "parcela_atual": int | None, "parcela_total": int | None}.
    Não parcelados têm os campos de parcela como None.
    """
    with pdfplumber.open(pdf_path) as pdf:
        texto_completo = ""
        for page in pdf.pages:
            # Os lançamentos ficam na coluna esquerda da página
            coluna_esquerda = page.crop((0, 0, 358, page.height))
            texto_completo += (coluna_esquerda.extract_text() or "") + "\n"

    lancamentos = []
    for linha in texto_completo.split("\n"):
        if not RE_LINHA_LANCAMENTO.match(linha):
            continue
        achado = RE_VALOR.search(linha)
        if achado is None:
            continue  # linha com data mas sem valor no fim (ex: descrição quebrada)
        if achado.group(2) == "-":
            continue  # é pagamento/crédito, não entra na lista
        descricao, parcela_atual, parcela_total = _detectar_parcela(
            linha[6:achado.start()].strip()
        )
        lancamentos.append({
            "data": linha[:5],
            "descricao": descricao,
            "valor": _converter_valor(achado.group(1)),
            "parcela_atual": parcela_atual,
            "parcela_total": parcela_total,
        })
    return lancamentos


# Só roda quando executado direto: python leitor.py <caminho.pdf>
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python leitor.py <caminho.pdf>")
        sys.exit(1)

    lancamentos = extrair_lancamentos(sys.argv[1])
    print(f"Vencimento: {extrair_vencimento(sys.argv[1])}")
    print(f"Competência: {extrair_competencia(sys.argv[1])}")
    print(f"Total no cabeçalho: {extrair_total_fatura(sys.argv[1])}")

    parcelados = [item for item in lancamentos if item["parcela_total"] is not None]

    print(f"Lançamentos extraídos: {len(lancamentos)}")
    print(f"Parcelados: {len(parcelados)}")
    print(f"Não parcelados: {len(lancamentos) - len(parcelados)}")
    for item in parcelados[:5]:
        print(
            f"{item['data']} | {item['descricao']} | R$ {item['valor']:.2f} | "
            f"{item['parcela_atual']}/{item['parcela_total']}"
        )
    total = sum(item["valor"] for item in lancamentos)
    print(f"Total: R$ {total:.2f}")
