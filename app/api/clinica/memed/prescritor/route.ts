import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { obterOuCadastrarPrescritor, MemedApiError, splitNome, paraDataBr } from '@/lib/memed'

// POST /api/clinica/memed/prescritor — garante o prescritor cadastrado na Memed
// para o profissional do agendamento e devolve o token + dados do paciente
// prontos para o widget. Nunca confia em doctorId/patientId vindos do client:
// tudo é derivado do agendamento no servidor (mesmo princípio de app/api/voa/token).
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const agendamentoId = Number(body?.agendamento_id)
  if (!agendamentoId) {
    return NextResponse.json({ erro: 'agendamento_id é obrigatório' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT a.id, a.paciente_id, a.profissional_id,
            pac.nome AS paciente_nome, pac.cpf_cnpj AS paciente_cpf,
            pac.sexo AS paciente_sexo, TO_CHAR(pac.data_nascimento, 'YYYY-MM-DD') AS paciente_nascimento,
            pac.celular AS paciente_celular,
            pac.cep AS paciente_cep, pac.logradouro AS paciente_logradouro, pac.numero AS paciente_numero,
            pac.complemento AS paciente_complemento, pac.bairro AS paciente_bairro,
            pac.cidade AS paciente_cidade, pac.uf AS paciente_uf,
            prof.nome AS profissional_nome, prof.cpf_cnpj AS profissional_cpf,
            TO_CHAR(prof.data_nascimento, 'YYYY-MM-DD') AS profissional_nascimento, prof.sexo AS profissional_sexo,
            prof.crm, prof.crm_uf,
            e.memed_api_key, e.memed_secret_key, e.memed_ambiente
     FROM tab_agendamento a
     JOIN tab_pessoa pac  ON pac.id = a.paciente_id
     JOIN tab_pessoa prof ON prof.id = a.profissional_id
     JOIN tab_empresa e   ON e.id = a.empresa_id
     WHERE a.id = $1 AND a.empresa_id = $2`,
    [agendamentoId, session.empresa_id_ativa],
  )
  if (rows.length === 0) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }

  const ag = rows[0]

  if (!ag.memed_api_key || !ag.memed_secret_key) {
    return NextResponse.json(
      { erro: 'Integração Memed não configurada (Configurações → Empresa → Integração)' },
      { status: 503 },
    )
  }
  if (!ag.crm) {
    return NextResponse.json(
      { erro: `CRM não cadastrado para ${ag.profissional_nome}. Cadastre em Cadastros → Pessoas → aba Principal.` },
      { status: 400 },
    )
  }
  if (!ag.profissional_cpf) {
    return NextResponse.json(
      { erro: `CPF não cadastrado para ${ag.profissional_nome}. A Memed exige CPF válido do profissional para emitir receita.` },
      { status: 400 },
    )
  }
  if (!ag.profissional_nascimento) {
    return NextResponse.json(
      { erro: `Data de nascimento não cadastrada para ${ag.profissional_nome}. A Memed exige essa informação do profissional para emitir receita.` },
      { status: 400 },
    )
  }
  if (!ag.paciente_cpf) {
    return NextResponse.json(
      { erro: 'Paciente sem CPF cadastrado — obrigatório para emitir receita digital (exigência da Anvisa).' },
      { status: 400 },
    )
  }
  if (!ag.paciente_logradouro || !ag.paciente_numero || !ag.paciente_bairro || !ag.paciente_cidade || !ag.paciente_uf) {
    return NextResponse.json(
      { erro: `Endereço incompleto para ${ag.paciente_nome} — CEP, logradouro, número, bairro, cidade e UF são obrigatórios para emitir receita digital (exigência da Anvisa). Complete o endereço em Cadastros → Pessoas.` },
      { status: 400 },
    )
  }

  const cred = { apiKey: ag.memed_api_key as string, secretKey: ag.memed_secret_key as string }
  const { nome, sobrenome } = splitNome(ag.profissional_nome as string)

  try {
    const prescritor = await obterOuCadastrarPrescritor(
      {
        external_id:     `PROF-${ag.profissional_id}`,
        nome,
        sobrenome,
        data_nascimento: paraDataBr(ag.profissional_nascimento),
        cpf:              (ag.profissional_cpf ?? '').replace(/\D/g, ''),
        uf:               ag.crm_uf ?? '',
        sexo:             ag.profissional_sexo === 'F' ? 'F' : 'M',
        crm:              ag.crm,
      },
      cred,
    )

    await db.query(
      `INSERT INTO tab_memed_prescritor (empresa_id, profissional_id, external_id, memed_usuario_id, ultimo_status, ambiente)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (profissional_id) DO UPDATE SET
         memed_usuario_id = EXCLUDED.memed_usuario_id,
         ultimo_status     = EXCLUDED.ultimo_status,
         ambiente          = EXCLUDED.ambiente`,
      [
        session.empresa_id_ativa, ag.profissional_id, `PROF-${ag.profissional_id}`,
        prescritor.external_id ?? null, prescritor.status ?? null, ag.memed_ambiente,
      ],
    )

    const endereco = [
      `${ag.paciente_logradouro}, ${ag.paciente_numero}`,
      ag.paciente_complemento || null,
      ag.paciente_bairro,
      ag.paciente_cep ? `CEP ${ag.paciente_cep}` : null,
    ].filter(Boolean).join(' - ')

    return NextResponse.json({
      token: prescritor.token,
      paciente: {
        idExterno:       String(ag.paciente_id),
        nome:             ag.paciente_nome,
        cpf:              (ag.paciente_cpf ?? '').replace(/\D/g, ''),
        sexo:             ag.paciente_sexo === 'F' ? 'Feminino' : 'Masculino',
        data_nascimento:  paraDataBr(ag.paciente_nascimento),
        telefone:         ag.paciente_celular ?? undefined,
        endereco,
        cidade:           `${ag.paciente_cidade} - ${ag.paciente_uf}`,
      },
    })
  } catch (err) {
    if (err instanceof MemedApiError) {
      return NextResponse.json({ erro: 'Erro na API da Memed', detalhes: err.body }, { status: err.status })
    }
    console.error('[memed] erro inesperado', err)
    return NextResponse.json({ erro: 'Erro inesperado ao integrar com a Memed' }, { status: 500 })
  }
}
