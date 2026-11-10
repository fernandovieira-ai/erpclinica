// Bipe de notificação via Web Audio API — sem depender de um arquivo de áudio.
// Dois tons curtos (mais parecido com alerta do que um bipe único e fraco).
// Navegadores bloqueiam áudio antes de qualquer interação do usuário na página;
// como o app exige login e cliques antes de chegar aqui, na prática já houve
// gesto suficiente.
export function tocarAlertaMensagem() {
  try {
    const AudioCtxClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtxClass()

    const tocarTom = (frequencia: number, inicioEm: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequencia
      const t0 = ctx.currentTime + inicioEm
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.22)
    }

    tocarTom(880, 0)
    tocarTom(1046, 0.17)
    setTimeout(() => ctx.close(), 500)
  } catch {
    // Web Audio indisponível ou autoplay bloqueado — alerta visual (pulso/card) já cobre
  }
}
