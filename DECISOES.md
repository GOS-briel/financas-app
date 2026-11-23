# Decisões Arquiteturais

Este arquivo registra as decisões técnicas tomadas durante o desenvolvimento do app, com contexto e justificativa. Serve como memória do projeto — "por que foi feito desse jeito e não de outro".

Formato inspirado em ADRs (Architecture Decision Records), simplificado.

---

## ADR-001 — Persistência: SQLite no backend

**Data:** 2026-10-15
**Status:** Decidido

### Contexto

O app precisa persistir lançamentos, categorias, tetos e metadados. Duas opções foram consideradas:
- **A:** SQLite num servidor Flask (dados centralizados, API REST)
- **B:** IndexedDB no navegador (dados locais no celular, sem servidor)

### Decisão

**SQLite no backend (Opção A).**

### Justificativa

1. Dados centralizados permitem acessar o app de múltiplos dispositivos do mesmo usuário (celular, outro celular, tablet).
2. Habilidade transferível: SQL + API REST são universais no mercado de dados/dev, enquanto IndexedDB é nichado.
3. Alinhamento com a futura trilha Flutter, que também usará SQLite (modelo de dados reaproveitável como referência).
4. Backup, exportação e debugging mais simples (basta copiar o arquivo .db).
5. Risco de perda por limpeza de cache do navegador fica eliminado.

### Trade-offs aceitos

- Precisa hospedar o backend em algum lugar (começa local; depois tiers gratuitos de Railway/Render/Fly.io quando for pro celular fora de casa).
- Mais código a escrever (API Flask com rotas CRUD).

---

## ADR-002 — Data de parcelas: mês atual da fatura

**Data:** 2026-10-15
**Status:** Decidido

### Contexto

Ao importar uma fatura que contém compras parceladas (ex: "MAGAZINE LUIZA 4/10"), a parcela daquele mês representa uma compra feita vários meses atrás. Qual data atribuir ao lançamento?

Opções consideradas:
- **A:** Data original da compra
- **B:** Mês atual da fatura
- **C:** Guardar as duas datas em colunas separadas

### Decisão

**Mês atual da fatura (Opção B)**, com proteção: campos parcela_atual e parcela_total adicionados ao lançamento, e descrição com sufixo " - Parcela X/Y" para rastreabilidade visual.

Exemplo de lançamento gerado:
- Descrição: "DECATHLON NITEROI - Parcela 5/6"
- Data: "08/05"
- Valor: 66.66
- parcela_atual: 5
- parcela_total: 6

### Justificativa

1. A pergunta principal do app é "estou no controle este mês?" — resolvida com data de cobrança, não data de compra.
2. Alinha com a realidade do bolso: o dinheiro sai no mês da fatura, não no mês da compra.
3. Dashboard de qualquer mês soma os lançamentos daquele mês diretamente, sem lógica extra.
4. A informação "foi parcelado" é preservada em campos dedicados (parcela_atual, parcela_total).

### Implementado em

Etapa 2 do parser Bradesco (backend/app/fatura/leitor.py).

### Trade-offs aceitos

- Perde a informação precisa da data original da compra (precisa consultar fatura antiga para auditoria).
- Análise anual tipo "quanto gastei em março" fica distorcida — ok para a v1.

### Reabrir se:

Análise histórica por data de compra virar necessidade real → migrar para ADR-002b com Opção C.

---

## ADR-003 — Transações internacionais: adiado (revisado com dados reais)

**Data original:** 2026-10-15
**Status:** Decidido → Revisto no mesmo dia após teste com fatura real, decisão adiada

### Contexto original (invalidado)

A ADR original assumia que a fatura Bradesco mostra transações internacionais em formato de "dupla moeda" (ex: USD 15,99 R$ 89,47), e que suas descrições seriam poluídas (ex: NETFLIX*.COM). A decisão foi: marcar essas linhas para revisão manual (chip de aviso na UI).

### Realidade descoberta ao testar o parser com fatura real (15/10/2026)

- A fatura Bradesco NÃO mostra transações internacionais em dupla moeda. O valor aparece já convertido em reais, sem indicação visual de moeda estrangeira na linha.
- A única compra internacional recorrente do usuário é a assinatura do Claude Pro (~R$ 110/mês).
- O IOF da transação internacional aparece como lançamento separado, com descrição clara: "IOF S/ TRANS INTER REAIS".
- Descrições de internacionais (ex: "ANTHROPIC* CLAUDE SUB 110,00ANTHROPIC.C") vêm com texto embutido, mas não com dupla moeda.

### Nova decisão

**Adiar o tratamento especial de transações internacionais até que:**
1. O volume de compras internacionais aumente significativamente, OU
2. Padrões reais de "ruído" na descrição sejam identificados após uso contínuo do app

**Enquanto isso:**
- Transações internacionais entram no app como lançamentos normais (sem flag especial)
- Usuário categoriza manualmente ao importar fatura (ex: "Assinaturas", "Outros")
- IOF entra como lançamento normal também (pode ser categorizado como "Outros" ou criada subcategoria "Impostos")

### Justificativa

Investir código para resolver um problema que afeta 1 lançamento recorrente por mês é desproporcional ao escopo da v1. O princípio do app é "fricção baixa + aprender com o uso" — a decisão certa aqui é aguardar dados reais antes de projetar solução.

### Reabrir quando:

- O usuário tiver 5+ transações internacionais/mês de origens variadas
- Padrões de descrição mal formatada forem identificados
- Houver demanda real por análise específica de gastos internacionais

---

## ADR-004 — SQL puro em vez de ORM

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

Para persistir dados no SQLite, duas abordagens foram consideradas:
- **A:** SQLAlchemy ou outro ORM (mapeamento objeto-relacional)
- **B:** SQL puro usando o módulo `sqlite3` nativo do Python

### Decisão

**SQL puro (Opção B).**

### Justificativa

1. SQL é habilidade universal no mercado de analista de dados (área que o usuário quer migrar). SQLAlchemy é específico de dev Python backend.
2. Transparência total: cada operação é explícita, sem "mágica" por baixo.
3. Zero dependência adicional (sqlite3 já vem com Python).
4. Escopo pequeno (4 tabelas) não justifica a complexidade de um ORM.
5. Alinhado com o aprendizado ativo — expor o SQL em vez de abstrai-lo.

### Trade-offs aceitos

- Mais linhas de código em operações CRUD repetitivas (INSERT, UPDATE, DELETE escritos manualmente).
- Risco de SQL injection se queries forem concatenadas manualmente (mitigado usando sempre `cursor.execute(sql, params)` com parâmetros).

### Reabrir se:

Projeto crescer para 15+ tabelas com relacionamentos complexos, OU houver necessidade de trocar o banco (PostgreSQL, MySQL).

---

## ADR-005 — Estrutura de categorias: duas tabelas separadas

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

As categorias do app têm hierarquia fixa de 2 níveis: 8 categorias macro fixas (Alimentação, Lazer, Compras, Saúde, Educação, Esporte, Transporte, Outros) + subcategorias customizáveis pelo usuário.

Duas estruturas foram consideradas:
- **A:** Uma única tabela `categorias` com campo `tipo` ("macro" ou "sub") e campo `categoria_pai_id` auto-referente
- **B:** Duas tabelas separadas: `categorias_macro` e `subcategorias` com foreign key

### Decisão

**Duas tabelas separadas (Opção B).**

### Justificativa

1. Reflete a natureza real do domínio: hierarquia fixa de exatamente 2 níveis.
2. Impossível misturar macro com sub por engano (constraint estrutural).
3. Queries mais limpas (sem self-join, sem filtro `WHERE tipo = ...`).
4. Mais intuitivo para iniciante entender e manter.

### Trade-offs aceitos

- Se um dia precisar de sub-sub-categoria (nível 3), precisaria criar nova tabela. Isso é improvável para um app de controle financeiro pessoal.

---

## ADR-006 — Teto por mês (não fixo)

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

Cada categoria macro tem um teto de orçamento mensal. Duas opções foram consideradas:
- **A:** Teto fixo (um valor por categoria, vale pra todo mês)
- **B:** Teto por mês/ano (cada mês pode ter seu próprio teto por categoria)

### Decisão

**Teto por mês/ano (Opção B).**

### Justificativa

1. Realidade do usuário: dezembro (festas, 13º) e janeiro (volta das férias) têm padrões financeiros diferentes do resto do ano.
2. Preserva histórico de evolução dos tetos ao longo do tempo.
3. Custo adicional de implementação é mínimo (2 colunas: `mes` e `ano`).
4. Migração futura de A para B seria custosa (reescrita, risco de perda de dados). Fazer certo na origem é mais barato.

### Trade-offs aceitos

- Setup inicial exige definir tetos para pelo menos o mês atual (não é "cria uma vez e esquece").
- Lógica da API precisa decidir o que fazer quando não há teto definido para um mês específico (herdar do anterior? mostrar vazio? default?). Essa decisão será feita na etapa de API, não na modelagem.

---

## ADR-007 — Data dos lançamentos importados: primeiro dia do mês da fatura

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

Quando lançamentos são importados do PDF da fatura Bradesco, o parser extrai apenas `DD/MM` (sem ano) e podem representar compras parceladas de meses anteriores. É necessário decidir qual data (completa, com ano) atribuir ao campo `data` da tabela `lancamentos`.

Opções consideradas:
- **1:** Dia de fechamento da fatura
- **2:** Dia de vencimento da fatura
- **3:** Primeiro dia do mês de competência da fatura (ex: 2026-10-01 para fatura de outubro/2026)
- **4:** Preservar o dia original + apenas inferir o ano

### Decisão

**Opção 3 — primeiro dia do mês de competência da fatura.**

### Justificativa

1. Honra a ADR-002 (data = mês da fatura, não da compra original).
2. Dia específico dentro do mês é irrelevante para o controle de teto mensal — o que importa é "é um gasto deste mês".
3. Simples de calcular (não precisa parsear datas específicas).
4. Dashboard mostra "outubro/2026" sem precisar entrar em detalhe de dia.

### Regra consolidada de preenchimento do campo `data`

| Origem do lançamento | Formato da data |
|---|---|
| Importado da fatura | `AAAA-MM-01` (primeiro dia do mês de competência) |
| Registrado manualmente | Data real escolhida pelo usuário (default = hoje) |

### Trade-offs aceitos

- Perde a informação do dia específico da compra para lançamentos de fatura. Aceitável — já perdemos a data real da compra parcelada por decisão da ADR-002.

---

## ADR-008 — Matching de aprendizado: descrição completa limpa

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

A tabela `aprendizados` guarda mapeamentos "padrão de descrição → subcategoria" para que o app sugira automaticamente a categoria em importações futuras. Precisa-se decidir como identificar que duas descrições diferentes são "do mesmo tipo" para fazer match.

Opções consideradas:
- **A:** Prefixo da descrição (primeira palavra)
- **B:** Descrição completa normalizada (remove sufixos variáveis como " - Parcela X/Y")
- **C:** Palavras-chave com LIKE SQL
- **D:** Usuário escolhe o padrão na interface no momento de categorizar

### Decisão

**Opção B — descrição completa limpa, com Opção D guardada como melhoria futura.**

### Regra de normalização para o campo `padrao_descricao`

Antes de salvar na tabela `aprendizados`, remover da descrição:
- Sufixo " - Parcela X/Y"
- Números soltos no final da string
- Mantém o resto como-está

Exemplos:
- `DECATHLON NITEROI - Parcela 5/6` → padrão: `DECATHLON NITEROI`
- `DECATHLON NITEROI - Parcela 6/6` → padrão: `DECATHLON NITEROI` → **match!**

### Justificativa

1. Menor risco de agrupar erroneamente lançamentos diferentes com mesmo prefixo (ex: "PÃO DE AÇÚCAR" vs "PÃO DE QUEIJO").
2. Simples de implementar na v1.
3. Especificidade suficiente para o caso comum (reconhecer repetições de mesmo lugar).

### Trade-offs aceitos

- Menos genérico que Opção A: se usuário comprar na DECATHLON de outra cidade, não reconhece automaticamente.
- Se usuário sentir que B é restritivo demais, considerar migrar para Opção D (deixar usuário escolher o padrão na UI).

### Reabrir se:

- Usuário relatar fricção com a Opção B em uso real (muitos aprendizados similares sendo criados para variações mínimas).
- Volume de aprendizados crescer e análise mostrar que a Opção B gera dicionário com muitos duplicados "semânticos".

---

## ADR-009 — Competência da fatura: mês/ano do vencimento

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

A ADR-007 define que lançamentos importados recebem a data `AAAA-MM-01` do mês de competência da fatura. O parser, porém, só extrai `DD/MM` de cada lançamento (sem ano), então é preciso descobrir o mês/ano de competência de outra forma.

Investigação no PDF real (fatura de 10/10/2026) mostrou que:
- Não existe "período de competência" nem "data de fechamento desta fatura" no texto.
- Existe a **data de vencimento** no cabeçalho da 1ª página (rótulo "Vencimento" numa linha, data `DD/MM/AAAA` na linha seguinte), repetida no boleto.
- Existe apenas a previsão de fechamento da **próxima** fatura (não serve).

Opções consideradas:
- **A:** Mês/ano do vencimento, extraído do PDF
- **B:** Sempre pedir mês/ano ao usuário no upload
- **C:** Inferir pelas datas dos lançamentos (ex: a data mais recente)

