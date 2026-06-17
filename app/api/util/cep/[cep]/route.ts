import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: { cep: string } }) {
  const cep = params.cep.replace(/\D/g, '')
  if (cep.length !== 8) {
    return NextResponse.json({ erro: 'CEP inválido' }, { status: 400 })
  }

  try {
    // Tenta BrasilAPI primeiro, fallback para ViaCEP
    const [res1, res2] = await Promise.allSettled([
      fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: AbortSignal.timeout(5000) }),
      fetch(`https://viacep.com.br/ws/${cep}/json/`,       { signal: AbortSignal.timeout(5000) }),
    ])

    // BrasilAPI
    if (res1.status === 'fulfilled' && res1.value.ok) {
      const d = await res1.value.json()
      return NextResponse.json({
        cep:        d.cep,
        logradouro: d.street       ?? '',
        bairro:     d.neighborhood ?? '',
        cidade:     d.city         ?? '',
        uf:         d.state        ?? '',
        ibge:       d.ibge         ?? '',
      })
    }

    // ViaCEP fallback
    if (res2.status === 'fulfilled' && res2.value.ok) {
      const d = await res2.value.json()
      if (d.erro) return NextResponse.json({ erro: 'CEP não encontrado' }, { status: 404 })
      return NextResponse.json({
        cep:        d.cep,
        logradouro: d.logradouro ?? '',
        bairro:     d.bairro     ?? '',
        cidade:     d.localidade ?? '',
        uf:         d.uf         ?? '',
        ibge:       d.ibge       ?? '',
      })
    }

    return NextResponse.json({ erro: 'CEP não encontrado' }, { status: 404 })
  } catch {
    return NextResponse.json({ erro: 'Erro ao consultar CEP' }, { status: 502 })
  }
}
