# PROJETO.md — Sistema Financeiro/Fiscal DigitalRF
> Cole este arquivo na raiz do projeto. O Claude Code lê automaticamente no início de cada sessão.

---

## Identidade do projeto

Você está desenvolvendo um **sistema financeiro, gerencial e fiscal** para empresas brasileiras de pequeno e médio porte.
O sistema é voltado para **controle financeiro completo**: contas a pagar/receber, caixa, banco, emissão de NF-e, DRE e fluxo de caixa.

A base de referência é o **EMSys3** (ERP legado da DigitalRF — PostgreSQL 9.6, ~1.979 tabelas). As decisões de modelagem foram tomadas com base na análise desse schema.

Stack principal:
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Shadcn/ui + Recharts
- **Backend:** Next.js API Routes + PostgreSQL 17 + **raw `pg`** (sem ORM)
- **IA:** API Anthropic (claude-sonnet-4-6)
- **Auth:** JWT próprio (igual ao DigitalRF Help)
- **Deploy:** VPS própria · 1 Next.js · PostgreSQL 17 · 1 database por cliente

---

## Arquitetura de infraestrutura

### Modelo de deployment — VPS própria + multi-database

**1 servidor, 1 Next.js, N databases PostgreSQL** — um database por cliente.

```
VPS DigitalRF
  ├── PostgreSQL 17
  │     ├── saas_control          ← metadados SaaS (clientes, planos, admins)
  │     ├── fin_clienteabc        ← banco isolado do cliente ABC
  │     ├── fin_clientexyz        ← banco isolado do cliente XYZ
  │     └── fin_clientejoao       ← banco isolado do cliente João
  │
  ├── Next.js (processo único — PM2 ou Docker)
  │     ├── /login                ← detecta cliente pelo subdomínio/slug
  │     ├── /dashboard            ← conecta no database do cliente via sessão
  │     ├── /financeiro ...
  │     └── /admin                ← só superadmin · conecta no saas_control
  │
  └── Nginx (reverse proxy)
        ├── financeiro.digitalrf.com.br   → Next.js
        ├── clienteabc.digitalrf.com.br   → Next.js (mesmo processo)
        └── clientexyz.digitalrf.com.br   → Next.js (mesmo processo)
```

### Conexão dinâmica por cliente

O `DATABASE_URL` não é fixo. O database correto é carregado da sessão JWT e um pool `pg` é aberto sob demanda:

```typescript
// lib/db/index.ts
import { Pool } from 'pg'

const pools = new Map<string, Pool>()

export function getDb(database: string): Pool {
  if (!pools.has(database)) {
    pools.set(database, new Pool({
      host:     process.env.PG_HOST,      // mesmo host para todos
      port:     Number(process.env.PG_PORT) || 5432,
      user:     process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: database,                 // ← dinâmico por cliente
      max: 5,                             // pool pequeno por cliente
      idleTimeoutMillis: 30000,
    }))
  }
  return pools.get(database)!
}

// Banco de controle SaaS — conexão fixa (só para /admin)
export const dbControl = new Pool({
  host:     process.env.PG_HOST,
  port:     Number(process.env.PG_PORT) || 5432,
  user:     process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: 'saas_control',
  max: 3,
})

// Uso em qualquer API Route:
// const db = getDb(session.database_name)
// const { rows } = await db.query(`SELECT ...`, [...])
```

### Variáveis de ambiente (.env)

```env
# Acesso ao PostgreSQL (compartilhado por todos os databases)
PG_HOST=localhost
PG_PORT=5432
PG_USER=financeiro_app
PG_PASSWORD=senha_forte_aqui

# JWT
JWT_SECRET=segredo_jwt_aqui
JWT_EXPIRES_IN=8h

# Anthropic IA
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_APP_URL=https://financeiro.digitalrf.com.br
NODE_ENV=production
```

### Banco saas_control — tabelas

```sql
tab_instancia          → id, slug, database_name, dominio, plano, status, criado_em
tab_saas_admin         → equipe DigitalRF (login do /admin)
tab_provisioning_log   → histórico: criar, suspender, reativar, excluir cliente
tab_health_check       → ping periódico por instância (futuro)
```