### Decisão

**Opção A, com o formulário como fallback e prioridade.**

- O endpoint lê o vencimento do cabeçalho e usa o seu mês/ano como competência.
- Se o formulário enviar `mes` e `ano`, eles têm prioridade sobre o detectado.
- Se não detectar e o formulário não enviar, o endpoint retorna 422 com `"pedir_do_usuario": true`, e o frontend pergunta ao usuário.
- A resposta informa a fonte (`"fonte": "pdf"` ou `"formulario"`).

### Justificativa

1. Vencimento é o momento em que o dinheiro sai — coerente com a ADR-002 ("o dinheiro sai no mês da fatura").
2. Está sempre presente no PDF (é um dado obrigatório do boleto).
3. Zero fricção no caso comum; o usuário só é consultado quando o PDF falha.
4. Opção C é frágil: parcelas antigas têm datas de meses anteriores.

### Proteção adicional

O total oficial do cabeçalho ("Total de fatura") também é extraído e comparado com a soma dos lançamentos (`total_confere` na resposta). Se o layout da fatura mudar e o parser perder linhas, a divergência aparece na hora.

### Trade-offs aceitos

- Depende do rótulo "Vencimento" no cabeçalho do Bradesco. Mudança de layout quebra a detecção (mitigado pelo fallback 422).
- Uma fatura com vencimento em dia 1º–5º pode concentrar gastos majoritariamente do mês anterior; aceito, pois o critério é a saída do dinheiro.

### Reabrir se:

- Outro banco/cartão for suportado (cada layout terá sua regra).
- O usuário preferir competência pelo mês de fechamento.
- Gabriel quer reavaliar competência pelo mês da compra após uso real (decidido manter em 2026-11-11). Contexto: a fatura com vencimento em 10/10 traz compras de setembro e é contada em outubro — o que o projeto chamava de "fatura de outubro" é a "fatura que vence em outubro". Mudar envolveria parser, ADRs 002/007/009, deduplicação e testes (etapa própria).

---

## ADR-010 — Deduplicação de lançamentos de fatura por contagem

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

Reimportar a mesma fatura não pode duplicar lançamentos. A chave natural de um lançamento de fatura é: descrição + valor + data + parcela_atual + parcela_total.

Problema: pela ADR-007, todo lançamento importado recebe o dia `01`, então o dia original da compra se perde. Dois lançamentos **legítimos e diferentes** — ex: dois cafés de R$ 8,00 no mesmo lugar, em dias distintos — passam a ter **a mesma chave**.

Opções consideradas:
- **A:** Chave única (UNIQUE / SELECT simples): se a chave já existe, ignora
- **B:** Contagem: insere a diferença entre ocorrências no PDF e no banco
- **C:** Guardar o dia original (DD/MM) numa coluna extra e incluí-lo na chave

### Decisão

**Opção B — deduplicação por contagem.**

Para cada chave: `n` = ocorrências no PDF, `m` = ocorrências já no banco (`origem = 'fatura'`). Insere `max(0, n − m)`.

| Situação | n | m | Inseridos |
|---|---|---|---|
| 1ª importação com 2 cafés iguais | 2 | 0 | 2 |
| Reimportação da mesma fatura | 2 | 2 | 0 |
| Importação anterior interrompida | 2 | 1 | 1 |

### Justificativa

1. A Opção A **perde gastos reais silenciosamente** já na primeira importação — inaceitável num app financeiro.
2. Reimportação continua idempotente.
3. Toda a importação roda numa transação única: ou entra a fatura inteira, ou nada.
4. Custo igual ao da Opção A (um COUNT por chave).

### Detalhe de implementação

A comparação das parcelas usa `IS` em vez de `=`: em SQL, `NULL = NULL` não é verdadeiro, e com `=` os lançamentos não parcelados nunca seriam reconhecidos como duplicata.

### Trade-offs aceitos

- Se o banco emitir uma fatura **corrigida** com um lançamento a menos, a reimportação não apaga o excedente (só insere, nunca remove).
- Um lançamento manual idêntico não conta como duplicata (só `origem = 'fatura'` entra na contagem) — por design.

### Reabrir se:

- Surgirem faturas corrigidas/retificadas na prática.
- A Opção C for necessária por outro motivo (ex: análise por dia da compra, ver ADR-002 "Reabrir se").

---

## ADR-011 — Design dos endpoints CRUD de categorias

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

A Etapa 6 expõe categorias e subcategorias via API para o frontend. Três questões de design precisavam de resposta: como entregar a hierarquia macro → sub, o que fazer ao deletar uma subcategoria em uso, e se macro podem ser deletadas.

### Decisões

**1. `GET /categorias/macro` devolve cada macro com as subcategorias embutidas.**
Uma única resposta com a árvore inteira (8 macro + suas subs), em vez de um endpoint para macro e outro para subs.

**2. DELETE de subcategoria em uso é bloqueado (409), nunca em cascata nem SET NULL.**
Se houver lançamentos ou aprendizados vinculados, a resposta informa as duas contagens (`lancamentos_vinculados`, `aprendizados_vinculados`) e nada é apagado.

**3. Não existe DELETE de categoria macro.**
Macro são fixas (ADR-005). A remoção excepcional foi movida para a Etapa de Admin pós-v1 (ver BACKLOG.md).

### Justificativa

1. **Embutir:** o volume é minúsculo (8 macro + poucas dezenas de subs), e toda tela que mostra categorias precisa das duas camadas juntas. Uma requisição só = menos round-trips e frontend mais simples.
2. **Bloquear:** princípio "nada é deletado silenciosamente". Cascata apagaria gastos reais; SET NULL "descategorizaria" lançamentos sem aviso, distorcendo o dashboard. O 409 com contagem deixa o usuário decidir (recategorizar antes, ou desistir).
3. **Sem DELETE de macro:** remover uma macro afeta tetos, subs e lançamentos em cadeia. Exige confirmação, auditoria e autenticação — escopo de uma etapa própria.

### Trade-offs aceitos

- Para apagar uma subcategoria em uso, o usuário precisa recategorizar os lançamentos antes (não há "mover tudo para X" nesta etapa).
- Se o número de subs crescer muito, a resposta embutida fica maior — irrelevante na escala de um app pessoal.

### Reabrir se:

- Usuário pedir "apagar e mover lançamentos para outra subcategoria" (endpoint de merge).
- A Etapa de Admin for iniciada (DELETE de macro).

---

## ADR-012 — Consistência de nomes e ordenação de subcategorias

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

Três detalhes finos apareceram ao planejar o CRUD de subcategorias, todos com impacto direto na qualidade dos dados e na experiência de uso:

1. O `UNIQUE (nome, categoria_macro_id)` do SQLite diferencia maiúsculas/minúsculas: "Delivery" e "delivery" passariam como subcategorias distintas.
2. A tabela `aprendizados` também referencia `subcategorias` (com `NOT NULL`). Deletar uma sub com aprendizados geraria erro de foreign key (500).
3. O `ORDER BY nome` do SQLite compara bytes: "Água" vai depois de "Zoológico", e minúsculas depois de todas as maiúsculas.

### Decisões

**1. Duplicata detectada sem diferenciar maiúsculas/minúsculas, no Python (`casefold()`).**
Antes de inserir ou renomear, o nome é comparado (normalizado em NFC + `casefold()`) com as subs da mesma macro. "AÇAÍ" colide com "açaí". O UNIQUE do schema continua como rede de segurança para o nome exato. Renomear uma sub para o próprio nome com outra capitalização é permitido.

**2. Aprendizados vinculados também bloqueiam o DELETE (409).**
Mesma regra dos lançamentos (ADR-011). A resposta traz `aprendizados_vinculados` — sempre 0 até a Etapa 9, mas o código já está pronto.

**3. Subcategorias ordenadas no Python, sem acento e sem diferenciar maiúsculas.**
Chave de ordenação: decomposição Unicode (NFKD), remoção dos acentos, `casefold()`. Resultado: `açaí, Água, bar, Delivery, Restaurante, Zoológico`.

### Justificativa

1. **casefold no Python e não `COLLATE NOCASE`:** o NOCASE do SQLite só trata letras ASCII — "AÇAÍ" e "açaí" continuariam diferentes. Para um app em português, isso anula o propósito.
2. **Bloquear por aprendizados:** consistência com "nada é deletado silenciosamente" e evita um 500 por violação de foreign key.
3. **Ordenação natural:** listas são a interface principal de escolha de categoria; ordem errada degrada o app inteiro.

### Trade-offs aceitos

- A checagem de duplicata lê as subs da macro a cada inserção (custo irrelevante: poucas dezenas de linhas).
- Nomes que diferem só por acento ("Acai" vs "Açaí") **são** considerados diferentes na duplicata (só a ordenação ignora acentos).
- Ordenar no Python impede paginar/ordenar via SQL — irrelevante neste volume.

### Reabrir se:

- Usuário criar duplicatas "por acento" na prática (considerar ignorar acentos também na duplicata).
- O volume de subcategorias crescer a ponto de exigir paginação.

---

## ADR-013 — Herança de tetos: mês anterior mais recente, calculada em runtime

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

A ADR-006 definiu teto por mês/ano e deixou em aberto: "o que fazer quando não há teto definido para um mês específico (herdar do anterior? mostrar vazio? default?)". Sem uma regra, o usuário teria de recadastrar os 8 tetos todo mês — fricção alta para um app cujo princípio é "fricção baixa".

Opções consideradas:
- **A:** Mostrar vazio (usuário cadastra todo mês)
- **B:** Herdar do mês anterior mais recente, calculando na hora da consulta
- **C:** Herdar copiando (materializando) a linha no banco quando o mês é consultado ou virado
- **D:** Um teto "padrão" por categoria, sobrescrito por mês

### Decisão

**Opção B — herança do mês anterior mais recente, em runtime, sem gravar nada.**

Para cada categoria macro, no `GET /tetos?mes=&ano=`:
1. Procura o teto do mês/ano exato. Se existe → `herdado: false`, origem = o próprio mês.
2. Senão, procura o mais recente **estritamente anterior**: `(ano < ? OR (ano = ? AND mes < ?)) ORDER BY ano DESC, mes DESC LIMIT 1`. Se existe → `herdado: true`, origem = mês/ano do registro encontrado.
3. Senão → `valor: null`, `herdado: false`, origem `null`.

A resposta sempre traz as 8 macro, com `origem_mes`/`origem_ano` para o frontend mostrar "herdado de setembro/2026".

### Justificativa

1. Fricção mínima: define uma vez, vale até mudar — mas o histórico por mês da ADR-006 continua possível.
2. Runtime em vez de materializar: o banco guarda só o que o usuário **decidiu**. Mudar o teto de outubro reflete automaticamente em novembro, dezembro… sem rotina de "virada de mês" nem linhas copiadas para limpar depois.
3. Só olha para trás: um teto definido para dezembro não vale para outubro. Planejar o futuro não reescreve o passado.
4. O flag `herdado` deixa explícito na UI o que foi decidido e o que é automático.
5. Funciona cruzando o ano (01/2027 herda de 10/2026).

### Trade-offs aceitos

- Até 16 queries por GET (8 macro × 2) — desprezível neste volume; mantido pela legibilidade, passo a passo.
- Alterar um teto antigo muda retroativamente os meses seguintes que herdavam dele. Para "congelar" um mês, basta defini-lo explicitamente.
- `0` e `null` são diferentes: `0` = "não gastar nada" (decidido); `null` = "sem teto".

### Reabrir se:

- O usuário quiser que meses passados fiquem congelados automaticamente (considerar materializar ao fechar o mês).
- Surgir necessidade de teto padrão anual (Opção D).

---

## ADR-014 — Tetos: PUT como upsert e DELETE que devolve à herança

**Data:** 2026-10-18
**Status:** Decidido

### Contexto

Um teto é identificado pela combinação natural `(categoria_macro_id, mes, ano)` — já protegida pelo `UNIQUE` do schema. Era preciso definir os verbos HTTP e o significado do DELETE num modelo com herança (ADR-013).

Opções consideradas para escrita:
- **A:** POST para criar + PUT para atualizar (o cliente precisa saber se já existe)
- **B:** PUT único com semântica de upsert

### Decisão

**1. `PUT /tetos` único, com upsert.**
Corpo: `{categoria_macro_id, mes, ano, valor}`. Se a combinação existe, atualiza o valor; senão, cria. Sempre 200 com o teto gravado. Implementado como **uma única instrução atômica**:
`INSERT ... ON CONFLICT (categoria_macro_id, mes, ano) DO UPDATE SET valor = excluded.valor`

**2. `DELETE /tetos?categoria_macro_id=&mes=&ano=` apaga a linha do mês exato.**
204 se apagou, 404 se não havia teto definido naquele mês. Depois do DELETE, o GET daquele mês passa a mostrar a herança do anterior (ou `null`).

**3. PUT e DELETE agem só no mês/ano exato — nunca na herança.**
Não dá para "apagar um teto herdado" (404); para mudar um mês que herda, faz-se PUT nele.

### Justificativa

