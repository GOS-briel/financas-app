"""
Servidor de DEMONSTRAÇÃO da API, com dados fictícios.

    python scripts/demo_dashboard.py            # porta 5000 (a que o frontend usa)
    python scripts/demo_dashboard.py --porta 5001

O QUE ELE FAZ
- Cria um banco SQLite NOVO num diretório temporário (nunca abre nem copia o
  backend/app/db/financas.db real) e o preenche com dados fictícios: lojas e
  valores inventados, seguros para demonstrar o app no portfólio.
- Sobe a API na porta 5000 apontando para esse banco (troca
  inicializar.CAMINHO_BANCO, a mesma técnica dos testes; o backend não muda).
- Ao parar (Ctrl+C), apaga o banco temporário.

Use no lugar de "python backend/main.py" — os dois usam a porta 5000, então
rode um de cada vez. O frontend (porta 5500) não muda. Se a porta já estiver
ocupada, o script para com aviso: no Windows o Flask não acusa a porta em uso
e as requisições iriam para o outro servidor (com o banco real).

CENÁRIOS (relativos ao mês de hoje)
- Mês ANTERIOR ("Mês encerrado"), com tetos parciais:
    Esporte      estourado (gasto acima do teto)
    Educação     estourado com teto R$ 0 (percentual null)
    Compras      quase no teto (85%)
    Alimentação  folgado
    Lazer        folgado, com teto herdado do mês retrasado
    Saúde        teto R$ 0 sem gasto (folgado, 0%)
    Transporte   gasto sem teto
    Outros       sem gasto e sem teto (recolhida)
    Sem categoria  3 lançamentos para categorizar
- Mês ATUAL: vazio, herdando os tetos -> "R$ 0,00 de R$ Y" e "Nenhum gasto".

Não é coletado pelo pytest (testpaths = ["tests"]) nem entra na cobertura
(source = ["backend"]).
"""

import argparse
import shutil
import socket
import sqlite3
import sys
import tempfile
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "backend"))

import main  # noqa: E402  (precisa do backend no sys.path)
from app.db import inicializar  # noqa: E402

BANCO_REAL = (RAIZ / "backend" / "app" / "db" / "financas.db").resolve()

SUBCATEGORIAS = [  # (nome, macro)
    ("Mercado", 1), ("Restaurante", 1), ("Cinema", 2), ("Roupas", 3),
    ("Farmácia", 4), ("Curso", 5), ("Equipamento", 6), ("Combustível", 7),
]


def mes_relativo(hoje: date, deslocamento: int) -> tuple[int, int]:
    """(mes, ano) a 'deslocamento' meses de hoje (-1 = mês anterior)."""
    indice = hoje.year * 12 + (hoje.month - 1) + deslocamento
    return indice % 12 + 1, indice // 12


