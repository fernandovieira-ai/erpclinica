import { Loader2 } from 'lucide-react'

// Exibido automaticamente pelo Next.js enquanto o layout/página do ERP busca
// dados no servidor (ex: logo após o login). Sem isso, a navegação ficava sem
// nenhum feedback visual até a página de destino terminar de carregar.
export default function ErpLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', width: '100%',
    }}>
      <Loader2 className="spin" size={28} color="var(--cor-primaria)" />
    </div>
  )
}