1. **PUT idempotente:** "o teto de Alimentação em 10/2026 é 800" — repetir a requisição dá o mesmo resultado. Encaixa perfeitamente em um recurso com chave natural.
2. **Frontend mais simples:** a tela de tetos só faz "salvar", sem precisar saber se a linha existe.
3. **ON CONFLICT em vez de SELECT + INSERT/UPDATE:** operação atômica, sem janela de corrida entre a checagem e a escrita; reaproveita o UNIQUE do schema.
4. **DELETE = "voltar a herdar":** com herança em runtime, apagar não deixa o mês "sem teto" — devolve-o à regra automática. É a forma natural de desfazer uma exceção pontual (ex: teto maior só em dezembro).

### Trade-offs aceitos

- PUT não distingue criação de atualização na resposta (sempre 200) — irrelevante para o frontend.
- PUT no corpo e DELETE em query string (DELETE com corpo é mal suportado por clientes HTTP e proxies).
- Para "zerar" um mês sem herdar, é preciso PUT com `valor: 0`; DELETE não serve para isso.

### Reabrir se:

- O frontend precisar saber se o PUT criou ou atualizou (considerar 201 na criação).
- Surgir necessidade de operações em lote (definir os 8 tetos de uma vez).

---

## ADR-015 — Data de lançamento manual: até 90 dias no passado, nunca no futuro

**Data:** 2026-10-21
**Status:** Decidido

### Contexto

A ADR-007 definiu que lançamentos manuais usam a data real escolhida pelo usuário. Faltava definir os limites: sem nenhum, um erro de digitação (2062 em vez de 2026, ou 2016) jogaria o gasto num mês que ninguém olha, distorcendo dashboards e tetos sem que o usuário perceba.

### Decisão

- **Futuro bloqueado:** data posterior a hoje → 400.
- **Até 90 dias no passado:** `hoje − 90` é aceito; `hoje − 91` → 400 (leitura literal de "mais de 90 dias").
- O limite é a constante `DIAS_RETROATIVO_MAXIMO = 90` no topo do `main.py`, fácil de ajustar.
- Formato estrito `AAAA-MM-DD` (regex + `date.fromisoformat`): recusa `21/10/2026`, `20261021`, `2026-W43-3` e datas impossíveis como `2026-02-30`.
- No PUT, a janela só é checada **se a data mudar** (ver ADR-016): editar o valor de um lançamento antigo, reenviando a mesma data, continua funcionando.

### Justificativa

1. Futuro não faz sentido para despesa já realizada; bloquear pega erro de digitação na hora.
2. 90 dias cobrem o caso real ("esqueci de lançar aquele almoço do mês passado") com folga, sem permitir reescrever o histórico antigo.
3. Constante nomeada torna a regra explícita e trivial de mudar.

### Trade-offs aceitos

- **Fuso horário:** "hoje" é `date.today()`, o relógio do servidor. Na máquina local é o horário de Brasília. Ao hospedar o backend (Railway/Render costumam usar UTC), entre 21h e 0h a fronteira dos 90 dias pode deslocar 1 dia. A data futura não é afetada (o servidor em UTC está sempre à frente do Brasil). Usar `ZoneInfo("America/Sao_Paulo")` exigiria o pacote `tzdata` no Windows; ficou como TODO no código, ao lado da constante, para resolver no deploy.
- Despesas com mais de 90 dias não podem ser lançadas manualmente — aceitável para v1; basta ajustar a constante se virar necessidade.

### Reabrir se:

- O backend for hospedado (resolver o TODO de fuso).
- O usuário precisar lançar gastos mais antigos com frequência.

---

## ADR-016 — Edição de lançamentos importados: só subcategoria e nota

**Data:** 2026-10-21
**Status:** Decidido

### Contexto

Lançamentos importados (`origem = "fatura"`) refletem a fatura do banco, que é a fonte da verdade. Lançamentos manuais pertencem ao usuário. O `PUT /lancamentos/<id>` precisava de regras diferentes para cada origem, e de um DELETE coerente com isso.

### Decisão

**1. Três níveis de campo:**

| Campo | Manual | Importado |
|---|---|---|
| `subcategoria_id`, `nota` | editável | editável |
| `data`, `descricao`, `valor` | editável | **403** `campos_bloqueados` |
| `id`, `origem`, `parcela_atual`, `parcela_total`, `criado_em` | **400** `campos_nao_permitidos` | **400** `campos_nao_permitidos` |

O 400 vale também para o POST: `origem` é sempre forçada como `"manual"` e parcelas sempre NULL — enviar esses campos é erro do cliente, não é ignorado em silêncio.

**2. Só conta como alteração o que difere do banco.**
Antes de bloquear ou validar, cada campo enviado é normalizado (`"48.63"` → `48.63`, espaços removidos) e comparado com o valor atual. Reenviar o objeto inteiro com valores iguais não dispara 403 nem a janela de datas da ADR-015. `campos_bloqueados` lista só os campos que de fato mudariam.

Por isso a ordem das checagens no PUT é: 404 → 400 (corpo vazio / campos não permitidos) → 400 (formato) → 400 (janela de data, só manual e só se a data mudou) → 403. O formato precisa vir antes do 403 porque a comparação exige valores já normalizados.

**3. DELETE é definitivo, para qualquer origem.**
`DELETE FROM lancamentos WHERE id = ?` — sem soft delete, sem lixeira, sem endpoint de restaurar. A proteção contra exclusão acidental fica na UI (confirmação), em etapa futura.

### Justificativa

1. **Fatura como fonte da verdade:** valor, data e descrição de um importado vêm do banco; mudá-los criaria divergência com o extrato real. Categorizar e anotar são enriquecimentos do usuário, não alterações do fato.
2. **Mantém a ADR-010 correta:** a chave de deduplicação é descrição + valor + data + parcelas. Se esses campos pudessem ser editados, a reimportação da mesma fatura não reconheceria o lançamento editado e criaria uma duplicata. O bloqueio é o que garante a idempotência da importação.
3. **400 vs 403:** 400 = "esse campo não existe para edição" (erro do cliente); 403 = "o campo existe, mas não é permitido para este lançamento" (regra de negócio). Mensagens distintas facilitam o tratamento no frontend.
4. **Comparação com o atual:** frontends costumam enviar o objeto inteiro; sem isso, categorizar um importado daria 403 e editar o valor de um manual antigo daria 400.
5. **Hard delete:** simplicidade; dados de um app pessoal, sem requisito de auditoria.

### Interação com a ADR-010 (registrada conscientemente)

Como o DELETE é definitivo e a deduplicação é por contagem, **apagar um lançamento importado e reimportar a mesma fatura faz ele voltar** (n = 1 no PDF, m = 0 no banco). Comportamento considerado correto: a fatura é a fonte da verdade; o DELETE remove o registro, não "desmente" a fatura. Lançamentos importados apenas categorizados ou anotados não duplicam na reimportação (testado).

### Trade-offs aceitos

- Um importado com erro do próprio banco não pode ser corrigido no app (só anotado); a correção virá na próxima fatura.
- Exclusão acidental não tem desfazer na API.
- Para "esconder" um importado de vez, não basta apagar se a fatura for reimportada.

### Reabrir se:

- Surgir necessidade de "ignorar" importados permanentemente (considerar flag de oculto em vez de DELETE).
- Exclusões acidentais virarem problema real mesmo com confirmação na UI (considerar soft delete).

---

## ADR-017 — Categorização: PUT silencioso agora, categorização com aprendizado na Etapa 9

**Data:** 2026-10-21
**Status:** Decidido

### Contexto

Há dois jeitos de atribuir uma subcategoria a um lançamento:
- **Silencioso:** só grava `subcategoria_id` no lançamento.
- **Aprendendo:** grava e também cria/atualiza uma entrada em `aprendizados` (ADR-008), para que lançamentos futuros com a mesma descrição limpa sejam sugeridos automaticamente.

### Decisão

- **Etapa 8:** `PUT /lancamentos/<id>` com `subcategoria_id` faz a categorização **silenciosa** — nunca toca na tabela `aprendizados`.
- **Etapa 9:** um endpoint próprio, `POST /lancamentos/<id>/categorizar`, fará a categorização **com aprendizado**.

### Justificativa

1. **Responsabilidade única:** o PUT edita campos de um recurso; aprender é um efeito colateral sobre *outro* recurso (`aprendizados`). Misturar os dois num PUT genérico esconderia esse efeito.
2. **Correções sem poluir o dicionário:** recategorizar um caso pontual (ex: uma compra atípica numa loja de sempre) não deve ensinar o app errado.
3. **PUT continua previsível e idempotente;** o POST de categorizar deixa explícito, no próprio verbo e na rota, que há uma ação com consequências.
4. **Entrega incremental:** a Etapa 8 já permite categorizar manualmente; a lógica de aprendizado (normalização da ADR-008, confiança, atualização) ganha uma etapa própria.

### Trade-offs aceitos

- Duas formas de categorizar: o frontend precisa escolher qual chamar (provavelmente "categorizar" como ação padrão na tela de importação, e PUT na edição avulsa).
- Até a Etapa 9, nada é aprendido — toda categorização é manual.

### Reabrir se:

- Na prática, o usuário sempre quiser aprender ao categorizar (considerar parâmetro `aprender=true` no PUT, ou unificar).

---

## ADR-018 — Sugestão de categoria embutida no GET, com 1 query em lote

**Data:** 2026-10-21
**Status:** Decidido

### Contexto

Com a tabela `aprendizados` (ADR-008) alimentada pela categorização, o app pode sugerir a subcategoria de lançamentos ainda não categorizados. Era preciso decidir onde a sugestão aparece e como buscá-la sem degradar o desempenho.

Opções consideradas:
- **A:** Endpoint separado (`GET /lancamentos/<id>/sugestao`) — o frontend faz 1 chamada por lançamento
- **B:** Campo embutido em cada lançamento do `GET /lancamentos`, buscado em lote
- **C:** Campo embutido, mas com 1 query por lançamento (N+1)

### Decisão

**Opção B.** Todo lançamento traz a chave `subcategoria_sugerida`:
- Sem categoria + padrão aprendido → `{id, nome, categoria_macro_id, categoria_macro_nome, confianca}`
- Sem categoria + nenhum aprendizado → `null`
- Já categorizado → `null` (não precisa de sugestão)

A busca é **uma única query** para a lista inteira: os padrões dos lançamentos sem categoria são normalizados, deduplicados e consultados com `WHERE padrao_descricao IN (?, ?, …)`, já com JOIN em `subcategorias` e `categorias_macro` (os nomes vêm na mesma ida ao banco). O resultado vira um dict em memória e é distribuído para os lançamentos.

O mesmo enriquecimento é aplicado nas respostas de lançamento único (POST, PUT, categorizar), para que o lançamento tenha **o mesmo formato em qualquer endpoint**.

### Justificativa

1. **Uma requisição só** para a tela de importação/histórico: o frontend recebe a lista pronta para exibir "sugerido: Equipamento".
2. **Evita o N+1:** com 1 query por lançamento, um mês com 80 lançamentos faria 80 consultas. Medido nos testes: um GET de 27 lançamentos executa 2 queries no total, 1 em `aprendizados`.
3. **Chave sempre presente** (mesma convenção dos campos de parcela): o frontend não precisa checar existência, só `null`.

### Trade-offs aceitos

- O GET faz trabalho extra mesmo quando o frontend não exibe sugestões (custo: 1 query).
- Respostas de lançamento único fazem 1 query extra para manter o formato uniforme.
- A lista do `IN (...)` cresce com o número de padrões distintos do mês — muito abaixo do limite de variáveis do SQLite (32 766).

### Reabrir se:

- O volume de lançamentos por consulta crescer a ponto de a lista do `IN` pesar (considerar JOIN direto com uma coluna de padrão materializada em `lancamentos`).

---

## ADR-019 — Regras de aprendizado e normalização do padrão

**Data:** 2026-10-21
**Status:** Decidido

### Contexto

O endpoint `POST /lancamentos/<id>/categorizar` (ADR-017) atribui a subcategoria **e** alimenta `aprendizados`. Era preciso definir o que acontece em cada combinação de estado, e consolidar a normalização do padrão prevista na ADR-008.

### Decisão

**1. Normalização do padrão** (`normalizar_padrao`), estendendo a ADR-008:
- Remove o sufixo `" - Parcela X/Y"` (o que o parser grava, Etapa 2).
- Remove números **soltos** no final, inclusive com `.` e `,`: regex `(\s+\d[\d.,]*)+\s*$` — `"UBER 12,50"` → `"uber"`. Exigir espaço antes evita cortar `"...SUB 110,00ANTHROPIC.C"`.
- **Extensão:** junta espaços repetidos e aplica `casefold()` (com normalização Unicode NFC). Só na chave de aprendizado; a descrição do lançamento não muda.

**2. Ações ao categorizar** (`acao` na resposta, em português como o resto da API):

| Situação | `acao` | `confianca` |
|---|---|---|
| Padrão sem aprendizado | `criado` | 1 |
| Aprendizado na **mesma** subcategoria | `reforcado` | +1 |
| Aprendizado em **outra** subcategoria | `sobrescrito` | volta a 1 |
| Lançamento **já estava** nessa subcategoria e o aprendizado já aponta para ela | `inalterado` | sem mudança |
| `subcategoria_id: null` e o aprendizado aponta para a subcategoria **que o lançamento tinha** | `apagado` | null |
| `subcategoria_id: null` sem aprendizado, ou aprendizado de **outra** subcategoria | `nenhuma` | null |