### Provisionamento de novo cliente

Rota `/api/admin/instancias` (POST) executa:
1. Valida superadmin
2. Insere em `saas_control.tab_instancia`
3. `CREATE DATABASE fin_{slug}` via `pg` conectado ao postgres
4. Executa migrations em sequência no novo database
5. Cria usuário admin inicial no novo database
6. Registra em `tab_provisioning_log`

---

## Arquitetura do banco

### Os 3 níveis do sistema

```
NÍVEL 0 — DigitalRF (Superadmin)
  Banco: saas_control · Tabelas: tab_saas_admin, tab_instancia
  Acesso: /admin · só perfil superadmin

NÍVEL 1 — Cliente SaaS (grupo empresarial)
  Banco: fin_{slug} · isolado por database
  Quem paga a fatura · pode ter N empresas/filiais

NÍVEL 2 — Empresa / Filial
  Cada CNPJ é uma tab_empresa dentro do banco do cliente
  Todos os dados financeiros são por empresa_id
```

> Cada cliente tem seu próprio database PostgreSQL.
> O Next.js conecta no database correto baseado no `database_name` da sessão JWT.

### Sessão JWT — campos obrigatórios

```typescript
interface Session {
  usuario_id:       number
  database_name:    string   // ex: "fin_clienteabc" — identifica o banco
  empresa_id_ativa: number   // empresa/filial ativa dentro do banco
  perfil:           'superadmin' | 'admin' | 'financeiro' | 'operador'
  modulos:          string[]
  nome:             string
  email:            string
}
```

> `database_name` vem do `saas_control.tab_instancia` no momento do login.
> Após login, toda API Route usa `getDb(session.database_name)` para conectar.

### Tabelas principais

```
ACESSO:         tab_usuario                 (login, senha_hash, perfil)
                tab_usuario_empresa         (empresas acessíveis por usuário)

CADASTROS:      tab_empresa                 (cada filial/CNPJ)
                tab_pessoa                  (clientes e fornecedores unificados)
                tab_banco                   (códigos de bancos)
                tab_conta_banco             (contas bancárias da empresa)
                tab_centro_custo            (hierárquico)
                tab_plano_contas            (hierárquico, SPED)
                tab_tipo_despesa            (classificação com tributação)
                tab_tipo_receita            (classificação com tributação)
                tab_condicao_pagamento      (prazos e parcelamentos)
                tab_forma_pagamento         (dinheiro, pix, boleto, cartão...)

CONTAS A PAGAR: tab_titulo_pagar            (título central)
                tab_titulo_pagar_parcela    (parcelas do título)
                tab_titulo_pagar_retencao   (retenções: IRRF, CSRF, INSS...)

CONTAS A RECEBER: tab_titulo_receber        (título central)
                tab_titulo_receber_parcela  (parcelas do título)
                tab_titulo_receber_retencao (retenções sobre recebimentos)

CAIXA/BANCO:    tab_movimento_caixa         (entradas/saídas no caixa)
                tab_movimento_banco         (entradas/saídas bancárias)
                tab_fechamento_caixa        (fechamento diário)
                tab_transferencia_conta     (entre contas da empresa)

DESPESAS/RECEITAS: tab_despesa             (despesa avulsa)
                tab_despesa_parcela         (parcelas → gera título pagar)
                tab_despesa_rateio          (rateio por centro de custo)
                tab_receita                 (receita avulsa)
                tab_receita_parcela         (parcelas → gera título receber)
                tab_receita_rateio          (rateio por centro de custo)

FISCAL:         tab_nota_fiscal             (NF-e entrada e saída)
                tab_nota_fiscal_item        (itens da nota)
                tab_nota_fiscal_parcela     (parcelas → gera título)
                tab_nota_fiscal_retencao    (retenções da nota)
                tab_nota_fiscal_evento      (cancelamento, CCe, inutilização)
                tab_nota_fiscal_xml         (XML armazenado)

CONTÁBIL/DRE:   tab_lancamento_contabil     (lançamentos com origem rastreável)
                tab_dre_lancamento          (resultado por período/conta)
                tab_fluxo_caixa             (real + projetado)

IA:             tab_ia_log                  (uso da API Anthropic)
```

