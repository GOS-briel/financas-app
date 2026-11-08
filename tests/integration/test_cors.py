# CORS para as origens de desenvolvimento do frontend (ADR-025).

import pytest

ORIGEM_LIVE_SERVER = "http://localhost:5500"
ORIGEM_NAO_PERMITIDA = "http://evil.com"


@pytest.mark.parametrize(
    "origem",
    [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    ids=["localhost_5500", "127_5500", "localhost_8000", "127_8000"],
)
def test_preflight_de_origem_permitida_retorna_headers_cors(cliente_flask, origem):
    """Preflight de POST com JSON, de origem permitida, autoriza origem, método e header."""
    resposta = cliente_flask.options(
        "/subcategorias",
        headers={
            "Origin": origem,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert resposta.status_code == 200
    assert resposta.headers["Access-Control-Allow-Origin"] == origem
    assert "POST" in resposta.headers["Access-Control-Allow-Methods"]
    assert "content-type" in resposta.headers["Access-Control-Allow-Headers"].lower()


def test_get_de_origem_permitida_retorna_allow_origin(cliente_flask):
    """GET real de origem permitida devolve Access-Control-Allow-Origin com essa origem."""
    resposta = cliente_flask.get("/categorias/macro", headers={"Origin": ORIGEM_LIVE_SERVER})

    assert resposta.status_code == 200
    assert resposta.headers["Access-Control-Allow-Origin"] == ORIGEM_LIVE_SERVER


def test_get_sem_origin_continua_funcionando(cliente_flask):
    """GET sem header Origin (curl, pytest) responde normalmente, sem header CORS."""
    resposta = cliente_flask.get("/categorias/macro")

    assert resposta.status_code == 200
    assert len(resposta.get_json()) == 8
    assert "Access-Control-Allow-Origin" not in resposta.headers


def test_get_de_origem_nao_permitida_nao_retorna_allow_origin(cliente_flask):
    """GET de origem fora da lista é respondido sem Allow-Origin: quem bloqueia é o browser."""
    resposta = cliente_flask.get("/categorias/macro", headers={"Origin": ORIGEM_NAO_PERMITIDA})

    assert resposta.status_code == 200
    assert "Access-Control-Allow-Origin" not in resposta.headers


def test_post_json_de_origem_permitida_funciona(cliente_flask):
    """POST com JSON de origem permitida cria o recurso e devolve Allow-Origin."""
    resposta = cliente_flask.post(
        "/subcategorias",
        json={"nome": "Mercado", "categoria_macro_id": 1},
        headers={"Origin": ORIGEM_LIVE_SERVER},
    )

    assert resposta.status_code == 201
    assert resposta.headers["Access-Control-Allow-Origin"] == ORIGEM_LIVE_SERVER
