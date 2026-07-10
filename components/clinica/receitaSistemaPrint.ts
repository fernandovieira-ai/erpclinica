export interface ItemReceitaImpressao {
  nome:         string
  apresentacao?: string | null
  posologia?:    string | null
  duracao?:      string | null
  quantidade?:   string | null
}

export interface DadosPrescritor {
  profissional_nome:    string
  crm:                  string | null
  crm_uf:               string | null
  paciente_nome:        string
  paciente_nascimento:  string | null
  data_consulta:        string
  empresa_razao_social?:  string | null
  empresa_nome_fantasia?: string | null
  empresa_logo_base64?:   string | null
  empresa_telefone?:      string | null
  empresa_logradouro?:    string | null
  empresa_numero?:        string | null
  empresa_complemento?:   string | null
  empresa_bairro?:        string | null
  empresa_cidade?:        string | null
  empresa_uf?:            string | null
  empresa_cep?:           string | null
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function montarEnderecoEmpresa(dados: DadosPrescritor | null): string {
  if (!dados) return ''
  const partes = [
    dados.empresa_logradouro && dados.empresa_numero
      ? `${dados.empresa_logradouro}, ${dados.empresa_numero}${dados.empresa_complemento ? ` — ${dados.empresa_complemento}` : ''}`
      : dados.empresa_logradouro,
    dados.empresa_bairro,
    dados.empresa_cidade && dados.empresa_uf ? `${dados.empresa_cidade}/${dados.empresa_uf}` : dados.empresa_cidade,
    dados.empresa_cep ? `CEP ${dados.empresa_cep}` : null,
  ].filter(Boolean)
  return partes.join(' · ')
}

export function gerarHtmlReceita(
  itens:       ItemReceitaImpressao[],
  observacoes: string | null,
  dados:       DadosPrescritor | null,
  pacienteNome: string,
  profissionalNome: string,
) {
  const profNome    = escapeHtml(dados?.profissional_nome ?? profissionalNome)
  const crm         = dados?.crm ? escapeHtml(`CRM ${dados.crm_uf ?? ''} ${dados.crm}`.trim()) : ''
  const pacNome     = escapeHtml(dados?.paciente_nome ?? pacienteNome)
  const data        = escapeHtml(dados?.data_consulta ?? new Date().toLocaleDateString('pt-BR'))
  const nasc        = dados?.paciente_nascimento ? escapeHtml(dados.paciente_nascimento) : ''
  const clinicaNome = escapeHtml(dados?.empresa_nome_fantasia || dados?.empresa_razao_social || '')
  // logo_base64 é validado no backend (zod: precisa começar com "data:image/") e só editável
  // por quem administra a empresa — não é entrada de paciente/prescrição, risco de injeção é baixo.
  const logo        = dados?.empresa_logo_base64 || ''
  const endereco    = escapeHtml(montarEnderecoEmpresa(dados))
  const telefone    = dados?.empresa_telefone ? escapeHtml(dados.empresa_telefone) : ''
  const obsHtml     = observacoes ? escapeHtml(observacoes).replace(/\n/g, '<br/>') : ''

  const medsHtml = itens.map((it, i) => `
    <div class="med">
      <div class="med-nome">${i + 1}. ${escapeHtml(it.nome)}${it.apresentacao ? ` &mdash; ${escapeHtml(it.apresentacao)}` : ''}</div>
      ${it.posologia ? `<div class="med-pos">${escapeHtml(it.posologia)}</div>` : ''}
      <div class="med-detalhe">
        ${it.duracao   ? `<span>Dura&ccedil;&atilde;o: ${escapeHtml(it.duracao)}</span>` : ''}
        ${it.quantidade ? `<span>Qtd.: ${escapeHtml(it.quantidade)}</span>` : ''}
      </div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Receita M&eacute;dica</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:A4; margin:1.8cm 2cm; }
  html, body { height:100%; }
  body {
    font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11pt; color:#26251F;
    display:flex; flex-direction:column;
  }
  .wrap { max-width:17cm; width:100%; margin:0 auto; display:flex; flex-direction:column; flex:1; }

  /* Cabeçalho — logo + clínica */
  .brand { display:flex; flex-direction:column; align-items:center; gap:4px; margin-bottom:14px; }
  .brand img { max-height:44px; max-width:220px; object-fit:contain; }
  .brand-nome { font-size:12.5pt; font-weight:800; color:#0B3A35; letter-spacing:.01em; }

  .titulo { text-align:center; font-size:11.5pt; font-weight:800; letter-spacing:.16em;
            text-transform:uppercase; color:#0B3A35;
            padding:6px 10px 10px; margin-bottom:16px;
            border-bottom:2.5px solid #12857A; }

  /* Paciente */
  .pac { display:flex; gap:22px; flex-wrap:wrap; background:#F8F8F6;
         border-radius:6px; padding:10px 14px; margin-bottom:18px; font-size:10.5pt; }
  .pac-campo span  { font-size:8.5pt; color:#8A8A85; display:block; text-transform:uppercase; letter-spacing:.04em; margin-bottom:1px; }
  .pac-campo strong{ font-size:11.5pt; color:#1A1A18; }

  /* Medicamentos */
  .meds { flex: 0 0 auto; }
  .med { margin-bottom:12px; padding:10px 14px; page-break-inside: avoid;
         background:#F8F8F6; border-left:3px solid #12857A; border-radius:0 6px 6px 0; }
  .med-nome   { font-weight:700; font-size:12pt; margin-bottom:3px; color:#1A1A18; }
  .med-pos    { font-size:11pt; color:#333; }
  .med-detalhe{ font-size:9.5pt; color:#767670; margin-top:4px; display:flex; gap:14px; }

  /* Observações */
  .obs { margin:4px 0 18px; padding:10px 14px; background:#FFFDF0;
         border:1px solid #E8D87A; border-radius:6px; font-size:10.5pt; }
  .obs-titulo { font-size:8.5pt; font-weight:700; text-transform:uppercase;
                color:#928B4A; margin-bottom:4px; letter-spacing:.05em; }

  /* Empurra o rodapé para o fim da página */
  .spacer { flex: 1 1 auto; min-height:24px; }

  /* Assinatura + dados da clínica no rodapé */
  .footer { flex:0 0 auto; }
  .assinatura { display:flex; justify-content:center; margin-bottom:16px; }
  .assinatura-linha {
    width:260px; border-top:1px solid #55554F; padding-top:6px;
    text-align:center; font-size:10pt; color:#333; line-height:1.5;
  }
  .assinatura-linha strong { display:block; font-size:10.5pt; color:#1A1A18; }

  .rodape-clinica {
    text-align:center; border-top:1px solid #E4E4DE; padding-top:8px;
    font-size:9pt; color:#8A8A85; line-height:1.6;
  }
  .rodape-clinica strong { color:#5F5E58; font-weight:700; }

  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<div class="wrap">

  <div class="brand">
    ${logo ? `<img src="${logo}" alt="${clinicaNome}" />` : ''}
    ${clinicaNome && !logo ? `<div class="brand-nome">${clinicaNome}</div>` : ''}
  </div>

  <div class="titulo">Receita M&eacute;dica</div>

  <div class="pac">
    <div class="pac-campo"><span>Paciente</span><strong>${pacNome}</strong></div>
    <div class="pac-campo"><span>Data</span><strong>${data}</strong></div>
    ${nasc ? `<div class="pac-campo"><span>Nascimento</span><strong>${nasc}</strong></div>` : ''}
  </div>

  <div class="meds">
    ${medsHtml}
  </div>

  ${obsHtml
    ? `<div class="obs"><div class="obs-titulo">Observa&ccedil;&otilde;es</div>${obsHtml}</div>`
    : ''}

  <div class="spacer"></div>

  <div class="footer">
    <div class="assinatura">
      <div class="assinatura-linha">
        <strong>${profNome}</strong>
        ${crm}
      </div>
    </div>
    ${(clinicaNome || endereco || telefone) ? `
    <div class="rodape-clinica">
      ${clinicaNome ? `<strong>${clinicaNome}</strong><br/>` : ''}
      ${endereco ? `${endereco}<br/>` : ''}
      ${telefone ? `Tel.: ${telefone}` : ''}
    </div>` : ''}
  </div>

</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