### Regras invioláveis do banco

- **Nunca** `SELECT *` — listar colunas explicitamente
- **Sempre** `RETURNING id` nos INSERTs
- **Sempre** `NUMERIC(15,2)` para valores monetários — nunca `FLOAT` ou `DOUBLE PRECISION`
- Índices em `empresa_id`, `status`, colunas de data
- `created_at DEFAULT NOW()` e `updated_at` com trigger `fn_set_updated_at()`
- Soft delete via `ativo BOOLEAN DEFAULT true`
- `ind_tipo` E/S (entrada/saída) com `CHECK` explícito + valor sempre positivo
- Transações (`BEGIN/COMMIT`) obrigatórias em operações que tocam múltiplas tabelas
  (ex: baixar título deve criar movimento + atualizar status atomicamente)
- `origem_modulo VARCHAR(3)` + `origem_id INT` nos lançamentos contábeis para rastreabilidade
  (ex: 'PAG', 'REC', 'DES', 'RVA', 'NFE', 'CAI', 'BAN')

### Encoding do banco — LATIN1

```sql
-- Criar banco novo
CREATE DATABASE financeiro_cliente
  ENCODING 'LATIN1'
  LC_COLLATE 'pt_BR.iso88591'
  LC_CTYPE 'pt_BR.iso88591'
  TEMPLATE template0;
```

- Todo arquivo `.sql` começa com `SET client_encoding = 'LATIN1';`
- Diferente do EMSys3 legado (que usava LATIN1), este projeto usa LATIN1

### Ordem de execução dos SQLs (banco novo)

```bash
createdb -E LATIN1 -l pt_BR.iso88591 --template=template0 financeiro_cliente

psql -d financeiro_cliente -f 01_schema_cadastros.sql
psql -d financeiro_cliente -f 02_schema_financeiro.sql
psql -d financeiro_cliente -f 03_schema_fiscal.sql
psql -d financeiro_cliente -f 04_schema_contabil.sql
psql -d financeiro_cliente -f 05_schema_ia.sql
psql -d financeiro_cliente -f 06_seed_inicial.sql
```

---

## Modelo de usuários e acesso

### Tabelas

```sql
tab_usuario
  id, nome, email, senha_hash,
  perfil  → 'superadmin' | 'admin' | 'financeiro' | 'operador'
  ativo BOOLEAN

tab_usuario_empresa
  usuario_id + empresa_id → chave única
  perfil    → 'admin' | 'financeiro' | 'operador'
  modulos   → ARRAY TEXT (null = usa padrão do perfil)
```

### Interface de sessão JWT

```typescript
interface Session {
  usuario_id:       number
  database_name:    string   // ex: "fin_clienteabc" — banco do cliente
  empresa_id_ativa: number
  perfil:           'superadmin' | 'admin' | 'financeiro' | 'operador'
  modulos:          string[]
  nome:             string
  email:            string
}
```

### Módulos padrão por perfil

```
admin       → todos (cadastros, financeiro, fiscal, contabil, relatorios, config, ia)
financeiro  → financeiro, fiscal, relatorios, ia
operador    → financeiro
```

### Fluxo de login

```
1. e-mail + senha → busca usuário no saas_control.tab_instancia (pelo slug/domínio)
2. Conecta no database_name do cliente → autentica na tab_usuario
3. fn_empresas_do_usuario(usuario_id) → lista empresas acessíveis
4a. 1 empresa  → entra direto
4b. N empresas → seletor de empresa
5. JWT: usuario_id · database_name · empresa_id_ativa · perfil · modulos
6. Toda API Route: getDb(session.database_name) + WHERE empresa_id = $empresa_id_ativa
```

---

## Arquitetura Pessoa Única com Papéis

`tab_cliente` e `tab_fornecedor` **não existem**. Substituídas por `tab_pessoa` com flags booleanas.

```sql
tab_pessoa (
  ind_cliente    BOOLEAN,   -- aparece em CRs, pedidos, NF saída
  ind_fornecedor BOOLEAN,   -- aparece em CPs, NF entrada
  ind_banco      BOOLEAN,   -- aparece em contas bancárias
  ind_transportador BOOLEAN
)
```