**3. Implementação atômica:**
- Criar/reforçar/sobrescrever é **uma única instrução**: `INSERT … ON CONFLICT (padrao_descricao) DO UPDATE SET confianca = CASE WHEN aprendizados.subcategoria_id = excluded.subcategoria_id THEN confianca + 1 ELSE 1 END, …  RETURNING confianca`.
- Atualizar o lançamento e o aprendizado acontece **numa só transação**: nunca fica um lançamento categorizado sem o aprendizado correspondente, nem o contrário.

### Justificativa

1. **casefold e espaços:** importados vêm sempre em maiúsculas do banco, mas manuais são digitados à mão — sem isso, "Padaria", "padaria" e "Padaria  Central" seriam padrões diferentes. Cumpre o "Reabrir se" da ADR-008 (muitos aprendizados quase iguais).
2. **`reforcado` / `sobrescrito`:** a confiança mede quantas confirmações seguidas o padrão tem; uma troca de opinião do usuário zera a contagem na nova subcategoria.
3. **`inalterado`:** clique duplo, ou recategorizar para a mesma subcategoria, não traz informação nova — não deve inflar a confiança. A confiança conta **lançamentos distintos** que confirmam o padrão.
4. **`apagado` só do que o lançamento alimentou:** descategorizar um lançamento que estava em "Mercado" (por PUT silencioso) não deve apagar um aprendizado "Equipamento" com confiança 5 construído por outros lançamentos.
5. **Atomicidade:** a mesma filosofia do upsert de tetos (ADR-014) — sem janela entre ler e escrever.

### Trade-offs aceitos

- `casefold()` funde padrões que só diferem em maiúsculas — desejado. Acentos **não** são ignorados ("ACAI" ≠ "AÇAÍ"), mantendo a mesma regra das subcategorias (ADR-012).
- Um padrão tem uma única subcategoria (UNIQUE em `padrao_descricao`): lojas que vendem de tudo (ex: supermercado com roupas) vão alternar entre `sobrescrito` e confiança baixa.
- Remover números finais pode juntar lançamentos distintos de uma mesma loja (ex: filiais "LOJA X 01" e "LOJA X 02") — desejado na maioria dos casos.

### Reabrir se:

- Padrões ambíguos (lojas multi-categoria) gerarem sugestões erradas com frequência (considerar várias subcategorias por padrão, com contagem).
- Surgir necessidade de ignorar acentos também no padrão.

---

## ADR-020 — Sugestão a partir de 1 confirmação (threshold = 1 na v1)

**Data:** 2026-10-21
**Status:** Decidido

### Contexto

Com a `confianca` registrada por padrão (ADR-019), era preciso decidir a partir de quantas confirmações uma sugestão aparece.

Opções consideradas:
- **A:** Threshold fixo maior (ex: só sugere com confiança ≥ 3)
- **B:** Sugerir sempre que o padrão existir (threshold = 1) e deixar o frontend decidir a apresentação pela `confianca`
- **C:** Auto-categorizar (aplicar sem perguntar) acima de um threshold

### Decisão

**Opção B.** A sugestão aparece sempre que existe aprendizado para o padrão, com a `confianca` no payload. O backend **nunca categoriza sozinho**: a sugestão só vira categoria quando o usuário confirma (via `categorizar`, o que reforça o aprendizado).

### Justificativa

1. **Utilidade imediata:** num app pessoal, a maioria dos padrões aparece poucas vezes por mês; exigir 3 confirmações faria a sugestão demorar meses para surgir.
2. **Separação de responsabilidades:** o backend informa (`confianca`), o frontend decide a forma (ex: confiança 1 = sugestão discreta; ≥ 3 = destaque com "aceitar" em um toque).
3. **Sem risco de erro silencioso:** como nada é aplicado automaticamente, uma sugestão errada custa um toque, não um gasto mal categorizado sem o usuário perceber.
4. **Ajustável sem migração:** mudar o threshold é uma regra no frontend (ou um filtro no backend), sem tocar no banco.

### Trade-offs aceitos

- Sugestões com confiança 1 podem estar erradas (uma categorização atípica vira sugestão). Mitigado pela exibição graduada e pelo `sobrescrito`, que corrige na próxima confirmação diferente.
- Toda sugestão exige uma ação do usuário — sem auto-categorização na v1.

### Reabrir se:

- Sugestões de confiança baixa gerarem ruído na prática (subir o threshold).
- O usuário quiser auto-categorização para padrões muito confiáveis (Opção C, com limite alto e possibilidade de desfazer).

---

## ADR-021 — Dashboard agregado e categoria virtual "Sem categoria"

**Data:** 2026-10-22
**Status:** Decidido

### Contexto

A tela principal do app responde "estou no controle este mês?". Ela precisa de total gasto, orçamento, situação de cada categoria e os lançamentos recentes. Montar isso no frontend exigiria várias chamadas (lançamentos, tetos, categorias) e duplicaria regras de cálculo no cliente.

### Decisão

**Um endpoint agregado, `GET /dashboard?mes=&ano=`**, que devolve tudo calculado:

- `dias_restantes_no_mes` — mês passado: 0; mês atual: último dia − hoje (sem contar hoje); mês futuro: o mês inteiro.
- `hero` — total do mês vs orçamento (cálculo na ADR-022).
- `quantidade_sem_categoria` / `valor_sem_categoria` — atalho para o aviso "X lançamentos para categorizar".
- `categorias` — breakdown com **9 itens sempre**: as 8 macro + a categoria **virtual** "Sem categoria".
- `ultimos_lancamentos` — os 3 mais recentes, no mesmo formato do `GET /lancamentos` (JOIN + sugestão), ordenados por data, `criado_em` e id (DESC).

**Formato uniforme dos itens:** todos têm as mesmas chaves — `categoria_macro`, `categoria_virtual_nome`, `gasto`, `quantidade`, `teto`, `percentual`, `status`, `diferenca` (`teto − gasto`: positivo sobrou, negativo estourou), `convite_definir_teto`.
- Macro reais: `categoria_virtual_nome: null`; `convite_definir_teto: true` só quando não há teto (nem herdado).
- "Sem categoria": `categoria_macro: null`, `categoria_virtual_nome: "Sem categoria"`, `status: "sem_teto"`, `convite_definir_teto: false` (não é possível definir teto para ela). **Sempre presente**, mesmo com gasto 0 e quantidade 0.
- Macro sem lançamentos no mês aparecem com `gasto: 0` e `quantidade: 0`.

**"Sem categoria" é virtual:** não existe em `categorias_macro`; é montada em memória a partir da linha `NULL` do `GROUP BY`.

### Justificativa

1. **Uma requisição por tela**, com os números já consistentes entre si (o frontend não faz conta e não diverge).
2. **"Sem categoria" no breakdown:** o hero mostra o total real (tudo que saiu); sem a categoria virtual, a soma das barras não fecharia com o total, e o usuário não veria quanto ainda falta categorizar. Virtual, e não uma 9ª macro, para não violar a ADR-005 (8 macro fixas) nem aceitar teto.
3. **Formato fixo e item sempre presente:** o frontend renderiza sem `if` de existência — uniformidade vale mais que economizar um item vazio.

### Desempenho

**De 15 a 20 SELECTs** por chamada: 1 agregada para gasto/quantidade por macro; 1 + 1 ou 2 por macro para os tetos efetivos (reaproveitando `tetos.listar_tetos`: 1 se a macro tem teto próprio no mês, 2 se precisa buscar a herança da ADR-013); 1 para os últimos lançamentos e 1 para as sugestões (só se houver lançamento sem categoria). **Máximo de 20**, quando todos os tetos são herdados (medido nos testes da ADR-024). Aceitável: é uma chamada por tela, num SQLite local, e não um N+1 por item. Reaproveitar `listar_tetos` mantém a regra de herança num único lugar.

### Trade-offs aceitos

- Até 20 queries quando uma versão dedicada faria ~4.
- A lista inline dos lançamentos sem categoria (alternativa "D3") ficou de fora: o dashboard traz só contagem e valor; a lista vem de `GET /lancamentos?sem_categoria=true`.
- "Hoje" é o relógio do servidor (mesmo TODO de fuso da ADR-015).

### Reabrir se:

- O dashboard ficar lento (otimizar `listar_tetos` para uma query única com window function).
- O frontend precisar da lista de não categorizados no próprio dashboard (opção D3).

---

## ADR-022 — Status por threshold e cálculo do hero

**Data:** 2026-10-22
**Status:** Decidido

### Contexto

Cada categoria (e o hero) precisa de um status visual simples. E o hero tem uma armadilha: o total gasto inclui categorias sem teto, mas o orçamento só soma os tetos existentes — dividir um pelo outro mistura grandezas diferentes (ex: só Alimentação com teto de 800 e R$ 1.699 gastos no total daria "212% estourado", com Alimentação dentro do teto).

### Decisão

**1. Status de uma categoria** (`classificar(gasto, teto)`), com `THRESHOLD_QUASE_NO_TETO = 0.80` no topo de `dashboard.py`:

| Situação | `status` | `percentual` |
|---|---|---|
| teto `null` (nem definido nem herdado) | `sem_teto` | `null` |
| teto `0` e gasto `0` | `folgado` | `0` |
| teto `0` e gasto `> 0` | `estourado` | `null` (seria infinito) |
| gasto/teto `> 1` | `estourado` | gasto/teto × 100 |
| `0,80 ≤` gasto/teto `≤ 1` | `quase_no_teto` | idem |
| gasto/teto `< 0,80` | `folgado` | idem |

O status usa a razão **sem arredondar**; o `percentual` (2 casas) é só exibição. Assim, 100,004% é `estourado` mesmo aparecendo como `100.0`. Exatamente 100% é `quase_no_teto` (gastou tudo, mas não passou).

**2. Cálculo do hero (fluxo):**

1. `total_gasto` = soma de **todos** os lançamentos do mês (tudo que saiu, inclusive sem categoria)
2. `gasto_com_teto` = soma do gasto **só das macro com teto** (definido ou herdado; teto 0 conta)
3. `total_teto` = soma **só dos tetos existentes** (definidos ou herdados)
4. `gasto_sem_teto` = `total_gasto − gasto_com_teto` (macro sem teto + "Sem categoria")
5. **SE** `total_teto == 0`: `percentual_uso = null`, `status = "sem_teto"`
6. **SENÃO**: `percentual_uso = gasto_com_teto / total_teto × 100`, `status` pela mesma regra do item 1

Todos os valores em reais são arredondados a 2 casas; `gasto_sem_teto` é calculado no backend para o frontend não precisar derivá-lo (e divergir).

### Justificativa

1. **80%** dá tempo de reagir antes de estourar; constante nomeada para ajustar com o uso.
2. **Comparar só o comparável:** `percentual_uso` relaciona o gasto que *tem* orçamento com o orçamento — o indicador continua honesto mesmo com tetos incompletos. O total real continua visível em `total_gasto`, e o que está fora do orçamento, em `gasto_sem_teto`.
3. **Teto 0** é uma decisão válida ("não gastar nada", ADR-013): sem gasto está ok; qualquer gasto é estouro, sem percentual infinito no JSON.
4. **Razão sem arredondar** evita status incoerente com o valor real nas fronteiras.

### Trade-offs aceitos

- **O hero agrega e pode esconder um estouro:** com Alimentação em 204% e outras macro com teto sobrando, o hero mostra ~94% (`quase_no_teto`). O breakdown (ordenado pela ADR-023, estourados primeiro) é onde o estouro aparece; o frontend deve exibir os dois.
- Se todos os tetos definidos forem 0, `total_teto == 0` e o hero fica `sem_teto`, mesmo havendo decisão explícita de "não gastar" — caso raro, aceito pela simplicidade do fluxo.

### Reabrir se:

- O usuário achar 80% cedo ou tarde demais (ajustar a constante).
- O hero esconder estouros na prática (considerar status do hero = pior status entre as categorias).

---

## ADR-023 — Ordenação do breakdown por status

**Data:** 2026-10-22
**Status:** Decidido

### Contexto

O breakdown tem 9 itens. A ordem canônica (ADR-005) é estável, mas não responde "o que precisa da minha atenção agora?".

### Decisão

Ordenar por grupo de status e, dentro dele, por urgência:

1. **`estourado`** — percentual DESC (teto 0 com gasto, percentual `null`, conta como infinito e vem primeiro)
2. **`quase_no_teto`** — percentual DESC
3. **`folgado`** — percentual DESC (o menos folgado primeiro, perto dos "quase")
4. **`sem_teto`** — por `categoria_macro.id` (ordem canônica da ADR-005)
5. **"Sem categoria"** — sempre o último item

Empates de percentual são desempatados pelo id da macro (ordem determinística).

### Justificativa

1. **Atenção primeiro:** o que estourou ou está perto aparece no topo, sem o usuário procurar.
2. **Folgados em DESC** formam uma gradação contínua a partir dos "quase" — o próximo a virar problema fica logo abaixo deles.
3. **`sem_teto` no fim**, com o convite para definir teto (`convite_definir_teto`): é configuração pendente, não alerta.
4. **"Sem categoria" por último:** não é uma categoria de orçamento, é um lembrete de trabalho pendente.
5. **Ordem determinística** (desempate por id): a lista não "pula" entre recarregamentos com valores iguais.

### Trade-offs aceitos

- A posição de cada macro muda ao longo do mês conforme o gasto — o usuário não decora "Lazer é a 2ª linha". Para quem prefere posição fixa, a ordem canônica fica disponível em `GET /tetos` e `GET /categorias/macro`.

