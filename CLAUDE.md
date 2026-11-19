# CLAUDE.md — Finanças App

Instruções para o Claude Code neste repositório. Leia antes de qualquer tarefa.

## Idioma

Responda sempre em **português**. Comentários de código, mensagens de commit, ADRs e documentação também em português.

## O projeto em uma frase

App de controle financeiro pessoal (PWA): registrar um gasto em menos de 10 segundos e responder em 5 segundos "estou estourando algum teto?". Backend Flask + SQLite; frontend HTML/CSS/JS com Alpine.js, sem build.

## Estrutura

```
backend/
  main.py               rotas Flask, validação, CORS (ADR-025)
  app/fatura/leitor.py  parser da fatura Bradesco (pdfplumber)
  app/db/               SQL puro, um arquivo por recurso (ADR-004)
frontend/
  index.html            SPA: cada tela é uma <section> (ADR-026)
  css/                  reset, variables (3 camadas), style
  js/api.js             window.api — todas as rotas do backend
  js/app.js             Alpine.store('app') — estado compartilhado
  js/telas/             Alpine.data por tela
  js/util/              formatadores (window.formatar), máscara de centavos (window.mascaraCentavos)
scripts/demo_dashboard.py   API com banco fictício para testes visuais
scripts/servidor_frontend.py  serve frontend/ sem cache (desenvolvimento)
tests/                  unit / integration / e2e (pytest, ADR-024)
.github/workflows/tests.yml  CI: pytest + cobertura a cada push (ADR-024)
pyproject.toml          configuração do pytest e da cobertura
requirements.txt        dependências de produção (UTF-16, ver armadilhas)
requirements-dev.txt    + ferramentas de teste
DECISOES.md             todas as ADRs
BACKLOG.md              features adiadas de propósito
```

## Como rodar

```powershell
# Em cada terminal, a partir da raiz do projeto
.\venv\Scripts\Activate.ps1

# Backend (porta 5000)
python backend/main.py

# Frontend (porta 5500), em outro terminal. Sem cache: nunca serve um .js antigo
python scripts/servidor_frontend.py

# Backend de DEMONSTRAÇÃO, com dados fictícios (no lugar do backend normal)
# Pare o backend normal antes: o frontend sempre chama a porta 5000 (BASE_URL do api.js).
# O --porta N só serve para validação headless com uma cópia do frontend apontando para N.
python scripts/demo_dashboard.py

# Testes (dependências de teste uma vez: pip install -r requirements-dev.txt)
python -m pytest -q
```

Os testes E2E com a fatura real só rodam se a variável de ambiente `FATURA_PDF_PATH` estiver definida; sem ela, são pulados (é assim no CI).

## Como cada etapa funciona

O trabalho é dividido em etapas numeradas (ex.: 12.4). Cada etapa tem duas fases:

1. **Decisões**: tomadas fora daqui, numa conversa de planejamento. Chegam no briefing já decididas.
2. **Execução**: aqui, nesta ordem:
   1. Sincronizar com o GitHub (`git pull --ff-only`).
   2. **Ler o código e os dados reais antes de planejar** (nomes de campos, ADRs citadas, estado do banco em modo só leitura). Os nomes do briefing podem estar aproximados; os do código valem.
   3. **Mostrar o plano e esperar aprovação.** Não criar nem editar arquivos antes do OK.
   4. Implementar.
   5. Validar o que der por linha de comando (e no navegador headless, se disponível). Entregar um **roteiro curto de teste no navegador** para o Gabriel validar o resto.
   6. Com o OK do navegador, escrever o **rascunho da ADR** e mostrar para revisão.
   7. Com o OK da ADR, adicionar ao `DECISOES.md`.
   8. **Um commit único** numa branch temporária `etapa-X-Y-nome`, push, esperar o **CI verde**.
   9. Fast-forward da `main`, push, **conferir que o SHA local e o remoto são iguais**, apagar a branch local e remota.
   10. Reportar o SHA final.

Se, no meio do caminho, aparecer algo que mude uma decisão do briefing, **pare e pergunte**. Desvios bem justificados são bem-vindos, mas sempre declarados.

## Regras fixas

