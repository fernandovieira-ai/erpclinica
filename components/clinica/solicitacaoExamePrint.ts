import { montarEnderecoEmpresa, type DadosPrescritor } from './receitaSistemaPrint'

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

// data: Date atual -> "28 de julho de 2026" (convencao de documento formal brasileiro)
function dataAtualPorExtenso(): string {
  const d = new Date()
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

export function gerarHtmlSolicitacaoExame(
  caracter:          'ROTINA' | 'URGENCIA',
  indicacaoClinica:  string | null,
  exames:            string,
  dados:             DadosPrescritor | null,
  pacienteNome:      string,
  profissionalNome:  string,
) {
  const profNome    = escapeHtml(dados?.profissional_nome ?? profissionalNome)
  const crm         = dados?.crm ? escapeHtml(`CRM ${dados.crm_uf ?? ''} ${dados.crm}`.trim()) : ''
  const pacNome     = escapeHtml(dados?.paciente_nome ?? pacienteNome)
  const clinicaNome = escapeHtml(dados?.empresa_nome_fantasia || dados?.empresa_razao_social || '')
  // logo_base64 é validado no backend e só editável por quem administra a empresa;
  // escapado mesmo assim por defesa em profundidade (vai dentro de um atributo src).
  const logo        = escapeHtml(dados?.empresa_logo_base64 || '')
  const endereco    = escapeHtml(montarEnderecoEmpresa(dados))
  const telefone    = dados?.empresa_telefone ? escapeHtml(dados.empresa_telefone) : ''
  const cidade      = dados?.empresa_cidade ? escapeHtml(dados.empresa_cidade) : ''
  const examesHtml  = escapeHtml(exames).replace(/\n/g, '<br/>')
  const indicacaoHtml = indicacaoClinica
    ? `<div class="indicacao"><strong>Indica&ccedil;&atilde;o cl&iacute;nica:</strong> ${escapeHtml(indicacaoClinica)}</div>`
    : ''
  const urgente     = caracter === 'URGENCIA'
  const caraterHtml = `<div class="caracter ${urgente ? 'urgente' : ''}">${urgente ? 'URGÊNCIA' : 'ROTINA'}</div>`
  const dataLocal   = escapeHtml([cidade, dataAtualPorExtenso()].filter(Boolean).join(', '))

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Solicita&ccedil;&atilde;o de Exame</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:A4; margin:1.8cm 2cm; }
  html, body { height:100%; }
  body {
    font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:11pt; color:#26251F;
    display:flex; flex-direction:column;
  }
  .wrap { max-width:17cm; width:100%; margin:0 auto; display:flex; flex-direction:column; flex:1; }

  .brand { display:flex; flex-direction:column; align-items:center; gap:4px; margin-bottom:14px; }
  .brand img { max-height:44px; max-width:220px; object-fit:contain; }
  .brand-nome { font-size:12.5pt; font-weight:800; color:#0B3A35; letter-spacing:.01em; }

  .topo { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px;
          border-bottom:2.5px solid #B45309; padding-bottom:12px; }
  .titulo { font-size:12pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#0B3A35; }
  .caracter { font-size:9.5pt; font-weight:800; letter-spacing:.08em; color:#5F5E58;
              border:1.5px solid #5F5E58; border-radius:5px; padding:3px 10px; }
  .caracter.urgente { color:#B02A37; border-color:#B02A37; }

  .pac { display:flex; gap:22px; flex-wrap:wrap; background:#F8F8F6;
         border-radius:6px; padding:10px 14px; margin-bottom:18px; font-size:10.5pt; }
  .pac-campo span  { font-size:8.5pt; color:#8A8A85; display:block; text-transform:uppercase; letter-spacing:.04em; margin-bottom:1px; }
  .pac-campo strong{ font-size:11.5pt; color:#1A1A18; }

  .indicacao { font-size:10.5pt; color:#444; margin-bottom:18px; line-height:1.6; }
  .indicacao strong { color:#1A1A18; }

  .exames-rot { font-size:9.5pt; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
                color:#8A8A85; margin-bottom:8px; }
  .corpo { flex: 0 0 auto; font-size:12.5pt; line-height:1.9; color:#1A1A18; padding:0 6px; }

  .data-local { margin-top:40px; text-align:center; font-size:11pt; color:#333; }

  .spacer { flex: 1 1 auto; min-height:24px; }

  .footer { flex:0 0 auto; }
  .assinatura { display:flex; justify-content:center; margin:28px 0 16px; }
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

  <div class="topo">
    <div class="titulo">Solicita&ccedil;&atilde;o de Exame</div>
    ${caraterHtml}
  </div>

  <div class="pac">
    <div class="pac-campo"><span>Paciente</span><strong>${pacNome}</strong></div>
  </div>

  ${indicacaoHtml}

  <div class="exames-rot">Exames solicitados</div>
  <div class="corpo">${examesHtml}</div>

  ${dataLocal ? `<div class="data-local">${dataLocal}</div>` : ''}

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
