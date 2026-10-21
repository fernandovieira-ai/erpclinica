import { Loader2 } from 'lucide-react'

// Mesmo motivo do loading.tsx do grupo (erp): dar feedback visual imediato
// enquanto o layout do admin verifica a sessão e busca dados no servidor.
export default function AdminLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', width: '100%', backgroundColor: '#0F1117',
    }}>
      <Loader2 className="spin" size={28} color="#93C5FD" />
    </div>
  )
}