Inspirado no padrão do EMSys3 (`tab_pessoa` unificada com flags por tipo).

---

## Navegação — ordem da sidebar

A sidebar segue a lógica de uso diário, do mais acessado ao mais administrativo:

```
┌─────────────────────────────┐
│  [logo]  DigitalRF Financeiro│
├─────────────────────────────┤
│ 📊 Dashboard                │  ← visão geral + widgets DRE/fluxo
│ 📈 Gerencial                │  ← DRE · Fluxo de Caixa
│   └ DRE                     │
│   └ Fluxo de Caixa          │
├─────────────────────────────┤
│ 💰 Financeiro               │
│   └ Contas a Pagar          │
│   └ Contas a Receber        │
│   └ Despesas                │
│   └ Receitas                │
│   └ Caixa                   │
│   └ Banco                   │
│   └ Conciliação             │
├─────────────────────────────┤
│ 🧾 Fiscal                   │
│   └ NF-e (Saída)            │
│   └ NF-e (Entrada)          │
│   └ Livro Fiscal            │
├─────────────────────────────┤
│ 📋 Cadastros                │  ← raramente acessado no dia a dia
│   └ Pessoas                 │
│   └ Empresas                │
│   └ Contas Bancárias        │
│   └ Centros de Custo        │
│   └ Plano de Contas         │
│   └ Tipos de Despesa        │
│   └ Tipos de Receita        │
│   └ Condições de Pagamento  │
│   └ Formas de Pagamento     │
├─────────────────────────────┤
│ ⚙️  Configurações           │
│ 👤 Usuários                 │
└─────────────────────────────┘
```

> **Regra:** Dashboard e Gerencial no topo porque é o que o gestor abre primeiro.
> Cadastros no final porque são configurados uma vez e raramente revisitados.

---

## Estrutura de pastas

```
/app
  /api
    /auth/login/route.ts
    /auth/logout/route.ts
    /gerencial
      /dre/route.ts
      /fluxo-caixa/route.ts
      /dashboard/route.ts          ← widgets + resumos
    /financeiro
      /titulos-pagar/route.ts · /[id]/route.ts · /[id]/baixar/route.ts
      /titulos-receber/route.ts · /[id]/route.ts · /[id]/baixar/route.ts
      /despesas/route.ts · /[id]/route.ts
      /receitas/route.ts · /[id]/route.ts
      /movimento-caixa/route.ts · /fechamento/route.ts
      /movimento-banco/route.ts · /conciliacao/route.ts
      /transferencias/route.ts
    /fiscal
      /notas-fiscais/route.ts · /[id]/route.ts
      /notas-fiscais/[id]/cancelar/route.ts
      /livro-fiscal/route.ts
    /cadastro
      /empresas/route.ts · /[id]/route.ts
      /pessoas/route.ts · /[id]/route.ts
      /contas-banco/route.ts · /[id]/route.ts
      /centros-custo/route.ts · /[id]/route.ts
      /plano-contas/route.ts · /[id]/route.ts
      /tipos-despesa/route.ts · /[id]/route.ts
      /tipos-receita/route.ts · /[id]/route.ts
      /condicoes-pagamento/route.ts
      /formas-pagamento/route.ts
    /ia/chat/route.ts · /ia/insights/route.ts
  /(app)
    /dashboard/page.tsx            ← rota padrão ao logar
    /gerencial
      /dre/page.tsx
      /fluxo-caixa/page.tsx
    /financeiro
      /contas-pagar/page.tsx · /novo/page.tsx
      /contas-receber/page.tsx · /novo/page.tsx
      /despesas/page.tsx
      /receitas/page.tsx
      /caixa/page.tsx
      /banco/page.tsx
      /fechamento-caixa/page.tsx
      /conciliacao/page.tsx
    /fiscal
      /nfe/page.tsx · /nova/page.tsx · /entrada/page.tsx
      /livro-fiscal/page.tsx
    /cadastro
      /empresas/page.tsx
      /pessoas/page.tsx · /[id]/page.tsx
      /contas-banco/page.tsx
      /centros-custo/page.tsx
      /plano-contas/page.tsx
      /tipos-despesa/page.tsx
      /tipos-receita/page.tsx
  /(auth)
    /login/page.tsx
    /selecionar-empresa/page.tsx
/components
  /ia
    ChatIA.tsx
    InsightsIA.tsx
  /ui                              ← Shadcn/ui
  /gerencial
    /DRETable.tsx · FluxoCaixaChart.tsx · DashboardCards.tsx
  /financeiro
    /TituloTable.tsx · BaixaModal.tsx · ParcelasForm.tsx
    /MovimentoTable.tsx · FechamentoCaixa.tsx
  /fiscal
    /NotaFiscalForm.tsx · NFItemForm.tsx · EventoModal.tsx
  /cadastro
    /PessoaForm.tsx · PessoaTable.tsx
    /PlanoContasTree.tsx · CentroCustoTree.tsx
/lib
  /db/index.ts                     ← pool pg
  /auth/jwt.ts · session.ts · middleware.ts
  /gerencial/dre.ts · fluxo.ts · dashboard.ts
  /financeiro/titulos.ts · movimentos.ts · fechamento.ts
  /fiscal/nfe.ts · livro.ts
  /ia/buildSystemPrompt.ts · insights.ts
  /validators/                     ← schemas Zod
/types
  financeiro.types.ts · fiscal.types.ts · cadastro.types.ts · gerencial.types.ts
```

