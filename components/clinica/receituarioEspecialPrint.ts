import { montarEnderecoEmpresa, type DadosPrescritor } from './receitaSistemaPrint'

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Monta o endereco do paciente a partir dos campos do cadastro (fallback quando o
// receituario nao tem endereco congelado - registros antigos ou paciente sem endereco).
export function montarEnderecoPaciente(dados: DadosPrescritor | null): string {
  if (!dados) return ''
  const partes = [
    dados.paciente_logradouro && dados.paciente_numero
      ? `${dados.paciente_logradouro}, ${dados.paciente_numero}${dados.paciente_complemento ? ` - ${dados.paciente_complemento}` : ''}`
      : dados.paciente_logradouro,
    dados.paciente_bairro,
    dados.paciente_cidade && dados.paciente_uf ? `${dados.paciente_cidade}/${dados.paciente_uf}` : dados.paciente_cidade,
    dados.paciente_cep ? `CEP ${dados.paciente_cep}` : null,
  ].filter(Boolean)
  return partes.join(' - ')
}

export function gerarHtmlReceituarioEspecial(
  prescricao:        string,
  pacienteEndereco:  string | null,
  dados:             DadosPrescritor | null,
  pacienteNome:      string,
  profissionalNome:  string,
) {
  const profNome    = escapeHtml(dados?.profissional_nome ?? profissionalNome)
  const crm         = escapeHtml(dados?.crm ?? '')
  const crmUf       = escapeHtml(dados?.crm_uf ?? '')
  const pacNome     = escapeHtml(dados?.paciente_nome ?? pacienteNome)
  const pacEndereco = escapeHtml(pacienteEndereco || montarEnderecoPaciente(dados))
  const clinicaNome = escapeHtml(dados?.empresa_nome_fantasia || dados?.empresa_razao_social || '')
  const enderecoEmp = escapeHtml(montarEnderecoEmpresa(dados))
  const telefoneEmp = dados?.empresa_telefone ? escapeHtml(dados.empresa_telefone) : ''
  const emitenteEndTel = [enderecoEmp, telefoneEmp ? `Tel.: ${telefoneEmp}` : ''].filter(Boolean).join(' - ')
  const cidadeEmp   = escapeHtml(dados?.empresa_cidade ?? '')
  const ufEmp       = escapeHtml(dados?.empresa_uf ?? '')
  const prescHtml   = escapeHtml(prescricao).replace(/\n/g, '<br/>')
  // logo_base64 e validado no backend (zod: precisa comecar com "data:image/") e so
  // editavel por quem administra a empresa - nao e entrada de paciente/prescricao.
  const logo        = dados?.empresa_logo_base64 || ''
  const brandHtml   = logo
    ? `<div class="brand"><img src="${logo}" alt="${clinicaNome}" /></div>`
    : (clinicaNome ? `<div class="brand"><div class="brand-nome">${clinicaNome}</div></div>` : '')

  const folha = (viaLabel: string) => `
  <div class="folha">
    ${brandHtml}
    <div class="cabecalho">
      <div class="titulo-box">RECEITU&Aacute;RIO CONTROLE ESPECIAL</div>
      <div class="vias">1&ordf; Via - Farm&aacute;cia<br/>2&ordf; Via - Paciente</div>
    </div>

    <div class="bloco bloco-emitente">
      <div class="bloco-titulo">Identifica&ccedil;&atilde;o do Emitente</div>
      <div class="campo"><span class="rot">Nome Completo:</span><span class="val">${profNome}</span></div>
      <div class="linha-dupla">
        <div class="campo campo-crm"><span class="rot">CRM:</span><span class="val">${crm}</span></div>
        <div class="campo campo-uf"><span class="rot">UF:</span><span class="val">${crmUf}</span></div>
      </div>
      <div class="campo"><span class="rot">Endere&ccedil;o completo e telefone:</span><span class="val">${emitenteEndTel}</span></div>
      <div class="linha-dupla">
        <div class="campo campo-cidade"><span class="rot">Cidade:</span><span class="val">${cidadeEmp}</span></div>
        <div class="campo campo-uf"><span class="rot">UF:</span><span class="val">${ufEmp}</span></div>
      </div>
    </div>

    <div class="campo campo-solto"><span class="rot">Paciente:</span><span class="val">${pacNome}</span></div>
    <div class="campo campo-solto"><span class="rot">Endere&ccedil;o:</span><span class="val">${pacEndereco}</span></div>

    <div class="prescricao">
      <div class="prescricao-rot">Prescri&ccedil;&atilde;o:</div>
      <div class="prescricao-corpo">${prescHtml}</div>
    </div>

    <div class="rodape">
      <div class="bloco bloco-meio">
        <div class="bloco-titulo">Identifica&ccedil;&atilde;o do Comprador</div>
        <div class="campo vazio"><span class="rot">Nome:</span><span class="val"></span></div>
        <div class="campo vazio"><span class="val"></span></div>
        <div class="linha-dupla">
          <div class="campo vazio campo-ci"><span class="rot">CI:</span><span class="val"></span></div>
          <div class="campo vazio campo-org"><span class="rot">&Oacute;rg. Em.:</span><span class="val"></span></div>
        </div>
        <div class="campo vazio"><span class="rot">Endere&ccedil;o:</span><span class="val"></span></div>
        <div class="campo vazio"><span class="val"></span></div>
        <div class="linha-dupla">
          <div class="campo vazio campo-cidade"><span class="rot">Cidade:</span><span class="val"></span></div>
          <div class="campo vazio campo-uf"><span class="rot">UF:</span><span class="val"></span></div>
        </div>
        <div class="campo vazio"><span class="rot">Telefone:</span><span class="val"></span></div>
      </div>

      <div class="bloco bloco-meio">
        <div class="bloco-titulo">Identifica&ccedil;&atilde;o do Fornecedor</div>
        <div class="fornecedor-espaco"></div>
        <div class="fornecedor-assinatura">
          <div class="col-assinatura"><div class="linha-assinatura"></div>Assinatura do Farmac&ecirc;utico</div>
          <div class="col-data"><div class="linha-assinatura"></div>Data</div>
        </div>
      </div>
    </div>

    <div class="marca-via">${viaLabel}</div>
  </div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>&nbsp;</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:A4; margin:1.2cm 1.4cm; }
  body { font-family:'Segoe UI', Arial, Helvetica, sans-serif; color:#111; font-size:10.5pt; }

  .folha { width:100%; page-break-after:always; }
  .folha:last-child { page-break-after:auto; }

  .brand { text-align:center; margin-bottom:7px; }
  .brand img { max-height:34px; max-width:220px; object-fit:contain; }
  .brand-nome { font-size:11pt; font-weight:800; color:#111; letter-spacing:.01em; }

  .cabecalho { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:12px; }
  .titulo-box {
    flex:1; text-align:center; font-weight:800; font-size:15pt; letter-spacing:.02em;
    border:1.5px solid #111; border-radius:9px; padding:9px 12px;
  }
  .vias { font-size:8.5pt; line-height:1.5; white-space:nowrap; padding-top:2px; }

  .bloco { border:1px solid #111; border-radius:7px; padding:8px 12px 10px; margin-bottom:10px; }
  .bloco-titulo {
    text-align:center; font-size:9.5pt; font-style:italic; color:#222;
    border-bottom:1px solid #999; padding-bottom:3px; margin-bottom:8px;
  }

  .campo { display:flex; align-items:flex-end; gap:5px; margin-top:9px; min-height:16px; }
  .campo:first-of-type { margin-top:2px; }
  .campo .rot { font-size:9.5pt; white-space:nowrap; }
  .campo .val {
    flex:1; border-bottom:1px solid #111; min-height:14px; padding:0 3px 1px;
    font-size:10pt; font-weight:600;
  }
  .campo-solto { margin:10px 2px; }

  .linha-dupla { display:flex; gap:16px; }
  .linha-dupla .campo { flex:1; }
  .campo-uf { max-width:90px; flex:0 0 90px; }
  .campo-crm { flex:1; }

  .prescricao { margin:12px 2px 14px; }
  .prescricao-rot { font-size:9.5pt; margin-bottom:2px; }
  .prescricao-corpo {
    min-height:8.2cm; padding:4px 3px; font-size:11pt; font-weight:600; line-height:0.85cm;
    background-image:repeating-linear-gradient(to bottom, transparent 0, transparent calc(0.85cm - 1px), #111 calc(0.85cm - 1px), #111 0.85cm);
    background-position:0 2px;
    white-space:pre-wrap; word-break:break-word;
  }

  .rodape { display:flex; gap:12px; align-items:stretch; }
  .bloco-meio { flex:1; margin-bottom:0; }
  .bloco-meio .campo { margin-top:8px; }
  .campo.vazio .val { font-weight:400; }
  .campo-ci { flex:1; }
  .campo-org { flex:1; }
  .campo-cidade { flex:1; }

  .fornecedor-espaco { min-height:3.2cm; }
  .fornecedor-assinatura { display:flex; gap:14px; align-items:flex-end; }
  .col-assinatura { flex:1; text-align:center; font-size:8.5pt; }
  .col-data { flex:0 0 34%; text-align:center; font-size:8.5pt; }
  .linha-assinatura { border-top:1px solid #111; margin-bottom:3px; height:1px; }

  .marca-via {
    margin-top:10px; text-align:center; font-size:8pt; letter-spacing:.18em;
    font-weight:700; color:#666;
  }

  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
${folha('1&ordf; VIA - FARM&Aacute;CIA')}
${folha('2&ordf; VIA - PACIENTE')}
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