### Reabrir se:

- O usuário preferir posição fixa no dashboard (oferecer as duas ordens, com a escolha no frontend).

---

## ADR-024 — Testes automatizados: pytest, cobertura mínima e CI

**Data:** 2026-10-22
**Status:** Decidido

### Contexto

Até a Etapa 10, cada etapa foi validada com scripts avulsos (mais de 200 verificações), executados um a um e guardados em `backend/tests/legado/`. Não havia um comando único para rodar tudo, nem execução automática: qualquer mudança no backend — inclusive as que o frontend vai exigir — podia quebrar algo sem aviso.

### Decisões

**1. Framework: pytest** (+ `pytest-cov` para cobertura e `pytest-mock` para simular dependências). É o padrão de fato em Python: fixtures, parametrização e relatórios legíveis.

**2. Localização e organização: `tests/` na raiz**, separado do código de produção:

| Pasta | O que testa |
|---|---|
| `tests/unit/` | Funções puras: parser (com `pdfplumber` simulado), normalização do padrão, validadores, regras do dashboard e das categorias |
| `tests/integration/` | Um arquivo por recurso: schema, importação, categorias, tetos, lançamentos, aprendizados, dashboard — módulos de `app/db/` e endpoints via `test_client` |
| `tests/e2e/` | Fluxos de vários passos: importar → categorizar → sugerir → reimportar → dashboard |

Configuração em `pyproject.toml` (`pythonpath = ["backend"]`, `--import-mode=importlib`, `--strict-markers`). Dependências de teste em `requirements-dev.txt` (`-r requirements.txt` + ferramentas), para o deploy da API não instalá-las.

**3. Isolamento e determinismo (fixtures em `tests/conftest.py`):**
- **Banco temporário em todo teste que toca dados:** `monkeypatch` em `inicializar.CAMINHO_BANCO`. Funciona porque todo acesso passa por `conectar()`, que lê o atributo na hora da chamada — nenhum módulo importa o caminho diretamente. O `financas.db` real nunca é aberto.
- **"Hoje" congelado em 2026-10-22** (`hoje_fixo`, automática): a janela de 90 dias (ADR-015) e os dias restantes (ADR-021) não quebram quando o mês vira.
- **Pasta temporária vigiada** (`pasta_temp_monitorada`, automática): o upload do PDF é gravado numa pasta do teste; se sobrar algum `.pdf`, o teste falha.
- **Factory de lançamentos** (`lancamento_manual`) que grava direto no banco, inclusive com `origem="fatura"` e datas fora da janela — os testes de lançamentos e aprendizados não dependem do PDF.

**4. A fatura real fica fora do Git e do CI.** O PDF tem dados sensíveis. Testes que o usam recebem a fixture `fatura_teste`, que lê `FATURA_PDF_PATH` e **pula o teste** se a variável não existir; esses testes ganham automaticamente o marcador `fatura_real`. O parser continua coberto no CI pelos testes unitários com `pdfplumber` simulado. Uma fatura sintética (mock do layout Bradesco) ficou como ideia para etapa futura.

**5. Convenções:** todo teste tem uma docstring de 1 linha descrevendo o cenário (aparece no relatório de falha); fronteiras e listas de entradas inválidas usam `@pytest.mark.parametrize`, com `ids` legíveis.

**6. Cobertura mínima de 80%** (`fail_under` no `pyproject.toml`), com o relatório listando as linhas descobertas. Na migração: **98,93%** (748 instruções, 8 descobertas — todas proteções contra concorrência, como `UNIQUE` disparado depois da checagem em Python).

**7. CI no GitHub Actions** (`.github/workflows/tests.yml`): a cada push (qualquer branch) e pull request, em `ubuntu-latest` com **Python 3.13** — o menor suportado, alinhado com a máquina principal; o desenvolvimento local pode usar 3.13 ou mais novo. Instala `requirements-dev.txt` e roda `pytest --cov`; o job falha se algum teste falhar ou se a cobertura ficar abaixo de 80%.

**8. Migração completa e remoção dos legados.** Todos os scripts de `backend/tests/legado/` foram portados (330 testes no total; 318 rodam no CI, 12 dependem da fatura real) e a pasta foi apagada, para ninguém rodar a versão antiga por engano.

### Justificativa

1. **Um comando** (`pytest`) valida o backend inteiro em ~1 minuto, localmente e no CI.
2. **Isolamento total** (banco e pasta temporários, data congelada): os testes são repetíveis, não dependem da máquina nem do dia, e nunca tocam dados pessoais.
3. **80% é piso, não meta:** evita regressão de cobertura sem incentivar testes artificiais; as 8 linhas descobertas exigiriam simular corridas.
4. **CI em toda branch:** permite validar uma mudança numa branch antes de levá-la à `main` — foi assim que esta própria etapa foi validada.

### Trade-offs aceitos

- O CI não exercita o PDF real: uma mudança de layout do Bradesco só é pega pelos testes `fatura_real` na máquina do dev (e pelo `total_confere` em produção, ADR-009).
- O Python mais novo (3.14) não roda no CI; só a máquina do trabalho o usa.
- A data congelada não testa o "hoje" de verdade — a lógica de data é testada com datas explícitas.

### Reabrir se:

- O layout da fatura mudar ou surgir outro banco (criar a fatura sintética para o CI).
- O frontend ganhar testes próprios (decidir se entram neste workflow ou num separado).
- O tempo da suíte passar de alguns minutos (separar testes lentos com marcador).

---

## ADR-025 — CORS: origens de desenvolvimento em lista fechada

**Data:** 2026-11-08
**Status:** Decidido

### Contexto

O frontend PWA (Etapa 12) será servido em outra origem (outra porta) e consumirá a API em `http://127.0.0.1:5000`. Sem headers CORS, o browser impede o JavaScript de ler as respostas.

### Decisões

**A. Origens em lista fechada** (`ORIGENS_PERMITIDAS`, no topo de `backend/main.py`): `localhost` e `127.0.0.1` nas portas 5500 (Live Server) e 8000 (`http.server`). As duas formas de host entram porque o browser as trata como origens diferentes.

**B. Métodos e headers no padrão permissivo do flask-cors**, aplicado a todas as rotas.

**C. `always_send=False`:** o padrão do flask-cors devolve a primeira origem da lista mesmo a quem não envia `Origin`. Sem `Origin`, a resposta sai sem headers CORS.

### Justificativa

1. Lista fechada em vez de `*`: a API lida com dados financeiros pessoais, e só estes dois servidores de desenvolvimento são usados.
2. Restringir métodos e headers não acrescentaria proteção: o frontend usa todos os verbos da API, e a lista precisaria ser mantida a cada mudança.
3. Constante no código: com 4 origens fixas de desenvolvimento, variável de ambiente seria complexidade sem uso.

### Trade-offs aceitos

- **Segurança em camadas, com a origem como camada principal:** qualquer método e header é aceito, mas só das origens da lista.
- **CORS não impede a execução, só a leitura:** a origem fora da lista recebe a resposta sem `Allow-Origin`, e quem bloqueia é o browser. PUT, DELETE e POST com JSON passam por preflight e são barrados antes do envio; POST de formulário ou multipart não tem preflight. Como a API aceita formulário e não tem autenticação, uma página maliciosa aberta na máquina do dev consegue criar lançamentos ou importar fatura em `127.0.0.1:5000`, sem ler o retorno. O risco já existia antes do CORS e é limitado ao ambiente local.
- **`file://` não funciona:** o browser envia `Origin: null`, fora da lista; o frontend precisa ser servido por um dos dois servidores.

### Reabrir se:

- Houver deploy em produção: adicionar o domínio real, considerar variável de ambiente para as origens e, junto com autenticação, exigir JSON nas escritas ou adicionar proteção CSRF.
- O frontend passar a usar outra porta ou servidor de desenvolvimento.

---

## ADR-026 — Arquitetura do frontend PWA

**Data:** 2026-11-10 (decisões, 12.1) / 2026-11-11 (implementação, 12.2)
**Status:** Decidido

### Contexto

A Etapa 12 implementa o frontend PWA que consome a API Flask (CORS habilitado na Etapa 11.5, ADR-025). As decisões abaixo foram tomadas na sub-etapa 12.1, antes de qualquer código, e ajustadas no setup da 12.2 com o que a implementação revelou.

### Decisões

**A. Stack: Alpine.js (CDN)**
- HTML + CSS + JavaScript simples, sem build process
- Alpine.js 3.x via CDN para reatividade declarativa
- Zero dependências de desenvolvimento (npm/yarn)
- **(12.2) Versões exatas, nunca `@3.x`:** Alpine.js 3.17.5 e Tabler Icons 3.51.0, ambos do cdnjs, com `integrity` (SRI) e `crossorigin="anonymous"`. Atualizar é uma decisão explícita: trocar a versão e o hash juntos.

**B. Estrutura: SPA (Single Page Application)**
- Um `index.html` com as 4 telas como `<section>`
- Alpine gerencia qual seção está visível via `x-show`; `x-cloak` evita as 4 telas piscarem antes de o Alpine iniciar
- Zero recarregamento de página

**C. Estado: híbrido (store global + locais)**
- `Alpine.store('app')` para dados compartilhados: `telaAtiva`, `mes`, `ano`, `categorias`, `tetos`, além de `carregando` e `erroApi` (faixa de erro quando o backend não responde)
- Cada tela tem seu próprio estado via `Alpine.data()` (`js/telas/`)
- `trocarMes` normaliza mês fora de 1–12 (ex.: mês 13 → janeiro do ano seguinte) e recarrega os tetos, que dependem do mês (herança, ADR-013)
- **(12.2) Registro no evento `alpine:init`, sem `Alpine.start()`.** A build CDN do Alpine se inicializa sozinha ao carregar; chamar `Alpine.start()` de novo o iniciaria duas vezes. Por isso:
  - store e telas são registrados em `document.addEventListener('alpine:init', ...)`, que dispara antes de o Alpine processar o HTML;
  - a carga inicial (categorias + tetos) fica no `init()` do store, chamado automaticamente pelo Alpine;
  - ordem dos scripts, todos com `defer`: `api.js` → `telas/*.js` → `app.js` → **Alpine por último**.

**D. Chamadas à API: fetch nativo**
- Módulo `js/api.js` centraliza todas as rotas do backend
- `BASE_URL` em constante (futura variável de ambiente)
- **(12.2) Script comum, não módulo ES:** sem build, é o que deixa `api` global — inclusive no console do navegador (`await api.categorias()`), útil para depuração
- **(12.2) Tratamento no helper:** erro HTTP vira `Error("409: <mensagem do backend>")`, com o `{"erro": ...}` da API (status e dados também ficam no objeto do erro); respostas 204 (DELETE) não são lidas como JSON; o upload da fatura usa `FormData` sem `Content-Type` manual (o navegador gera o boundary do multipart). Falha de rede (`TypeError`) vira mensagem amigável no store.

**E. Design system: minimalista preto-e-branco com arquitetura futura**
- Visual E1 (P&B) implementado agora
- Variáveis CSS em 3 camadas: **base** (cores primitivas), **tema** (papéis: fundo, texto, borda, estados do teto) e **categorias** (uma por macro); componentes usam só tema e categorias
- Camada de categorias existe, mas aponta para o neutro na v1 (preparo para E2)
- Camada de tema prepara o dark mode futuro (E3)
- Espaçamento em múltiplos de 4px; fonte do sistema e monoespaçada (tabular) para números

**F. Navegação: bottom bar fixa**
- Barra inferior com 5 posições: Dashboard, Histórico, **+** (Registrar), Importar, Configurações
- Botão + destacado (preto sólido, circular, 48px)
- Ícones Tabler via webfont
- **(12.2) Acessibilidade:** `<button>` reais com `aria-label` (só ícone) e `aria-current="page"` na tela ativa; foco visível por teclado. Configurações aparece desativada (`disabled`, "Em breve") até a tela existir
- **(12.2) Safe area:** a barra e o conteúdo usam `env(safe-area-inset-bottom)` — a barra não fica sob a área de gestos do iPhone e não cobre o fim do conteúdo

### Justificativa

1. Stack simples casa com o princípio "fricção baixa" da v1
2. SPA é essencial para a sensação de app nativo
3. Estado híbrido evita duplicação (tudo local) e inchaço (tudo global)
4. fetch nativo evita dependência externa para operações simples
5. E1 com arquitetura futura = velocidade agora + preparo para evoluir sem retrabalho
6. Bottom bar é o padrão mobile ergonomicamente superior
7. Versões exatas + SRI: um CDN comprometido ou uma versão nova com mudança incompatível não altera o app em silêncio

### Validação (12.2)

- Por linha de comando: arquivos servidos na porta 5500; CORS conferido com `Origin: http://127.0.0.1:5500` e `http://localhost:5500` (GET e preflight de POST com JSON) e recusado para origem não listada
- No navegador: console sem erros, navegação entre as 4 telas, destaque da tela ativa, `await api.categorias()` retornando as 8 macro e o store exibindo "8 categorias carregadas da API"
- Sem testes automatizados de frontend nesta etapa (etapa própria futura); o CI continua validando o backend

### Trade-offs aceitos