- **Etapa de frontend não mexe no backend.** Se precisar, pare e avise antes.
- **Nunca gravar no banco real (`financas.db`) para testar.** Use banco temporário (como nos testes) ou `scripts/demo_dashboard.py`. Antes de qualquer ação que grave dados reais, pergunte.
- **O repositório é público.** Nunca commitar PDFs de fatura, bancos `.db`, dados pessoais, caminhos com nome de usuário ou e-mails.
- **Versões fixas.** Dependências Python com `==`; bibliotecas de CDN com versão exata e SRI (ADR-026).
- **Cobertura mínima de 80%** no backend (`fail_under`); a suíte inteira deve passar antes do commit.
- **ADRs são a fonte do "porquê".** Respeite as decisões registradas. Para mudar uma, crie `ADR-NNN-v2` com link para a anterior.
- **Testes mais abrangentes que o briefing** quando fizer sentido; decisões pequenas viram comentário no código, não ADR.
- **Desligue os servidores que você subir** antes de entregar o roteiro de teste.

## Armadilhas conhecidas

- **Windows + Flask:** o Flask sobe numa porta já ocupada sem acusar erro, e as requisições vão para o outro processo. Confira a porta antes (o `demo_dashboard.py` já faz isso).
- **PowerShell:** `if ($?)` depois de um pipe olha o resultado do pipe, não do comando. E `$LASTEXITCODE` depois de `| Select-Object -First N` vem `-1` mesmo com o comando bem-sucedido (o pipe é cortado). Em scripts de git, **valide o estado final** (ex.: comparar `git rev-parse main` com `origin/main`).
- **Cache do navegador com `python -m http.server`:** ele não manda `Cache-Control`, e o Chrome reaproveita `.js` antigos (na 12.5, `index.html` novo + `historico.js` velho = tela em branco). Use `scripts/servidor_frontend.py`, que responde com `no-store`. Se vir `X is not defined` do Alpine no console logo depois de uma mudança, suspeite de cache primeiro.
- **Mensagem de commit no PowerShell 5.1:** passar a mensagem com várias linhas direto (here-string em `git commit -F -`) falhou na 12.4. Grave a mensagem num arquivo **UTF-8 sem BOM** e use `git commit -F arquivo`. Atenção: `Out-File -Encoding utf8` e `Set-Content -Encoding utf8` do 5.1 gravam **com** BOM; use `[IO.File]::WriteAllText(caminho, texto, [Text.UTF8Encoding]::new($false))` ou crie o arquivo pelo editor.
- **Edge/Chrome headless no Windows:** não abre janela com menos de ~500 px de largura (larguras de celular ficam para o teste manual) e cada captura precisa do próprio perfil (`--user-data-dir`), senão o perfil fica travado pela execução anterior.
- **`requirements.txt` está em UTF-16.** Preserve a codificação ao editar (conversão para UTF-8 fica para o polimento).
- **Datas ISO no JavaScript:** `new Date("2026-11-03")` é UTC e mostra o dia anterior no fuso de Brasília. Use `formatar.dataCurta` ou monte com `new Date(ano, mes - 1, dia)`.
- **Alpine via CDN se inicializa sozinho.** Não chamar `Alpine.start()`; registrar store e telas no evento `alpine:init`, com o script do Alpine por último (ADR-026).
- **Competência da fatura = mês do VENCIMENTO** (ADR-009), não da compra. A fatura que vence em 10/10 tem compras de setembro e conta em outubro.
- **`gh` não está instalado** nas máquinas. Para acompanhar o CI, use a API pública do GitHub (o repositório é público).

## Convenções do frontend (ADRs 026 e 027)

- O frontend **exibe, não recalcula**: valores e ordenação vêm prontos do backend.
- Cores só pelas variáveis das camadas **tema** e **categorias** do `variables.css` (nunca as primitivas direto).
- Formatação sempre por `window.formatar` (dinheiro, percentual arredondado para baixo, datas, mês).
- Chamadas à API sempre por `window.api`.
- Estados de tela distintos: primeira carga, atualização, erro (com "Tentar de novo") e vazio.
- Acessibilidade: `<button>` reais, `aria-label` em botões só com ícone, `aria-current` na tela ativa.

## Documentos

- `DECISOES.md`: ADRs (contexto, decisões, justificativa, trade-offs, "Reabrir se").
- `README.md`: visão geral, endpoints, CORS.
- `RETOMADA.md`: estado atual e pendências. **Fica fora do Git e é local de cada máquina**: atualize ao fim de cada etapa.