---

## Padrões de código obrigatórios

### Conexão com banco — raw pg

```typescript
// lib/db/index.ts
import { Pool } from 'pg'
export const db = new Pool({ connectionString: process.env.DATABASE_URL })

// Uso em API Routes
const { rows } = await db.query(
  `SELECT id, nome, cpf_cnpj FROM tab_pessoa
   WHERE empresa_id = $1 AND ativo = true
   ORDER BY nome`,
  [session.empresa_id_ativa]
)
```

### Transações obrigatórias em operações financeiras

```typescript
const client = await db.connect()
try {
  await client.query('BEGIN')

  // 1. atualiza título
  await client.query(
    `UPDATE tab_titulo_pagar SET status = 'L', data_liquidacao = $1,
     valor_liquidado = $2, updated_at = NOW()
     WHERE id = $3 AND empresa_id = $4`,
    [data, valor, id, empresa_id]
  )

  // 2. cria movimento bancário
  await client.query(
    `INSERT INTO tab_movimento_banco (empresa_id, conta_banco_id, tipo, valor, ...)
     VALUES ($1, $2, 'S', $3, ...)`,
    [...]
  )

  // 3. lança no contábil
  await client.query(`INSERT INTO tab_lancamento_contabil ...`, [...])

  await client.query('COMMIT')
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  client.release()
}
```

### Padrão obrigatório de API Route

```typescript
import { getSession } from '@/lib/auth/session'
import { checkModulo } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  if (!checkModulo(session, 'financeiro'))
    return NextResponse.json({ erro: 'Sem acesso' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error }, { status: 400 })

  // database e empresa SEMPRE da sessão — nunca do body
  const db = getDb(session.database_name)
  const empresa_id = session.empresa_id_ativa

  // lógica aqui
  return NextResponse.json(resultado)
}
```

### Fluxo por módulo (obrigatório seguir essa ordem)

```
1. SQL (migration)
2. Types TypeScript
3. Schema Zod (validação)
4. API Route (GET + POST + PATCH)
5. Hook personalizado (useFinanceiro, useTitulos...)
6. Tela de listagem (tabela + filtros + paginação)
7. Formulário (modal ou página)
8. IA (se aplicável)
```

### Componentes React

- `'use client'` explícito quando usar hooks
- Props tipadas com interface local
- Sem lógica de negócio no componente — extrair para hooks ou lib
- Loading, erro e vazio sempre tratados
- Skeleton em loading — nunca spinner global

---

## Módulos de IA