- Alpine.js e Tabler Icons são dependências externas via CDN
- **Offline (Etapa 12.7, Service Worker):** os arquivos de CDN precisarão entrar no cache do Service Worker ou virar cópia local (vendor) para o app funcionar offline. No Tabler 3.51, o CSS carrega a fonte dividida em dezenas de `.woff2` sob demanda — o cache precisa cobri-los (ou usar só os ícones necessários)
- SPA precisa de "mini-router" manual (Alpine `x-show` resolve)
- O mini-router não lida com o botão voltar do navegador nem com links diretos para uma tela (aceito para a v1)
- CSS mais estruturado hoje = mais linhas, mas preparado para evoluir
- Sem build, o JavaScript fica em escopo global compartilhado entre scripts — `api.js` usa uma IIFE e expõe só `window.api`
- Sem Node na máquina do trabalho, não há checagem de sintaxe JS por linha de comando: a validação é pelo console do navegador

### Reabrir se:

- O volume de código JS crescer muito (> 1000 linhas) — considerar um framework completo
- A PWA for validada e Gabriel decidir evoluir sem Flutter — migrar para React/Vue
- Aparecer necessidade de deep links (URL por tela) — adicionar `history.pushState`
- A arquitetura E2 (cores por categoria) for pedida — etapa própria
- A arquitetura E3 (dark mode) for pedida — etapa própria
- Chegar a Etapa 12.7 — decidir cache vs. vendor dos CDNs; incluir `manifest.json`, ícones e `favicon` (hoje o `favicon.ico` dá 404, sem efeito no app)

---

## ADR-027 — Dashboard: exibição, estados e formatação

**Data:** 2026-11-11 (decisões e implementação, 12.3)
**Status:** Decidido

### Contexto

Primeira tela do frontend com dados reais. O backend já calcula e ordena tudo em `GET /dashboard` (ADRs 021–023): hero, breakdown das 8 macro + "Sem categoria" e os 3 últimos lançamentos. O frontend **só exibe**: não recalcula valores nem reordena categorias. Os nomes de campo usados são os do `dashboard.py` (ex.: "sem nenhum teto" é `hero.total_teto === 0`; `convite_definir_teto` existe por categoria, não no hero).

### Decisões

**A. Navegação de mês compartilhada com o store**
- Chevrons ‹ › no cabeçalho chamam `$store.app.trocarMes` (que já trata a virada dez → jan); o mês exibido é o do store, o mesmo das outras telas.
- Fora do mês atual, faixa discreta "Mês encerrado" ou "Mês futuro" com o atalho "Voltar para hoje"; no mês atual, não aparece.
- Cabeçalho "Olá, Gabriel" (`NOME_USUARIO`, v1 monousuário) e o mês por extenso ("Novembro 2026").

**B. Hero**
- **Com tetos:** "R$ X de R$ Y" com `gasto_com_teto` / `total_teto`, barra pelo `status` do hero e "N% do orçamento · <prazo>". Prazo: "faltam N dias" (ou "falta 1 dia" / "último dia do mês"), "mês fechado" no passado, "mês ainda não começou" no futuro.
- **Tetos parciais:** a barra mede só o gasto com teto; abaixo, "Em categorias sem teto: + R$ Z" (`gasto_sem_teto`) e "Total do mês: R$ T" — o total real nunca some (ADR-022).
- **Sem nenhum teto:** total do mês, sem barra, e convite só em texto: "Defina tetos por categoria para saber se está no controle."
- Barras limitadas a 100% de largura.

**C. Lista de categorias (na ordem do backend, ADR-023)**
- Visíveis: gasto > 0 **ou** teto definido. Cada linha: nome, "R$ gasto de R$ teto" e mini-barra pela cor do status (`quase_no_teto` usa as variáveis de "alerta"); estourada mostra "+R$ X acima do teto"; com gasto e sem teto, "R$ X · sem teto", sem barra.
- Teto 0 com gasto (percentual `null`, ADR-022): barra cheia vermelha. Teto 0 sem gasto: barra vazia.
- "Sem categoria" com valor aparece no fim da lista visível como "R$ X · N para categorizar"; com 0, vai para o recolhido.
- As demais (sem gasto e sem teto) ficam numa linha "N categorias sem movimento", que expande ao tocar. Em mês vazio, essa linha não aparece.
- A borda esquerda de cada categoria usa a camada 3 do CSS (`--cor-cat-*`, neutra na v1 — pronta para E2).

**D. Estados visualmente distintos**
- **Primeira carga** (sem dados ainda): "Carregando…".
- **Troca de mês:** o conteúdo anterior fica com opacidade reduzida até o novo chegar (sem piscar).
- **Erro:** faixa vermelha do store (ADR-026) + botão "Tentar de novo" na tela; uma busca bem-sucedida limpa a faixa.
- **Mês vazio** (todas as categorias com `quantidade` 0): hero em R$ 0,00 e "Nenhum gasto em <mês> ainda. Toque no + para registrar."

**E. Formatação centralizada em `js/util/formatadores.js`** (`window.formatar`, script comum como o `api.js`):
- `dinheiro` com `Intl.NumberFormat('pt-BR', BRL)` → "R$ 1.240,50" (espaço inquebrável após o "R$").
- `percentual` inteiro **arredondado para baixo**: 99,6% não aparece como "100%" sem o teto ter sido atingido.
- `dataCurta` **fatia o texto** "2026-11-03" → "03/11", sem `Date`: `new Date("2026-11-03")` é UTC e mostraria 02/11 no fuso de Brasília.
- `mes` monta `new Date(ano, mes - 1, 1)` (fuso local) → "Novembro 2026".
- Valores em fonte monoespaçada (classe `.numero`).

**F. Atualização sem cache**
- Busca `/dashboard` quando a tela fica visível e quando o mês muda.
- **(12.3) Uma chave única `ano-mes`** no `$watch`: na virada dez → jan, mês e ano mudam juntos e duas observações separadas disparariam duas buscas.
- **(12.3) Tela escondida não busca:** se o mês mudar em outra tela, o Dashboard recarrega ao voltar a ficar visível.
- **(12.3) Número de sequência:** só a resposta da busca mais recente é aplicada — cliques rápidos nos chevrons não deixam um mês antigo sobrescrever o atual.

### Justificativa

1. Exibir sem recalcular mantém uma única fonte de verdade (o backend testado, ADR-024) — o frontend não diverge dos números.
2. Mostrar o total real ao lado do gasto com teto evita a leitura enganosa de um hero "folgado" que esconde gasto fora do orçamento.
3. Recolher as categorias zeradas mantém o foco no que tem movimento, sem esconder que elas existem.
4. Estados distintos evitam tela em branco ou piscando — a troca de mês parece instantânea.
5. Formatação centralizada evita divergência entre telas e o erro clássico de fuso com datas ISO.

### Validação (12.3)

- **Headless (Edge):** a tela foi renderizada de verdade com a API real e com a demonstração, em 6 cenários (mês com tetos parciais e estouros, mês vazio com tetos herdados, mês futuro, mês sem tetos, mês atual vazio, API fora do ar), conferidos por screenshot.
- **Navegador (Gabriel):** os dois modos do roteiro, virada de ano com uma única requisição, cliques rápidos, console sem erros e largura de celular sem corte.
- **Backend inalterado:** 338 testes passando.

### Ferramenta de demonstração

`scripts/demo_dashboard.py` sobe a API num banco **novo, com dados fictícios** (nunca abre nem copia o `financas.db` real), com todos os cenários relativos ao mês atual — serve para testar as telas e demonstrar o app sem dados pessoais. Aceita `--porta` e **recusa porta ocupada**: no Windows, o Flask sobe numa porta já em uso sem acusar erro, e as requisições iriam para o outro servidor (com o banco real). Não é coletado pelo pytest nem entra na cobertura.

### Trade-offs aceitos

- **Duas requisições por troca de mês** (`/tetos` pelo store e `/dashboard` pela tela); o Dashboard não usa os tetos do store hoje, mas as próximas telas vão usar.
- **Sem skeleton:** a primeira carga é só "Carregando…" — suficiente com a API local.
- **Convite sem botão** enquanto a tela de editar tetos não existir.
- **Sem cache:** toda visita refaz a busca.
- **Amarelo de alerta** (`--amarelo-dark`) com aparência de mostarda na barra.
- **"R$ 0,00 de R$ 0,00"** para teto zero sem gasto.
- Lançamentos importados aparecem com o dia 01 (ADR-007), o que pode estranhar à primeira vista.
- A validação headless não cobre cliques nem larguras abaixo de ~500 px (limite do Windows); esses ficam no teste manual.

### Reabrir se:

- Registrar e Histórico existirem: rever as duas requisições por troca de mês (se ninguém usar os tetos do store, buscar só sob demanda).
- A rede hospedada deixar a primeira carga lenta: skeleton no polimento.
- A tela de tetos existir: botão no convite.
- O recarregamento ficar perceptível: cache por mês, invalidado nas escritas.
- Polimento visual: revisar o tom do amarelo de alerta; trocar "R$ 0,00 de R$ 0,00" por um texto como "sem gastos permitidos".

---

## ADR-028 — Registrar gasto: descrição automática, subcategoria obrigatória e máscara de centavos

**Data:** 2026-11-19 (decisões e implementação, 12.4)
**Status:** Decidido

### Contexto

Critério 1 da v1: registrar um gasto em **menos de 10 segundos**. A tela abre pelo botão + central e grava com `POST /lancamentos` (ADR-015). O backend exige `descricao`, aceita `valor` 0 e trata `subcategoria_id` como opcional; as regras abaixo, mais estritas, ficam no frontend. Etapa só de frontend: o backend não mudou.

### Decisões

**A. Descrição opcional**
- Vazia (ou só espaços) envia o **nome da subcategoria**, que aparece como placeholder do campo.
- Nota opcional atrás de uma pill "Adicionar nota" (até 500 caracteres, como no backend).

**B. Subcategoria obrigatória**
- Grade 4x2 das macro na ordem canônica (ADR-005), com ícones Tabler: `ti-tools-kitchen-2`, `ti-confetti`, `ti-shopping-bag`, `ti-heartbeat`, `ti-school`, `ti-ball-football`, `ti-car`, `ti-dots`. Escolhas marcadas com `aria-pressed`.
- Subcategorias em pills, na ordem da API (alfabética, ADR-012). Trocar de macro limpa a subcategoria.
- Macro sem subcategoria abre direto a criação.
- "Salvar gasto" só fica ativo com valor > 0, subcategoria e data válida. Abaixo do botão, o que falta: "Informe o valor", "Escolha a subcategoria", "Escolha uma data dos últimos 90 dias".

**C. Depois de salvar**
- Volta ao Dashboard **no mês da data do gasto** (`trocarMes`). Um gasto com "Outra data" no mês passado leva ao mês passado.
- Aviso global por ~5s, "Gasto salvo · R$ X em Sub · Desfazer", numa região `aria-live="polite"` que fica sempre no DOM.
- **Desfazer** faz `DELETE` e incrementa `$store.app.revisao`. O Dashboard observa esse contador e recarrega. Depois aparece "Gasto desfeito" por 3s.
- Botão desativado durante o envio: duplo clique não grava duas vezes.
- Erro no envio fica na própria tela e o botão volta a ficar ativo.

**D. Valor com máscara de centavos**
- Guardado como **inteiro de centavos** (3250 → R$ 32,50), sem erro de ponto flutuante até a divisão no envio.
- `inputmode="numeric"`, máximo de 9 dígitos (R$ 9.999.999,99), zeros à esquerda descartados, zero não salva, cursor sempre no fim.
- **Só o evento `input`, nunca `keydown`:** no teclado virtual do Android (Gboard, Samsung) o `keydown` chega com `keyCode 229`, sem a tecla real. A cada mudança, os dígitos do campo viram o novo valor e o campo é reescrito. Isso cobre teclado físico, virtual, colar ("R$ 1.234,56" → R$ 1.234,56) e apagar.
- O campo é reescrito à mão (não por `x-model`): se os centavos não mudam (ex.: digitou uma letra), o Alpine não re-renderizaria e a letra ficaria na tela.

**E. Data**
- Pills Hoje / Ontem / Outra data. "Outra data" abre um `<input type="date">` com `min` = hoje − 90 e `max` = hoje (janela da ADR-015).
- Datas sempre locais, com a nova `formatar.dataIso` (nunca `toISOString()`, que é UTC e depois das 21h em Brasília daria o dia seguinte).
- O intervalo é conferido de novo no envio, com o relógio daquele momento (o dia pode virar com o app aberto).

**F. Criação inline de subcategoria**
- O "+" abre um campo inline "Criar e usar" (Enter cria, Esc cancela). A subcategoria criada já fica selecionada, e o store recarrega as categorias para todas as telas.
- **409 (nome repetido):** a resposta não traz o `id`. O frontend recarrega `/categorias/macro`, acha o nome na macro com `NFC + minúsculas` (como a ADR-012 no backend, que usa `casefold`; para nomes em português o resultado é o mesmo) e seleciona a existente, com o aviso "já existia e foi selecionada".

**G. Foco automático (desvio declarado na 12.4)**
- O briefing previa `$watch` + `$nextTick` → `focus()`. Na implementação, **o foco falhava sem erro, inclusive no desktop**: o `x-show` do Alpine só exibe o elemento **no quadro seguinte** (`requestAnimationFrame`; `setTimeout` com a aba oculta), depois do `$nextTick`, e um `focus()` num elemento ainda com `display: none` é ignorado.
- Solução: `$watch` + `$nextTick` → `focarQuandoVisivel(elemento)`, que espera com **o mesmo agendador que o Alpine usa** (rAF com a aba visível, `setTimeout` com ela oculta). Assim o callback de foco entra sempre na fila depois do que exibe o elemento (até 10 tentativas). Também é usado no nome da nova subcategoria, no input de data e na nota.
- O formulário é limpo a cada abertura da tela.

