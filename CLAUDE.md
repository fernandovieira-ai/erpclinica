## Memória e skills (MCP agent-core)
- Tarefa nova: chame `context_load` uma vez.
- Antes de decidir arquitetura ou regra de negócio: `memory_search`.
- Decisão fechada, convenção ou regra do cliente descoberta: `memory_save` (kind decision/fact/procedure). Se substitui algo antigo, passe `supersedes`.
- Procedimento que vai se repetir: `skill_save`. Antes de fazer algo recorrente: `skill_search`.
- Nunca salve senhas, tokens ou dados pessoais de clientes.

## Skill "padroes" (`.claude/commands/padroes.md`) — não carregar por padrão
- É a fonte exaustiva e versionada de decisões de implementação (34+ seções), mas é grande (800+ linhas) — não invocar automaticamente pra toda tarefa neste projeto.
- Pra decisões do dia a dia, usar primeiro `context_load`/`memory_search` (agent-core) — é o resumo rápido, mantido justamente pra evitar reabrir o arquivo inteiro.
- Só carregar a skill `padroes` quando precisar de detalhe fino que a memória não tem (ex: o passo a passo exato de uma feature específica, trechos de código de referência, decisões descartadas e o porquê).
- Ao fechar uma feature nova relevante, continuar documentando nela (é o padrão do projeto) e refletir o resumo correspondente no `agent-core` via `memory_save`.