| Módulo | Entrada | Saída | Uso |
|--------|---------|-------|-----|
| `chat` | pergunta + contexto financeiro | resposta texto | Assistente financeiro |
| `insights` | resumo DRE + fluxo de caixa | alertas + tendências | Dashboard |
| `classificacao` | descrição de despesa/receita | tipo sugerido | Lançamento rápido |
| `conciliacao` | extrato bancário + movimentos | sugestão de match | Conciliação bancária |

- Modelo sempre: `claude-sonnet-4-6`
- max_tokens: 1024 (chat) · 2048 (insights/relatórios)
- Nunca expor API key no cliente
- Sempre salvar uso em `tab_ia_log`
- Sempre exigir JSON puro quando a saída for estruturada

---

## Regras de UI/UX

- Tema: claro + dark mode via `next-themes`
- Fonte: Geist Sans + Geist Mono para dados numéricos
- Monetário: `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`
- Datas: `format(date, 'dd/MM/yyyy', { locale: ptBR })`
- Tabelas: paginação + busca + filtro por status obrigatórios
- Formulários: React Hook Form + Zod + erro por campo
- Loading: Skeleton — nunca spinner global
- Erros: Sonner toast — nunca `alert()`
- Destrutivo: Dialog de confirmação obrigatório
- Monetário: `react-number-format` · Máscaras: `react-input-mask`
- Mobile-first · sidebar colapsável · tabelas viram cards < 640px

### Status visuais padronizados

```
Títulos/Despesas/Receitas:
  'A' → Aberto    → badge-pendente (âmbar)
  'L' → Liquidado → badge-pago (verde)
  'C' → Cancelado → badge-inativo (cinza)
  'V' → Vencido   → badge-vencido (vermelho)  ← calculado no front

Notas Fiscais:
  'D' → Digitada   → badge-pendente
  'A' → Autorizada → badge-pago
  'C' → Cancelada  → badge-inativo
  'X' → Inutilizada → badge-inativo

Movimentos:
  'E' → Entrada → cor-sucesso (verde)
  'S' → Saída   → cor-erro (vermelho)
```

---

## CSS Global — variáveis e tokens

O projeto tem um `globals.css` na raiz com todas as variáveis de design.
**Sempre usar estas variáveis — nunca hardcodar cores, fontes ou espaçamentos.**

### Cores — use sempre as variáveis CSS

```css
/* Cor principal do sistema (verde teal) */
--cor-primaria:        #0F6E56;   /* botões, links ativos, bordas de foco */
--cor-primaria-hover:  #085041;   /* hover de botões primários */
--cor-primaria-light:  #E1F5EE;   /* fundo de badges, highlights */
--cor-primaria-text:   #085041;   /* texto sobre fundo claro primário */

/* Feedback */
--cor-sucesso:         #1D9E75;
--cor-sucesso-bg:      #E1F5EE;
--cor-erro:            #E24B4A;
--cor-erro-bg:         #FCEBEB;
--cor-aviso:           #EF9F27;
--cor-aviso-bg:        #FAEEDA;
--cor-info:            #378ADD;
--cor-info-bg:         #E6F1FB;

/* Neutros (modo claro) */
--bg-page:             #F4F4F0;   /* fundo geral da página */
--bg-card:             #FFFFFF;   /* fundo de cards e modais */
--bg-input:            #F8F8F6;   /* fundo de inputs */
--bg-hover:            #F1F0EC;   /* hover de linhas e itens */

/* Texto */
--texto-principal:     #1A1A18;   /* títulos e texto primário */
--texto-secundario:    #5F5E5A;   /* labels, subtítulos */
--texto-terciario:     #888780;   /* placeholders, metadados */

/* Bordas */
--borda-suave:         rgba(0,0,0,0.08);
--borda-media:         rgba(0,0,0,0.14);
--borda-forte:         rgba(0,0,0,0.22);

/* Modo escuro — as variáveis mudam automaticamente via [data-theme="dark"] */
```

### Badges de status — classes prontas