### Justificativa

1. Descrição automática e subcategoria em dois toques tiram a digitação do caminho mais comum: o fluxo é valor → macro → sub → salvar.
2. Subcategoria obrigatória evita acumular "Sem categoria" em gastos manuais, que, ao contrário da fatura, não têm sugestão automática.
3. Centavos inteiros com máscara pela direita é o padrão de apps bancários: não exige achar a vírgula no teclado numérico.
4. Levar o Dashboard ao mês do gasto mostra o efeito do registro na hora, e o Desfazer reduz o custo de um erro a um toque.
5. Tratar o 409 selecionando a existente transforma o erro em resultado útil.

### Validação (12.4)

- **Critério 1:** cronometrado no desktop com o demo (abrir → + → valor → macro → sub → salvar, com subcategoria existente): **meta de < 10 s atingida** (tempo exato não anotado), com o valor digitado sem clicar no campo (foco automático funcionando).
- **Headless (Edge, tempo real, demo na porta 5001):** roteiro automático com 51 verificações, todas OK em duas rodadas com banco limpo. Cobre máscara, grade e ícones, descrição automática, Desfazer, Ontem/Outra data e limites (hoje−91 e amanhã bloqueiam, hoje−90 libera), mês do Dashboard, criação com nome repetido em maiúsculas e em NFD, duplo envio e erro de conexão.
- O `--virtual-time-budget` do headless **não serve** para esta tela: com tempo virtual o `requestAnimationFrame` atrasa ou não dispara. O roteiro rodou em tempo real e mandou o resultado por POST a um servidor local temporário.
- **Navegador (Gabriel):** roteiro completo OK, incluindo modo celular do DevTools e erro com o demo parado.
- **Backend inalterado:** 338 testes passando.

### Trade-offs aceitos

- **Duas buscas do Dashboard** quando o salvar muda o mês (os watchers de tela e de mês disparam); a `sequencia` da ADR-027 descarta a antiga.
- **Um gasto por vez:** depois de salvar volta ao Dashboard; registrar vários em sequência exige reabrir pelo +.
- **Subcategorias em ordem alfabética**, não por uso.
- O aviso de 5s não pausa com foco ou mouse em cima.
- O 10º dígito digitado no meio do valor (cursor reposicionado à mão) descarta o último dígito, não o digitado; o cursor volta ao fim a cada mudança.
- "Salvar gasto" fica no fim do formulário; com o teclado virtual aberto, pode exigir rolagem.

### A verificar no primeiro uso real no celular (12.8/12.9)

- **Teclado abrindo sozinho:** no iOS (e em alguns Android) o `focus()` fora do próprio toque do usuário pode focar o campo **sem abrir o teclado**, e o `focarQuandoVisivel` roda um quadro depois do toque no +. Não foi possível testar nesta etapa (o `api.js` aponta para 127.0.0.1, o CORS só libera localhost, rede corporativa).
- **Alternativa, se falhar:** um campo escondido que recebe o foco **dentro do próprio handler do toque no +** (o que abre o teclado) e repassa o foco ao campo de valor quando ele ficar visível.

### Reabrir se:

- Subcategorias mais usadas primeiro fizerem falta (exige backend: contagem por subcategoria).
- Subcategoria obrigatória atrapalhar no uso real: considerar uma "Geral" automática por macro.
- Registrar vários gastos em sequência for comum: opção "salvar e registrar outro".
- O foco no celular não abrir o teclado: implementar a alternativa do campo escondido.

---

## ADR-029 — Tela de tetos: edição em lote, herança visível e gasto como referência

**Data:** 2026-11-19 (decisões e implementação, 12.7)
**Status:** Decidido

### Contexto

Critério 5 da v1: editar o teto de uma categoria. Feita antes da 12.5 porque, sem tetos, o Dashboard não serve no uso real. O backend já resolve tudo: herança do mês anterior mais recente em runtime (ADR-013), `PUT /tetos` como upsert e `DELETE` que devolve o mês à herança (ADR-014), e teto 0 diferente de "sem teto" (ADR-022). O frontend exibe e envia; não recalcula herança nem gasto. Etapa só de frontend.

### Decisões

**A. Acesso**
- A engrenagem da barra inferior deixa de estar desativada e abre "Tetos por categoria" (`aria-label`/`title`, `aria-current`).
- O convite do Dashboard sem nenhum teto ganha o botão "Definir tetos", que abre a tela no mesmo mês.

**B. Mês compartilhado**
- A tela edita o mês do store (o mesmo do Dashboard), com os chevrons ‹ › e o mês por extenso.
- Texto fixo: "Um teto vale para os meses seguintes até você mudar."

**C. Lista das 8 macro, edição em lote**
- Ordem canônica (ADR-005). Cada linha tem nome, campo de valor e uma linha de contexto: `<origem> [· não gastar nada] · gasto R$ X`, em que a origem é "definido neste mês", "herdado de <Mês Ano>" (`origem_mes`/`origem_ano`) ou "sem teto".
- O gasto vem do `/dashboard` do mesmo mês, sem recálculo.
- Visual: herdado com borda tracejada e valor em texto secundário; alterado e não salvo com borda de 2px na cor primária e a marca "Alterado"; falha com borda e mensagem na cor de estourado. Só variáveis de tema.
- Um único botão "Salvar tetos (N alterados)", ativo só com alterações, mais o link "Descartar alterações". Envia só as linhas alteradas.
- **Máscara de centavos compartilhada** com o Registrar, extraída para `js/util/mascara.js` (`window.mascaraCentavos`), sem duplicar a lógica da ADR-028 (só o evento `input`).

**D. Voltar a herdar (no lote)**
- Só em teto **definido neste mês**. A linha fica marcada "Volta a herdar ao salvar · Desfazer", conta no N, e o `DELETE /tetos` só sai no "Salvar". Regra única: **nada é gravado até salvar**, e "Descartar" também desfaz isso.
- Teto herdado ou sem teto não tem essa ação (o DELETE daria 404, ADR-014).

**E. Campo vazio × R$ 0 (menos ambíguo)**
- **Campo vazio = sem alteração**, em qualquer linha. Apagar tudo deixa o campo vazio enquanto se edita; ao sair, ele volta a mostrar o valor original.
- **R$ 0 só digitando 0.** Digitar ou colar "0" vira R$ 0,00 explícito ("não gastar nada"); apagar até não sobrar dígito nunca vira zero. A diferença vem do `inputType` do evento `input` (`delete…` × `insert…`), que também existe nos teclados do Android.
- Digitar o mesmo valor que a linha já tem (inclusive o herdado) não conta como alteração.

**F. Alterações não salvas ao sair (sem diálogo do navegador)**
- Com alterações, os chevrons e a barra inferior não navegam. A tentativa vira `navegacaoPendente` no store e aparece a faixa inline "N alterações não salvas · Salvar e continuar · Descartar · ×".
- "Salvar e continuar" executa a navegação **só se tudo salvar**. "Descartar" volta aos originais e navega. "×" cancela e continua editando.
- A guarda fica em `mostrarTela` do store, que pergunta à tela de Tetos quantas alterações há (`alteracoesNaoSalvas`).

**G. Salvar em sequência, com falha parcial tratada**
- As requisições saem **uma por vez**, não em paralelo: o SQLite serializa escritas, e PUTs simultâneos poderiam esperar a vez ou falhar com "database is locked", gerando uma falha parcial artificial. Com no máximo 8 requisições locais, o custo é desprezível.
- As linhas que deram certo viram o novo original. As que falharam mantêm o valor digitado e a marca de alterada, com "Não salvou: <motivo>" na própria linha. Mensagem geral: "2 de 3 tetos salvos. 1 não salvou: confira a linha marcada e tente de novo."
- Com pelo menos um sucesso: recarrega os tetos (atualizando o store e preservando as linhas que falharam) e faz `revisao++` (o Dashboard observa, ADR-028).

### Justificativa

1. Lote com um botão só: definir os tetos do mês é uma tarefa de uma vez só, e o contador deixa claro o que vai ser gravado.
2. Herança visível (origem + borda tracejada) mostra o que foi decidido e o que é automático, como pede a ADR-013.
3. O gasto ao lado do teto dá a referência para decidir o valor sem trocar de tela.
4. "Campo vazio = sem alteração" evita que apagar vire "não gastar nada" por acidente; zero é sempre uma decisão explícita (ADR-022).
5. A faixa inline protege as alterações sem `confirm()`, que bloqueia a página e não segue o visual do app.

### Validação (12.7)

- **Headless (Edge, tempo real, demo na 5001):** 46 verificações dos tetos, todas OK em duas rodadas com banco limpo. Cobre contexto e visual, zero explícito × apagar, mesmo valor herdado, guarda (chevron, barra, ×, Salvar e continuar, Descartar), falha parcial simulada com **no máximo 1 requisição em voo**, herança no mês seguinte, Voltar a herdar (com Desfazer), reflexo no Dashboard, gasto de referência e convite.
- **Regressão da 12.4:** 51 de 51 OK com a máscara extraída.
- **Navegador (Gabriel):** roteiro completo OK, incluindo os casos de zero e a largura de celular.
- **Backend inalterado:** 338 testes passando.

### Limitações (pendências de backend, depois da v1)

- **Não dá para tornar "sem teto daqui em diante" uma categoria que herda teto.** O `PUT /tetos` não aceita `null`, e o `DELETE` só apaga o teto do mês exato (a herança do anterior continua valendo). R$ 0 significa "não gastar nada", não "sem teto". Resolver exige o backend gravar um marcador de "sem teto" que interrompa a herança.
- **Não dá para "congelar" um valor herdado.** Digitar o mesmo valor herdado não conta como alteração, então o mês continua herdando. Só importa se um mês anterior for alterado depois (a mudança se propaga, ADR-013); é raro, e contornável definindo outro valor.

### Trade-offs aceitos

- **Fechar ou recarregar a aba perde as alterações:** sem `beforeunload`, que mostraria um diálogo do navegador.
- **Duas buscas de `/tetos` ao trocar de mês na tela** (a do `trocarMes` do store e a da tela, que também traz o `/dashboard`).
- **Linha definida e alterada mostra também "Voltar a herdar":** clicar descarta a edição e marca para herdar. Duas ações na mesma linha, mas as duas são válidas.
- **Borda tracejada discreta** (cor de borda do tema) nas herdadas.
- O cursor sempre no fim do campo (como no Registrar): para trocar um valor herdado, apaga-se e digita-se.

### Reabrir se:

- O backend ganhar "sem teto daqui em diante" (marcador que interrompe a herança): ação "Remover teto" na linha.
- "Congelar" um mês fizer falta: considerar que salvar o mesmo valor herdado conte como alteração.
- A borda tracejada não bastar para distinguir herdado no uso real: reforçar no polimento.
- Perder alterações ao fechar a aba acontecer na prática: rascunho local (`localStorage`) em vez de diálogo.
- O backend ganhar escrita em lote: trocar a sequência de PUTs por uma requisição só.

---

## ADR-030 — Histórico: agrupamento por macro, edição reaproveitando o Registrar e aprendizado só em importados

**Data:** 2026-11-19 (decisões e implementação, 12.5)
**Status:** Decidido

### Contexto

Critério 4 da v1: voltar 2 meses no histórico e ver uma categoria. O backend já entrega tudo: `GET /lancamentos` (data desc, com `subcategoria_sugerida`, ADR-018), `PUT` que só aplica o que mudou e trava data/descrição/valor de importados (ADR-016), `POST /lancamentos/<id>/categorizar` que categoriza e ensina (ADRs 017, 019 e 020), `DELETE` definitivo, e os totais por macro no `/dashboard` (ADR-021). Etapa de frontend; os desvios fora dela estão na seção própria abaixo.

### Decisões

**A. Lista agrupada por macro, com os números do backend**
- Mês do store, com chevrons e a faixa "Mês encerrado/futuro", como no Dashboard e nos Tetos.
- **Os grupos são as categorias do `/dashboard`** com `quantidade > 0`: nome, quantidade e total vêm de lá, sem soma no frontend. Ordenar pelo `gasto` (maior primeiro, empate na ordem do backend) é só exibição. "Sem categoria" fica sempre por último.
- As 2 maiores ficam abertas, o resto recolhido; "Sem categoria" fica aberta quando tem itens. Ao trocar de mês, volta ao padrão; na mesma visita, o que o usuário abriu ou fechou é mantido.
- Os itens são distribuídos por `categoria_macro_id`, na ordem da API (data desc). Cabeçalho do grupo: "nome · quantidade · total". Topo: "N lançamentos · R$ total" (`hero.total_gasto`; N é o tamanho da lista).
- Cada item mostra descrição, valor e "data curta · subcategoria · origem (manual/fatura)". Tocar revela "Editar · Apagar" (um item por vez). Ao voltar para a tela, as ações ficam fechadas.
- Estados: primeira carga, atualização, erro com "Tentar de novo", e mês vazio ("Nenhum lançamento em <mês>.").
- **Toda mudança recarrega a lista e o `/dashboard` juntos** (o Histórico observa `revisao`): depois de Aceitar ou Apagar, "Sem categoria", os grupos e o topo já refletem a mudança.

