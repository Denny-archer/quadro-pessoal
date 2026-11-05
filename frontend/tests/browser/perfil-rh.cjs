/* Homologação apenas: preparar_demandas.py + compose.validacao.yml, nunca banco real.
   Requer Playwright disponível em node_modules (ou NODE_PATH).
   BROWSER_EXECUTABLE pode apontar para Chrome/Chromium instalado. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const URL = 'http://127.0.0.1:18043';
const H = { 'X-Requested-With': 'quadro-pessoal' };
const output = process.env.BROWSER_OUTPUT || path.join(require('node:os').tmpdir(), 'rh-perfil-browser');
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const erros = [];
  try {
    const admin = await browser.newContext({baseURL:URL});
    let r = await admin.request.post('/api/auth/login', {headers:H, data:{email:'admin@teste.local', senha:'Validacao-local!2026'}});
    assert.equal(r.status(), 200);
    const usuarios = await (await admin.request.get('/api/usuarios')).json();
    const rh = usuarios.find(u => u.papel === 'rh');
    assert.ok(rh);
    const context = await browser.newContext({baseURL:URL, viewport:{width:1366,height:900}});
    const page = await context.newPage();
    page.on('pageerror', e => erros.push(e.message));
    await page.goto('/login');
    await page.locator('#email').fill('rh@teste.local');
    await page.locator('#senha').fill('Validacao-local!2026');
    await page.locator('button[type="submit"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.lancarRh === 'true' && !document.querySelector('#view')?.textContent.includes('Carregando'));
    assert.equal(await page.locator('#new-func').isVisible(), false);
    assert.equal(await page.locator('#new-lanc').isVisible(), true);
    assert.equal(await page.locator('#qp-imp').isVisible(), false);
    assert.equal(await page.locator('a[href="/administracao"]').isVisible(), false);
    assert.equal((await context.request.get('/administracao')).status(),403);
    await page.locator('[data-tab="func"]').click();
    await page.locator('[data-sel="ana"]').click();
    await page.locator('[data-saldos="ana"]').click();
    const dialog = page.locator('#dlg-saldos');
    await dialog.locator('[data-ref="ref2025"] [data-incluir]').check();
    await dialog.locator('[data-ref="ref2025"] [data-campo="restantes"]').fill('3');
    await dialog.locator('[data-ref="ref2025"] [data-campo="usados"]').fill('2');
    await page.screenshot({path:path.join(output,'saldos-desktop.png')});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:path.join(output,'saldos-escuro.png')});
    let resposta = page.waitForResponse(r=>r.url().endsWith('/funcionarios/ana/saldos') && r.request().method()==='PUT');
    await dialog.locator('[type="submit"]').click();
    assert.equal((await resposta).status(),200);
    await page.waitForFunction(()=>!document.querySelector('#dlg-saldos')?.open);

    // Férias com período calculado: primeiro grava saldos, depois o lançamento.
    await page.locator('[data-new-for="ana"]').click();
    await page.locator('#l-tipo').selectOption('ferias');
    await page.locator('#l-inicio').fill('2026-11-02');
    await page.locator('#l-fim').fill('2026-11-06');
    const ferias = page.waitForResponse(r=>r.url().includes('/api/dados/ocorrencias/') && r.request().method()==='PUT');
    await page.locator('#l-save').click();
    assert.equal((await ferias).status(),200);
    await page.waitForFunction(()=>!document.querySelector('#dlg-lanc')?.open);
    let funcionarios = await (await context.request.get('/api/dados/funcionarios')).json();
    assert.equal(funcionarios.find(f=>f.id==='ana').periodosAquisitivos.length,1);

    // Um conflito conserva os valores digitados e não altera o cadastro.
    await page.locator('[data-saldos="ana"]').click();
    await dialog.locator('[data-ref="ref2025"] [data-campo="restantes"]').fill('1');
    const anterior = funcionarios.find(f=>f.id==='ana');
    r = await admin.request.put('/api/dados/funcionarios/ana', {headers:H, data:{...anterior,nome:'Ana Teste Atualizada'}});
    assert.equal(r.status(),200);
    resposta = page.waitForResponse(r=>r.url().endsWith('/funcionarios/ana/saldos') && r.request().method()==='PUT');
    await dialog.locator('[type="submit"]').click();
    assert.equal((await resposta).status(),409);
    assert.equal(await dialog.locator('[data-ref="ref2025"] [data-campo="restantes"]').inputValue(),'1');
    assert.ok(await dialog.locator('[data-erro]').textContent());
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'saldos-mobile.png')});
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);

    // Revogação em outra sessão fecha o formulário e elimina dados incompatíveis.
    r = await admin.request.patch('/api/usuarios/'+rh.id,{headers:H,data:{papel:'colaborador'}});
    assert.equal(r.status(),200);
    await page.waitForFunction(()=>document.documentElement.dataset.papel==='colaborador' && !document.querySelector('#dlg-saldos')?.open);
    assert.equal(await page.locator('#new-lanc').isVisible(),false);
    assert.equal(await page.locator('[data-tab="panorama"]').isVisible(),false);
    await page.waitForFunction(()=>document.querySelectorAll('[data-sel]').length===1);
    assert.equal(await page.locator('[data-sel]').getAttribute('data-sel'),'dora');
    await admin.request.patch('/api/usuarios/'+rh.id,{headers:H,data:{papel:'rh'}});
    await page.waitForFunction(()=>document.documentElement.dataset.papel==='rh');
    await page.goto('/demandas/');
    await page.waitForFunction(()=>document.documentElement.dataset.gestao==='false');
    for (const [id, setorId, responsavelId] of [['ui-a',1,'ana'],['ui-b',2,'bruno'],['ui-c',3,'carla']]) {
      r = await admin.request.put('/api/demandas/demandas/'+id,{headers:H,data:{versao:0,dados:{titulo:id,setorId,responsavelId}}});
      assert.equal(r.status(),200);
    }
    let estado = await (await context.request.get('/api/demandas/estado')).json();
    assert.equal(estado.demandas.length,0);
    await admin.request.put(`/api/acesso/usuarios/${rh.id}/vinculo`,{headers:H,data:{funcionario_id:'dora',setores:[1,2]}});
    await page.waitForFunction(()=>document.documentElement.dataset.gestao==='true');
    estado = await (await context.request.get('/api/demandas/estado')).json();
    assert.deepEqual(estado.demandas.map(d=>d.id).sort(),['ui-a','ui-b']);
    assert.equal((await context.request.get('/api/demandas/demandas/ui-c')).status(),404);
    await page.setViewportSize({width:1366,height:900});
    await page.screenshot({path:path.join(output,'rh-demandas.png')});

    // Cada perfil abre o painel sem erro de contexto nem lista vazia falsa.
    for (const [email, papel] of [['admin@teste.local','admin'],['gestor@teste.local','gestor'],['ana@teste.local','colaborador']]) {
      const ctx = await browser.newContext({baseURL:URL});
      await ctx.request.post('/api/auth/login',{headers:H,data:{email,senha:'Validacao-local!2026'}});
      const p = await ctx.newPage(); p.on('pageerror',e=>erros.push(e.message));
      await p.goto('/');
      await p.waitForFunction(papel=>document.documentElement.dataset.papel===papel && document.querySelector('#view')?.textContent && !document.querySelector('#view').textContent.includes('Carregando'),papel);
      assert.equal(await p.locator('#new-lanc').isVisible(),papel==='admin');
      if(papel==='admin') {
        await p.goto('/administracao');
        await p.locator('[data-conta]').first().waitFor();
        assert.equal(await p.locator('#criar-conta [name="papel"]').inputValue(),'colaborador');
        await p.locator(`[data-conta="${rh.id}"] summary`).click();
        assert.equal(await p.locator(`[data-conta="${rh.id}"] .conta-setores`).isVisible(),true);
      }
      await ctx.close();
    }
    // Contexto indisponível: mensagem explícita e botão de nova tentativa.
    await page.route('**/api/acesso/contexto',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'Falha de homologação'})}));
    await page.goto('/');
    await page.locator('[data-repetir-carga]').waitFor();
    await page.unroute('**/api/acesso/contexto');
    await page.locator('[data-repetir-carga]').click();
    await page.locator('[data-sel="ana"]').waitFor();
    assert.deepEqual(erros,[]);
    console.log('PASSOU: quatro perfis, permissões visuais, férias automáticas, saldos, conflito preservado, responsividade, revogação, Demandas por setor e recuperação de carga.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