```css
/* Usar assim: <span className="badge-status badge-pago">Pago</span> */
.badge-status       /* base: padding, border-radius, font-size */
.badge-pago         /* verde */
.badge-pendente     /* âmbar */
.badge-vencido      /* vermelho */
.badge-cancelado    /* cinza */
.badge-autorizado   /* verde */
.badge-digitado     /* âmbar */

/* Papéis de pessoa */
.badge-papel        /* base */
.badge-cliente      /* verde */
.badge-fornecedor   /* roxo */
.badge-banco        /* azul */
.badge-transportador /* cinza */
```

### Tipografia — Geist Sans configurado no layout.tsx

```css
--fonte-sans:  var(--font-geist-sans);   /* corpo, labels, UI */
--fonte-mono:  var(--font-geist-mono);   /* valores, CPF, CNPJ, datas, códigos */

/* Tamanhos usados no projeto */
/* 11px — labels uppercase, metadados        */
/* 12px — texto secundário, badges           */
/* 13px — corpo padrão de formulários        */
/* 14px — texto principal em tabelas         */
/* 16px — subtítulos de seção                */
/* 20px — títulos de página                  */
```

### Espaçamentos padrão

```
4px  — gap entre badge e texto
6px  — gap entre badges
8px  — padding interno de badge, gap entre ícone e texto
10px — gap entre cards no grid
12px — padding de células de tabela
14px — gap entre campos de formulário
16px — padding interno de card pequeno
18px — padding de tab panel
20px — padding de page header
24px — padding geral da página
```

### Bordas e sombras

```css
--radius-sm:   6px;    /* badges, inputs pequenos */
--radius-md:   8px;    /* inputs, botões */
--radius-lg:   10px;   /* cards de stat */
--radius-xl:   12px;   /* cards principais */
--radius-2xl:  14px;   /* modais, slide-over */

/* Bordas sempre 0.5px — nunca 1px */
border: 0.5px solid var(--borda-suave);
border: 0.5px solid var(--borda-media);   /* hover */
border: 0.5px solid var(--borda-forte);   /* foco */

/* Sombra só em modais e slide-over — nunca em cards */
box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04);
```

### Componentes — padrão de escrita

```tsx
/* Botão primário */
<button className="btn-primary">Salvar</button>

/* Botão secundário */
<button className="btn-ghost">Cancelar</button>

/* Botão destrutivo */
<button className="btn-danger">Cancelar título</button>

/* Input padrão */
<input className="input-field" />

/* Input com erro */
<input className="input-field input-error" />

/* Label de campo */
<label className="field-label">Valor original</label>

/* Seção dentro de formulário */
<div className="field-section">Dados do Pagamento</div>

/* Card padrão */
<div className="card">...</div>

/* Card com header e body */
<div className="card">
  <div className="card-header">
    <span className="card-title">Contas a Pagar</span>
  </div>
  <div className="card-body">...</div>
</div>
```

### Regras obrigatórias de CSS

- **Nunca** usar `text-gray-500` ou similares do Tailwind para texto — usar as variáveis CSS
- **Nunca** hardcodar hex como `#333` ou `#fff` — sempre variável
- **Nunca** `border-1` ou `border-2` — sempre `border` com `0.5px`
- **Sempre** `font-mono` em CPF, CNPJ, valores monetários, datas, chave NF-e
- **Sempre** `uppercase tracking-wider text-[11px]` em labels de campo
- Tailwind só para layout (flex, grid, gap, padding, margin, width)
- Cores e bordas sempre via variável CSS

---

## O que NÃO fazer

**Banco:**
- Nunca `SELECT *`
- Nunca `DELETE` — usar `ativo = false`
- Nunca `FLOAT` ou `DOUBLE PRECISION` em valores monetários — sempre `NUMERIC(15,2)`
- Nunca JOIN sem índice nas colunas envolvidas
- Nunca retornar `senha_hash` em queries de listagem/sessão
- Nunca operação financeira fora de transação (`BEGIN/COMMIT`)

**Modelo:**
- Nunca `tab_cliente` ou `tab_fornecedor` separadas — usar `tab_pessoa` com flags
- Nunca `empresa_id` do body da requisição — sempre da sessão JWT
- Nunca pessoa sem checar CPF/CNPJ duplicado na empresa
- Nunca atualizar saldo de conta direto — sempre via `tab_movimento_banco`