**B. Edição reaproveitando o Registrar**
- O store guarda `lancamentoEmEdicao` (o objeto do GET). `editarLancamento(l)` preenche e abre o Registrar; o botão + chama `novoGasto()`, que limpa a edição, inclusive no meio de uma. Sair do Registrar também limpa.
- O Registrar observa a chave `tela|idEmEdição` e, ao abrir, **preenche** (edição) ou **limpa** (novo), com a mesma máscara (ADR-028/029), grade, criação de subcategoria e regras de "o que falta".
- O `salvar()` só escolhe o caminho: **`criar()` é o código da 12.4, intacto**, e **`atualizar()` é novo**. Os 51 testes da 12.4 seguem passando sem mudança.
- Edição: título "Editar gasto", "Salvar alterações", "Cancelar" (volta ao Histórico) e foco no valor só em manual. Manda só o que mudou; se nada mudou, volta sem requisição.
- **Importado (ADR-016):** valor, descrição e data travados (data mostrada como texto, "data da fatura"), com "Veio da fatura: só categoria e nota podem mudar". A regra "valor > 0" não se aplica.
- Ao salvar, volta ao Histórico no mesmo mês, com o aviso "Gasto atualizado", sem Desfazer.

**C. Aprendizado só em importados; Aceitar sempre ensina**
- **Importado** com subcategoria trocada: `POST categorizar` (ensina, ADR-019).
- **Manual:** um único `PUT` com o que mudou; a subcategoria vai em silêncio (ADR-017).
- **Sugestão** (itens sem categoria com `subcategoria_sugerida`): "Sugestão: <sub>" com **Aceitar** (`POST categorizar`, sempre ensina, também em manual) e **Escolher** (abre a edição).

**D. Importado com subcategoria e nota alteradas: categorizar antes da nota**
- `categorizar` só aceita `subcategoria_id`, então a nota vai num `PUT` separado. Ordem: **primeiro o categorizar** (a ação principal, a que ensina), **depois o PUT da nota**.
- Se o categorizar falhar, o PUT nem é enviado; o erro fica na tela.
- Se **a nota falhar**: a categoria já salva vira a base local, o usuário continua na tela com "Categoria salva, mas a nota não: <motivo>. Toque em Salvar de novo.", e o novo Salvar **manda só a nota** (o categorizar não se repete).

**E. Data na edição de um manual**
- A pill marcada é a da data original (Hoje, Ontem, ou "Outra data" com o input preenchido).
- **A janela de 90 dias só vale se a data mudar** (ADR-015/016): a data original é sempre aceita, mesmo fora da janela. O input mantém `min` = hoje − 90 e `max` = hoje; com a original fora da janela, aparece a dica "dá para mantê-la ou trocar por uma recente".
- A data só é enviada se mudou.
- Se a data mudar de mês, a tela fica no mês exibido (o item some da lista) e o aviso diz "Gasto atualizado · agora em <Mês Ano>".

**F. Apagar com confirmação inline**
- "Apagar este gasto? Apagar · Cancelar" dentro do item, sem `confirm()`. Num importado, acrescenta "Ele volta se você reimportar a fatura." (ADR-016 × ADR-010).
- Depois de apagar: `revisao++`, e a lista e os totais recarregam.

### Justificativa

1. Números do `/dashboard`: o Histórico nunca diverge do Dashboard, e a regra "o frontend exibe, não recalcula" continua valendo.
2. Grupos pelo gasto, com os 2 maiores abertos: "ver uma categoria" (critério 4) é um toque, sem rolar por tudo.
3. Um só formulário para criar e editar: mesma máscara, grade e validação, sem duplicar código nem divergir.
4. Aprender só de importados mantém o dicionário limpo (ADR-017): descrições manuais são livres, e uma correção pontual não deve ensinar errado. Aceitar uma sugestão é uma confirmação explícita, por isso sempre ensina.
5. Categorizar antes da nota: se só uma das duas der certo, que seja a que ensina e muda os totais.

### Validação (12.5)

- **Headless (Edge, tempo real, demo na 5001):** 51 verificações do Histórico, todas OK em duas rodadas com banco limpo. Inclui critério 4, ordem e abertura dos grupos, totais depois de Aceitar e de Apagar, sugestão aparecendo no outro item igual, importado travado com falha simulada da nota (categorizar uma vez só), manual "nada mudou" sem requisição, mudança de mês, data antiga simulada e + no meio da edição.
- **Mês passado do demo intacto**, conferido pela API: hero R$ 963,45 de R$ 1.350,00, total R$ 1.314,95.
- **Regressões:** 12.4 (51/51) e 12.7 (46/46).
- **Navegador (Gabriel):** roteiro completo OK com `servidor_frontend.py` e o demo, inclusive largura de celular.
- **Backend inalterado:** 338 testes passando.

### Desvios aprovados fora do frontend

- **Semente do `scripts/demo_dashboard.py`:** 6 lançamentos no **mês retrasado** (o critério 4 caía num mês vazio), entre eles "APP DE TRANSPORTE" sem categoria, igual ao do mês passado; e um aprendizado para "LOJA ONLINE MARKETPLACE" → Roupas, com o padrão gerado por **`normalizar_padrao()` do backend**, não escrito à mão. O mês passado não mudou (os números citados na ADR-027 continuam valendo).
- **`scripts/servidor_frontend.py`:** o `python -m http.server` não manda `Cache-Control`, e o Chrome reaproveitou o `historico.js` antigo (placeholder da 12.2) com o `index.html` novo: tela em branco e `rotuloMes is not defined` no console. O script novo serve `frontend/` com **`Cache-Control: no-store`**, recusa porta ocupada (como o demo) e escuta em 127.0.0.1. Passa a ser o comando oficial do "Como rodar" no `CLAUDE.md`, com a armadilha registrada.

### Trade-offs aceitos

- **Sem descategorizar** pela edição: a subcategoria é obrigatória também ao editar (ADR-028).
- **Aviso de mudança de mês sem atalho** para o mês novo: o aviso só tem a ação Desfazer.
- **Sem Desfazer na edição nem no apagar:** a confirmação inline é a proteção (ADR-016).
- Corrigir um manual não ensina; para ensinar a partir de um manual, só aceitando uma sugestão.
- Duas requisições por carga (`/lancamentos` e `/dashboard`).

### Reabrir se:

- Ensinar a partir de manuais fizer falta: opção "lembrar para os próximos" no modo edição.
- O aviso "agora em <mês>" pedir atalho: generalizar o aviso com uma ação "Ver".
- Apagar por engano acontecer na prática: Desfazer com recriação do lançamento ou soft delete (ADR-016).
- O volume do mês deixar a lista longa: filtro por origem ou busca (a API já filtra por origem).
- Hospedar o frontend: cache com versão nos arquivos (o `no-store` é só para desenvolvimento).

---

## ADR-031 — Importação: prévia sem gravar, limite de upload e vencimento completo

**Data:** 2026-11-23 (decisões e implementação, 12.6a)
**Status:** Decidido

### Contexto

Mini-etapa de backend para a tela de importação (12.6b). A tela precisa de três coisas que o `POST /fatura/importar` não tinha: mostrar **antes de gravar** o que entraria e o que já existe, recusar com clareza um arquivo grande demais, e exibir a **data completa** do vencimento ("Fatura com vencimento em 10/10 · compras de setembro"). Nada muda na gravação: data `AAAA-MM-01` (ADR-007), competência = mês/ano do vencimento (ADR-009) e deduplicação por contagem (ADR-010).

### Decisões

**1. Prévia: `simular=true`, com a mesma função e sem nenhuma escrita**
- Campo opcional `simular` no formulário: `"true"` ou `"false"` (padrão false); qualquer outro valor dá 400, antes de processar o PDF.
- `salvar_lancamentos_fatura(..., gravar=True)`: com `gravar=False`, **o mesmo laço** decide o status de cada lançamento, e só o `INSERT` não é executado.
- **Por que isso dá exatamente o resultado da importação real:** o `m` (quantas vezes a chave já está no banco) é contado **uma vez por chave, antes de qualquer insert dessa chave**, e o status depende só de `m` e do contador de ocorrências no PDF, **nunca dos inserts** que a própria importação faz. Pular o insert não muda nenhuma decisão.
- **Por que não transação com rollback:** também reaproveitaria a regra, mas a prévia faria escritas de verdade (trava de escrita do SQLite durante a prévia) e dependeria de nunca esquecer o rollback. Com `gravar=False` a prévia **não executa nenhum SQL de escrita**: "nada gravado" é garantido pela estrutura, não por disciplina.
- A resposta tem **o mesmo formato** da importação real, com os mesmos status (`inserido` / `ignorado_duplicata`, que na prévia significam "seria inserido" / "já importado") e `"simulado": true` no topo. Toda resposta traz `simulado` (false na importação real).

**2. Limite de upload: 5 MB, com 413 em JSON**
- `MAX_CONTENT_LENGTH` = `TAMANHO_MAXIMO_UPLOAD_MB` (5) × 1024 × 1024. A fatura real tem ~200 KB: 25× de folga para faturas longas, e ainda pequeno para a memória.
- O Werkzeug levanta o 413 ao ler o upload, **antes** de qualquer PDF temporário ser criado: o arquivo grande não deixa nada para trás nem chega ao parser.
- `@app.errorhandler(RequestEntityTooLarge)` responde `413 {"erro": "arquivo maior que o limite de 5 MB"}`, no padrão da API (o do Flask é HTML). A resposta passa pelo `after_request`, então sai **com o cabeçalho CORS** e o navegador consegue lê-la (ADR-025).

**3. Vencimento completo**
- O leitor ganha `extrair_vencimento()` → `"AAAA-MM-DD"`, com a mesma regex do cabeçalho e validação por `date()` (31/02 vira `None`). `extrair_competencia()` passa a derivar dela.
- O `main.py` chama só `extrair_vencimento` e deriva mês/ano dela.
- A resposta traz `competencia.vencimento` **sempre presente** (`null` se o PDF não tiver, convenção da ADR-018): com fonte `pdf` e também com fonte `formulario` (o vencimento detectado vai junto, para a tela mostrar).

### Justificativa

1. Uma regra de deduplicação só, num lugar só: a prévia não pode divergir da importação, porque é o mesmo código.
2. Prévia sem escrita: o usuário pode simular quantas vezes quiser, sem risco e sem travar o banco.
3. Mesmos status e mesmo formato: a 12.6b usa um único renderizador para a prévia e para o resultado.
4. O 413 em JSON com CORS faz o erro chegar à tela como mensagem, não como falha de rede.
5. O vencimento completo resolve a confusão "vencimento × mês das compras" na tela, sem mexer na competência.

### Validação (12.6a)

- **pytest:** 359 testes passando, nenhum pulado (fatura real presente), cobertura de 98,97%. Novos: prévia não grava; prévia depois de importar (tudo já importado); prévia × importação real com banco parcial (contagens e status iguais, item a item); os dois "cafés" na prévia (n − m, e um manual idêntico não conta); `simular` inválido; 422 com prévia; 413 em JSON sem processar, sem gravar e sem temporário; 413 com CORS; vencimento no leitor (válido, dia ≠ mês, ausente, mês 13, 31/02) e e2e com a fatura real (`2026-10-10`, prévia batendo com a importação).
- **curl contra o demo:** prévia com 23 novos e nada gravado; importação com 23; nova prévia com 0 novos e 23 já importados; 6 MB → 413 em JSON com CORS, nada gravado e nenhum PDF temporário.
- **Servidor de desenvolvimento e o 413:** havia o risco de o Werkzeug fechar a conexão sem ler o corpo grande (o cliente veria "conexão resetada"). Não aconteceu: 413 em JSON com e sem `Expect: 100-continue` (o navegador não manda esse cabeçalho), 3 de 3. O navegador em si só será testado na 12.6b.

### Trade-offs aceitos

- Na prévia, `inserido` significa "seria inserido": a tela traduz (ex.: "novo" / "já importado").
- A prévia é um retrato do momento: se algo for importado entre a prévia e a confirmação, a importação real pode divergir dela (correta, pela mesma regra).
- A prévia processa o PDF inteiro, e a importação processa de novo (o arquivo é enviado duas vezes). Sem cache de upload no servidor, pela simplicidade.
- O limite vale para qualquer requisição da API, não só para o upload; nenhuma outra rota chega perto de 5 MB.

### Reabrir se:

- Uma fatura real passar de 5 MB (ajustar `TAMANHO_MAXIMO_UPLOAD_MB`).
- A 12.6b mostrar no navegador o reset de conexão que o curl não mostrou: a checagem de tamanho no frontend, antes de enviar, já fica prevista para a 12.6b de qualquer forma.
- O backend for hospedado: o limite passa a ser também do servidor de produção (proxy), não só do Flask.
- Enviar o arquivo duas vezes pesar: guardar o resultado da prévia no servidor com um token de confirmação.

---

## Convenções deste arquivo

- Decisões reabertas viram ADR-NNN-v2 com link pra versão anterior.
- Status possíveis: Proposto, Decidido, Substituído por ADR-XXX, Obsoleto, Adiado.
- Toda decisão nova entra no final, com data e número incremental.
