import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Acessar a página de recebimentos
    await page.goto('http://localhost:3001/clinica/recebimentos', { waitUntil: 'networkidle' });
    
    console.log('Página carregada');
    
    // Tirar screenshot do estado inicial
    await page.screenshot({ path: 'inicial.png', fullPage: true });
    console.log('Screenshot 1 - Estado inicial');
    
    // Aguardar carregamento da página
    await page.waitForLoadState('networkidle');
    
    // Verificar se há agendamentos
    const agendamentosCount = await page.locator('[role="main"] button:has-text("Receber")').count();
    console.log(`Agendamentos encontrados: ${agendamentosCount}`);
    
    if (agendamentosCount > 0) {
      // Clicar no primeiro botão de receber
      const primeiroReceber = page.locator('[role="main"] button:has-text("Receber")').first();
      await primeiroReceber.click();
      
      console.log('Modal aberto');
      await page.waitForTimeout(1000);
      
      // Tirar screenshot do modal
      await page.screenshot({ path: 'modal_aberto.png', fullPage: true });
      
      // Confirmar o recebimento
      const confirmarBtn = page.locator('button:has-text("Confirmar Recebimento")');
      await confirmarBtn.click();
      
      console.log('Clicado em Confirmar Recebimento');
      
      // Aguardar a atualização
      await page.waitForTimeout(2000);
      
      // Tirar screenshot após salvar
      await page.screenshot({ path: 'apos_salvar.png', fullPage: true });
      console.log('Screenshot 3 - Após salvar recebimento');
      
      console.log('✅ Teste concluído com sucesso!');
    } else {
      console.log('❌ Nenhum agendamento encontrado para testar');
    }
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await browser.close();
  }
})();