**Código:**
- Nunca commitar `.env`
- Nunca `useEffect` para buscar dados — usar Server Components ou SWR/React Query
- Nunca `any` no TypeScript
- Nunca `parseInt` em valores monetários — usar `parseFloat` ou `Number`
- Nunca API Anthropic chamada diretamente do cliente
- Nunca Drizzle ORM — este projeto usa raw `pg` (padrão DigitalRF)

---

## Comandos úteis

```bash
pnpm dev
pnpm build && pnpm tsc --noEmit

# Setup inicial
pnpm create next-app@latest financeiro --typescript --tailwind --app --src-dir
pnpm add pg jsonwebtoken bcryptjs zod react-hook-form @hookform/resolvers \
  sonner date-fns react-number-format react-input-mask \
  @anthropic-ai/sdk recharts next-themes
pnpm add -D @types/pg @types/jsonwebtoken @types/bcryptjs
pnpm dlx shadcn@latest init

# Banco de controle SaaS (rodar uma vez no servidor)
psql -U postgres -f migrations/00_saas_control.sql

# Provisionar novo cliente manualmente (normalmente feito pelo /admin)
psql -U postgres -f scripts/provisionar.sh slug_cliente "Nome do Cliente" "admin@cliente.com"

# Migrations no banco de um cliente específico
psql -d fin_clienteabc -f migrations/01_schema_cadastros.sql
psql -d fin_clienteabc -f migrations/02_schema_financeiro.sql
psql -d fin_clienteabc -f migrations/03_schema_fiscal.sql
psql -d fin_clienteabc -f migrations/04_schema_contabil.sql
psql -d fin_clienteabc -f migrations/05_schema_ia.sql
psql -d fin_clienteabc -f migrations/06_seed_inicial.sql
```

---

## Roadmap de desenvolvimento

```
Fase 0 — Fundação SaaS    saas_control.sql · script provisionar · getDb dinâmico
                          auth JWT com database_name · /admin básico (listar clientes)
Fase 1 — Fundação App     layout · login · seletor empresa · middleware de rota
Fase 2 — Cadastros        empresa · pessoas · contas-banco · centros-custo · plano-contas
                          tipos-despesa · tipos-receita · condições · formas de pagamento
Fase 3 — Financeiro       titulos-pagar · titulos-receber · baixa/liquidação
                          despesas · receitas · movimento-caixa · fechamento
                          movimento-banco · transferências · conciliação
Fase 4 — Fiscal           NF-e saída · NF-e entrada · eventos (CCe, cancelamento)
                          livro fiscal · retenções
Fase 5 — Gerencial/DRE    lançamentos-contabeis · DRE · fluxo de caixa · dashboard
Fase 6 — IA               insights automáticos · assistente financeiro · classificação
Fase 7 — Painel SaaS      /admin completo · provisionar via UI · health check · planos
```

**Nunca pular fases. Cada fase depende da anterior.**

### Referência de modelagem — EMSys3

Este projeto foi modelado com base no schema do EMSys3 (dump analisado em abril/2026).
Padrões herdados do EMSys3 que devem ser respeitados:
- `ind_tipo` E/S com valor sempre positivo (sinal pelo indicador, não pelo número)
- `origem_modulo` (3 chars) + `origem_id` para rastreabilidade contábil
- Mnemônico de conta bancária (`num_mnemonico`) — chave amigável além do seq
- Pessoa unificada com flags de papel
- Títulos como entidade central do financeiro (pagar/receber)
- Liquidação sempre gera movimento (banco ou caixa) — nunca atualiza saldo direto

---

## Início de cada sessão

1. Leia este arquivo completo
2. Pergunte qual fase/módulo será trabalhado hoje
3. Verifique migrations pendentes antes de escrever código
4. Siga: **SQL → Types → Zod → API → Hook → UI → IA**
5. Ao terminar, atualize este arquivo se houver mudança arquitetural

---

*Versão 3.0 — SaaS Multi-database · VPS própria · 1 Next.js · getDb dinâmico · JWT com database_name · PostgreSQL 17 · LATIN1*
*Baseado na análise do schema EMSys3 (abril/2026)*