def semear(conexao: sqlite3.Connection, hoje: date) -> dict:
    sub = {}
    for nome, macro in SUBCATEGORIAS:
        sub[nome] = conexao.execute(
            "INSERT INTO subcategorias (nome, categoria_macro_id) VALUES (?, ?)", (nome, macro)
        ).lastrowid

    mes, ano = mes_relativo(hoje, -1)
    mes_retrasado, ano_retrasado = mes_relativo(hoje, -2)
    dia = lambda d: f"{ano:04d}-{mes:02d}-{d:02d}"  # noqa: E731
    criado = f"{ano:04d}-{mes:02d}-28T12:00:00"

    # (data, descricao, valor, subcategoria, origem, parcela_atual, parcela_total)
    lancamentos = [
        (dia(1), "LOJA DE ESPORTES CENTRO - Parcela 2/4", 49.90, "Equipamento", "fatura", 2, 4),
        (dia(14), "Tênis de corrida", 129.90, "Equipamento", "manual", None, None),
        (dia(1), "CURSO ONLINE PYTHON", 39.90, "Curso", "fatura", None, None),
        (dia(1), "MODA CASUAL SHOPPING - Parcela 1/3", 120.00, "Roupas", "fatura", 1, 3),
        (dia(9), "Camisa social", 135.00, "Roupas", "manual", None, None),
        (dia(1), "SUPERMERCADO BOM PRECO", 286.45, "Mercado", "fatura", None, None),
        (dia(12), "Feira do bairro", 64.30, "Mercado", "manual", None, None),
        (dia(18), "Pizzaria Forno a Lenha", 92.00, "Restaurante", "manual", None, None),
        (dia(20), "Cinema Centro", 46.00, "Cinema", "manual", None, None),
        (dia(1), "POSTO AVENIDA", 180.00, "Combustível", "fatura", None, None),
        (dia(1), "APP DE TRANSPORTE", 38.70, None, "fatura", None, None),
        (dia(1), "LOJA ONLINE MARKETPLACE", 57.80, None, "fatura", None, None),
        (dia(22), "Presente de aniversário", 75.00, None, "manual", None, None),
    ]
    for data, descricao, valor, subcategoria, origem, p_atual, p_total in lancamentos:
        conexao.execute(
            "INSERT INTO lancamentos (data, descricao, valor, subcategoria_id, parcela_atual, "
            "parcela_total, origem, nota, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)",
            (data, descricao, valor, sub.get(subcategoria), p_atual, p_total, origem, criado),
        )

    # (macro, mes, ano, valor)
    tetos = [
        (6, mes, ano, 100.00),     # Esporte: 179,80 -> estourado
        (5, mes, ano, 0.00),       # Educação: teto 0 com gasto -> estourado, percentual null
        (3, mes, ano, 300.00),     # Compras: 255,00 -> 85%, quase no teto
        (1, mes, ano, 800.00),     # Alimentação: 442,75 -> folgado
        (4, mes, ano, 0.00),       # Saúde: teto 0 sem gasto -> folgado 0%
        (2, mes_retrasado, ano_retrasado, 150.00),  # Lazer: herdado no mês anterior
    ]
    conexao.executemany("INSERT INTO tetos (categoria_macro_id, mes, ano, valor) VALUES (?, ?, ?, ?)", tetos)
    return {"mes": mes, "ano": ano, "lancamentos": len(lancamentos), "tetos": len(tetos)}


def porta_ocupada(porta: int) -> bool:
    """True se já há um servidor aceitando conexões em 127.0.0.1:porta."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sonda:
        sonda.settimeout(0.5)
        return sonda.connect_ex(("127.0.0.1", porta)) == 0


def main_demo() -> None:
    parser = argparse.ArgumentParser(description="API de demonstração com dados fictícios")
    parser.add_argument("--porta", type=int, default=5000, help="porta da API (padrão: 5000)")
    porta = parser.parse_args().porta
    if porta_ocupada(porta):
        sys.exit(f"Já existe um servidor na porta {porta} (o backend normal?). "
                 f"Pare-o antes de subir a demonstração, ou use --porta.")

    # Se uma execução anterior foi encerrada à força (sem passar pelo finally),
    # sobrou a pasta dela: só dados fictícios, pode apagar
    for sobra in Path(tempfile.gettempdir()).glob("financas_demo_*"):
        shutil.rmtree(sobra, ignore_errors=True)

    pasta = Path(tempfile.mkdtemp(prefix="financas_demo_"))
    banco = (pasta / "demo.db").resolve()
    # Trava de segurança: este script nunca pode escrever no banco real
    assert banco != BANCO_REAL, "o banco de demonstração não pode ser o financas.db real"
    inicializar.CAMINHO_BANCO = banco
    try:
        inicializar.main()
        conexao = inicializar.conectar()
        with conexao:
            resumo = semear(conexao, date.today())
        conexao.close()
        print(f"\nBanco de DEMONSTRAÇÃO: {banco}")
        print(f"Mês com dados: {resumo['mes']:02d}/{resumo['ano']} "
              f"({resumo['lancamentos']} lançamentos, {resumo['tetos']} tetos). Mês atual: vazio.")
        print(f"API em http://127.0.0.1:{porta} — Ctrl+C para parar e apagar o banco.\n")
        # Sem debug/reloader: o reloader reiniciaria o processo sem a troca do banco
        main.app.run(port=porta, debug=False, use_reloader=False)
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
        print("Banco de demonstração apagado.")


if __name__ == "__main__":
    main_demo()
