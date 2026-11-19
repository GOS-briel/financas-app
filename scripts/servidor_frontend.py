"""
Servidor do frontend para DESENVOLVIMENTO, sem cache.

    python scripts/servidor_frontend.py              # porta 5500
    python scripts/servidor_frontend.py --porta 8000

POR QUE NÃO "python -m http.server"
O http.server não manda Cache-Control. Sem ele, o navegador aplica cache
heurístico e pode reaproveitar um .js antigo logo depois de uma mudança.
Aconteceu na 12.5: index.html novo + historico.js velho (placeholder da 12.2)
= tela em branco, com "rotuloMes is not defined" no console. Aqui toda
resposta sai com "Cache-Control: no-store": o navegador sempre busca de novo.

- Serve a pasta frontend/ do repositório, onde quer que o comando seja rodado.
- Recusa porta ocupada: no Windows o servidor subiria sem acusar erro e o
  navegador continuaria falando com o processo antigo (mesma trava do
  demo_dashboard.py).
- Escuta só em 127.0.0.1. O navegador resolve "localhost" para ::1 primeiro
  e cai em 127.0.0.1 em seguida; as duas origens estão no CORS (ADR-025).

Não é coletado pelo pytest (testpaths = ["tests"]) nem entra na cobertura
(source = ["backend"]).
"""

import argparse
import functools
import http.server
import socket
import sys
from pathlib import Path

PASTA_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


class SemCache(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler + Cache-Control: no-store em toda resposta."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def porta_ocupada(porta: int) -> bool:
    """True se já há um servidor aceitando conexões em 127.0.0.1:porta."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sonda:
        sonda.settimeout(0.5)
        return sonda.connect_ex(("127.0.0.1", porta)) == 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve o frontend sem cache (desenvolvimento)")
    parser.add_argument("--porta", type=int, default=5500, help="porta (padrão: 5500)")
    porta = parser.parse_args().porta
    if porta_ocupada(porta):
        sys.exit(f"Já existe um servidor na porta {porta}. Pare-o antes, ou use --porta.")

    handler = functools.partial(SemCache, directory=str(PASTA_FRONTEND))
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", porta), handler)
    print(f"Frontend (sem cache) em http://localhost:{porta} — Ctrl+C para parar.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
