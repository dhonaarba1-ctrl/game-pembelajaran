const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const {tmpdir}=require('node:os');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const files = {
  Word: 'Word_Classroom_Halaman_Lengkap_HP_PC.html',
  Excel: 'Excel_Formula_Pro_HP_PC.html',
};
const log = [];
const browserErrors = [];
let browser;

async function test(label, fn) {
  try {
    await fn();
    log.push({ label, passed: true });
    console.log('PASS', label);
  } catch (error) {
    log.push({ label, passed: false, error: String(error) });
    console.error('FAIL', label, error.message);
  }
}

async function waitFor(page, fn) {
  await page.waitForFunction(fn, undefined, { timeout: 4500 });
}

async function load(app, viewport = { width: 1366, height: 768 }, touch = false) {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, offline: true });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(app + ' ' + error.message));
  page.setDefaultTimeout(4000);
  await page.goto(pathToFileURL(resolve(__dirname, '..', files[app])).href);
  await login(page, app);
  return page;
}

async function login(page, app, code = '01', name = 'Siswa Uji') {
  const gate = app === 'Word' ? '#loginGate' : '#studentGate';
  if (!(await page.locator(gate).isVisible())) await page.locator('#studentBadge').click();
  await page.locator('#studentName').fill(name);
  await page.locator('#studentClass').fill('7A');
  await page.locator('#studentCode').fill(code);
  await page.locator('#studentCode').press('Enter');
  await page.locator(gate).waitFor({ state: 'hidden' });
}

async function wordPosition(page, start, end = start) {
  await page.evaluate(([a, b]) => {
    function locate([index, offset]) {
      const paragraph = document.querySelectorAll('#editor .page-body p')[index];
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (offset <= node.length) return [node, offset];
        offset -= node.length;
      }
      return [paragraph, 0];
    }
    editor.focus();
    const [left, lo] = locate(a), [right, ro] = locate(b);
    getSelection().setBaseAndExtent(left, lo, right, ro);
    saveSelection();
  }, [start, end]);
}

async function excelSelect(page, address) {
  await page.locator('#nameBox').fill(address);
  await page.locator('#nameBox').press('Enter');
  await page.locator('#nameBox').blur();
}

async function wordTests() {
  const page = await load('Word');
  await test('Word mission counts, progression gate and document samples', async () => {
    assert.deepEqual(await page.evaluate(() => [levels.length, TOTAL_MISSIONS, DOC_MISSIONS.length, levelUnlocked(1)]), [10, 80, 21, false]);
    assert.ok(await page.evaluate(() => DOC_MISSIONS.every(m => m.checks.length >= 2)));
  });
  await test('Word Enter, Shift+Enter, middle insertion and page location', async () => {
    await page.locator('#pageBody1').click({ position: { x: 8, y: 8 } });
    await page.keyboard.insertText('abcd');
    await wordPosition(page, [0, 2]);
    await page.keyboard.insertText('EF');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.insertText('line');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('next');
    const state = await page.evaluate(() => [pages().length, bodies()[0].querySelectorAll(':scope > p').length, wordText(), bodies()[0].querySelector('br') !== null]);
    assert.equal(state[0], 1);
    assert.equal(state[1], 2);
    assert.match(state[2], /abEFcd\s+line\s+next/);
    assert.ok(state[3]);
  });
  await test('Word character selections, distinct fonts, points and colors', async () => {
    await page.evaluate(() => { editor.innerHTML = '<p>Alpha Beta Gamma</p>'; });
    await wordPosition(page, [0, 0], [0, 5]);
    await page.evaluate(() => { applyFont('Arial'); applySize(12); });
    await wordPosition(page, [0, 6], [0, 10]);
    await page.evaluate(() => { applyFont('Georgia'); applySize(18); applyInlineColor('#af1234', false); });
    await wordPosition(page, [0, 7], [0, 9]);
    await page.evaluate(() => { applyFont('Times New Roman'); applySize(14); });
    const actual = await page.evaluate(() => {
      const walker = document.createTreeWalker(bodies()[0].querySelector('p'), NodeFilter.SHOW_TEXT);
      const vals = [];
      let n;
      while ((n = walker.nextNode())) if (n.textContent.trim()) {
        const style = getComputedStyle(n.parentElement);
        vals.push([n.textContent, style.fontFamily, Math.round(parseFloat(style.fontSize)), style.color]);
      }
      return vals;
    });
    assert.deepEqual(actual.slice(0, 4).map(([t, font, px, color]) => [t, font.split(',')[0].replaceAll('"', ''), px, color]), [
      ['Alpha', 'Arial', 16, 'rgb(29, 38, 52)'], ['B', 'Georgia', 24, 'rgb(175, 18, 52)'],
      ['et', 'Times New Roman', 19, 'rgb(175, 18, 52)'], ['a', 'Georgia', 24, 'rgb(175, 18, 52)'],
    ]);
  });
  await test('Word Ctrl+Enter, Undo, Redo and cross-page replacement', async () => {
    await page.evaluate(() => { editor.innerHTML = '<p>Awal Tengah Akhir</p>'; history=[]; redoHistory=[]; });
    await wordPosition(page, [0, 5]);
    await page.keyboard.press('Control+Enter');
    await waitFor(page, () => pages().length === 2);
    assert.match(await page.evaluate(() => bodies()[1].textContent), /Tengah Akhir/);
    await wordPosition(page, [0, 3], [1, 7]);
    await page.keyboard.insertText('X');
    assert.equal(await page.evaluate(() => wordText().trim()), 'AwaXAkhir');
    await page.keyboard.press('Control+z');
    assert.match(await page.evaluate(() => wordText().replace(/\s+/g, ' ')), /Awal Tengah Akhir/);
    await page.keyboard.press('Control+y');
    assert.equal(await page.evaluate(() => wordText().trim()), 'AwaXAkhir');
  });
  await test('Word automatic pages and caret preservation on edit', async () => {
    await page.evaluate(() => {
      editor.innerHTML = Array.from({length: 85}, (_, i) => '<p>Paragraf ' + (i + 1) + '</p>').join('');
    });
    await waitFor(page, () => pages().length >= 2);
    await wordPosition(page,[54,4]);
    await page.keyboard.insertText('X');
    await page.waitForTimeout(320);
    await page.keyboard.insertText('Y');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#editor .page-body p')[54].textContent), 'ParaXYgraf 55');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#editor .page-body p').length), 85);
  });
  await test('Word image insert/resize/wrap, table metrics and virtual print', async () => {
    await page.evaluate(() => { editor.innerHTML='<p>Dokumen sekolah</p>'; });
    await wordPosition(page,[0,15]);
    await page.evaluate(() => command('picture'));
    await page.locator('#modalPanel').getByRole('button', {name:/sample/i}).click();
    await waitFor(page, () => !!editor.querySelector('.ws-object[data-ws-kind=picture]'));
    const picture = page.locator('#editor .ws-object[data-ws-kind=picture]');
    await picture.click();
    const oldWidth = await picture.evaluate(el => el.getBoundingClientRect().width);
    const handle = await page.locator('#wsResizeHandle').boundingBox();
    assert.ok(handle);
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
    await page.mouse.down();
    await page.mouse.move(handle.x+handle.width/2+45,handle.y+handle.height/2+18);
    await page.mouse.up();
    assert.ok(await picture.evaluate(el => el.getBoundingClientRect().width) > oldWidth);
    await page.evaluate(() => command('wsWrap'));
    await page.locator('#modalPanel select').selectOption('square-left');
    await page.locator('#modalPanel').getByRole('button', {name:/apply|terapkan|ok/i}).click();
    assert.equal(await picture.getAttribute('data-wrap'),'square-left');
    await wordPosition(page,[0,0]);
    await page.evaluate(() => command('table'));
    await page.locator('#modalPanel').getByRole('button',{name:/insert/i}).click();
    assert.ok(await page.locator('#editor td').count() > 0);
    assert.ok((await page.locator('#editor td').allTextContents()).every(t => !t.trim()));
    await page.locator('#editor td').first().click();
    await page.evaluate(() => command('wsColumnWidth'));
    await page.locator('#modalPanel input[type=number]').last().fill('3.1');
    await page.locator('#modalPanel').getByRole('button',{name:/apply|terapkan|ok/i}).click();
    await page.evaluate(() => { editor.innerHTML += '<div class="pagebreak" data-hardbreak="true"></div><p>Lembar kedua</p>'; command('printPreview'); });
    await waitFor(page, () => wordPrintState.sheets.length >= 2);
    assert.equal(await page.locator('#wpSheetHolder table').count(),1);
    await page.locator('#wpNext').click();
    assert.match(await page.locator('#wpSheetHolder').innerText(),/Lembar kedua/);
    await page.locator('#wpSubmit').click();
    await page.locator('#wpResult.open').waitFor();
  });
  await test('Word persistence and profile separation', async () => {
    await page.evaluate(() => { closeRealisticPrintPreview(); editor.innerHTML='<p>Hanya siswa pertama</p>'; saveStudentState(); });
    await page.reload();
    await login(page,'Word');
    assert.match(await page.evaluate(() => wordText()), /Hanya siswa pertama/);
    await login(page,'Word','02','Siswa Kedua');
    assert.doesNotMatch(await page.evaluate(() => wordText()), /Hanya siswa pertama/);
    await login(page,'Word');
    assert.match(await page.evaluate(() => wordText()), /Hanya siswa pertama/);
  });
  await page.context().close();
}

async function wordMobileEditingTests(){
  const page=await load('Word',{width:390,height:844},true);
  try{
    await test('Word phone Undo and Redo stay visible after scrolling the title bar',async()=>{
      const undo=page.getByRole('button',{name:'Undo',exact:true});
      const redo=page.getByRole('button',{name:'Redo',exact:true});
      assert.ok(await undo.isVisible()&&await redo.isVisible());
      assert.ok((await undo.boundingBox()).width>=40);
      await page.evaluate(()=>{const bar=document.querySelector('.topbar');bar.scrollLeft=bar.scrollWidth});
      for(const button of [undo,redo]){
        const bounds=await button.boundingBox();
        assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
      }
    });

    await test('Word Enter on a cover stays on its page and touch Undo/Redo restore visible edits',async()=>{
      await page.evaluate(()=>{
        editor.innerHTML='<p><br></p>';
        insertWordCover('minimal');
        clearWordHistory();
        setZoom(40);
      });
      await page.locator('[data-word-cover] p').last().tap();
      await page.keyboard.press('End');
      const coverParagraphs=await page.locator('[data-word-cover] p').count();
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('Baris sampul tambahan');
      assert.equal(await page.locator('[data-word-cover] p').count(),coverParagraphs+1);
      assert.deepEqual(await page.evaluate(()=>[pages().length,currentPageFromSelection(),bodies()[1].innerText.trim()]),[2,1,'']);
      await page.getByRole('button',{name:'Undo',exact:true}).tap();
      assert.doesNotMatch(await page.locator('[data-word-cover]').innerText(),/Baris sampul tambahan/);
      await page.getByRole('button',{name:'Undo',exact:true}).tap();
      assert.equal(await page.locator('[data-word-cover] p').count(),coverParagraphs);
      await page.getByRole('button',{name:'Redo',exact:true}).tap();
      await page.getByRole('button',{name:'Redo',exact:true}).tap();
      assert.match(await page.locator('[data-word-cover]').innerText(),/Baris sampul tambahan/);
    });

    await test('Word input-based Enter, Shift+Enter and Ctrl+Enter are separate operations',async()=>{
      await page.evaluate(()=>{
        editor.innerHTML='<p>AwalAkhir</p>';
        clearWordHistory();
      });
      await wordPosition(page,[0,4]);
      const intercepted=await page.evaluate(()=>!editor.dispatchEvent(new InputEvent('beforeinput',{
        inputType:'insertParagraph',bubbles:true,cancelable:true,
      })));
      assert.ok(intercepted);
      assert.deepEqual(await page.evaluate(()=>[...bodies()[0].querySelectorAll('p')].map(p=>p.textContent)),['Awal','Akhir']);
      await page.keyboard.press('Shift+Enter');
      assert.equal(await page.locator('#pageBody1 p').count(),2);
      assert.ok(await page.locator('#pageBody1 p:nth-of-type(2) br').count());
      await page.keyboard.press('Control+Enter');
      assert.equal(await page.evaluate(()=>pages().length),2);
      assert.equal(await page.locator('#pageBody1 [data-hardbreak="true"]').count(),1);
    });

    await test('Word Enter only starts an automatic new page when the paper is full',async()=>{
      const last=await page.evaluate(()=>{
        Object.assign(documentState,{pageHeightCm:10,marginTopCm:1,marginBottomCm:1});
        setPageState();
        editor.innerHTML='<p>Baris awal</p>';
        const body=bodies()[0];
        let count=0;
        while(!bodyOverflow(body)&&count<40){
          const paragraph=document.createElement('p');paragraph.textContent='Paragraf '+(++count);body.append(paragraph);
        }
        if(!bodyOverflow(body))throw new Error('Could not fill the test sheet');
        body.lastElementChild.remove();
        clearWordHistory();
        return body.children.length-1;
      });
      assert.equal(await page.evaluate(()=>pages().length),1);
      await wordPosition(page,[last,2]);
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.insertText('Teks otomatis');
      await waitFor(page,()=>pages().length===2&&bodies()[1].textContent.includes('Teks otomatis'));
      assert.equal(await page.locator('#editor [data-hardbreak]').count(),0);
      await page.evaluate(()=>{Object.assign(documentState,{pageHeightCm:29.7,marginTopCm:2.54,marginBottomCm:2.54});setPageState()});
    });

    await test('Word phone Home group navigation and additional formatting act on the document',async()=>{
      await page.evaluate(()=>{editor.innerHTML='<p>alpha beta</p>';clearWordHistory()});
      assert.deepEqual(await page.locator('#wordHomeNav button').allTextContents(),['Clipboard','Font','Paragraph','Styles','Editing']);
      await wordPosition(page,[0,0],[0,5]);
      await page.locator('#wordHomeNav').getByRole('button',{name:'Font',exact:true}).tap();
      await page.locator('#ribbon').getByRole('button',{name:'Change Case',exact:true}).tap();
      await page.locator('#choiceValue').selectOption('upper');
      await page.locator('#modalPanel').getByRole('button',{name:'Terapkan'}).tap();
      assert.equal(await page.locator('#pageBody1 p').innerText(),'ALPHA beta');
      await wordPosition(page,[0,0],[0,5]);
      await page.locator('#ribbon').getByRole('button',{name:'Increase Font Size',exact:true}).tap();
      assert.match(await page.locator('#pageBody1 p span').first().getAttribute('style'),/font-size: 12pt/);
      await page.locator('#wordHomeNav').getByRole('button',{name:'Paragraph',exact:true}).tap();
      await page.locator('#ribbon').getByRole('button',{name:'Show/Hide ¶',exact:true}).tap();
      assert.equal(await page.locator('#editor').getAttribute('data-formatting-marks'),'');
      await page.locator('#ribbon').getByRole('button',{name:'Line and Paragraph Spacing',exact:true}).tap();
      await page.locator('#choiceValue').selectOption('1.5');
      await page.locator('#modalPanel').getByRole('button',{name:'Terapkan'}).tap();
      assert.match(await page.locator('#pageBody1 p').getAttribute('style'),/line-height: 1.5/);
      await page.locator('#wordHomeNav').getByRole('button',{name:'Styles',exact:true}).tap();
      await page.locator('#ribbon').getByRole('button',{name:'Title',exact:true}).tap();
      assert.equal(await page.locator('#pageBody1 p').getAttribute('data-word-style'),'title');
      await page.getByRole('button',{name:'Undo',exact:true}).tap();
      assert.equal(await page.locator('#pageBody1 p').getAttribute('data-word-style'),null);
    });
  }finally{await page.context().close()}
}

async function wordHomeControlsTests(){
 const page=await load('Word',{width:390,height:844},true);
 const ribbon=page.locator('#ribbon');
 const modal=page.locator('#modalPanel');
 async function open(group,label){
  if(await page.locator('#wordHomeNav').isHidden()){
   await page.locator('#tabs').getByRole('button',{name:'Home',exact:true}).tap();
  }
  await page.locator('#wordHomeNav').getByRole('button',{name:group,exact:true}).tap();
  await ribbon.getByRole('button',{name:label,exact:true}).tap();
 }
 async function content(html){await page.evaluate(html=>{editor.innerHTML=html;clearWordHistory()},html)}
 try{
  await test('Word Home Paste Special preserves source formatting and can paste plain text',async()=>{
   await content('<p><strong style="color:#ba213d">Penting</strong></p><p><br></p><p><br></p>');
   await wordPosition(page,[0,0],[0,7]);
   await open('Clipboard','Copy');
   await wordPosition(page,[1,0]);
   await open('Clipboard','Paste Special');
   await modal.getByRole('button',{name:'Keep Source Formatting',exact:true}).tap();
   assert.match(await page.locator('#pageBody1 p').nth(1).innerText(),/Penting/);
   assert.match(await page.locator('#pageBody1 p').nth(1).innerHTML(),/rgb\(186, 33, 61\)|#ba213d/);
   await wordPosition(page,[2,0]);
   await open('Clipboard','Paste Special');
   await modal.getByRole('button',{name:'Keep Text Only',exact:true}).tap();
   assert.equal(await page.locator('#pageBody1 p').nth(2).innerText(),'Penting');
   assert.equal(await page.locator('#pageBody1 p').nth(2).locator('strong,[style*="color"]').count(),0);
   await open('Clipboard','Clipboard Pane');
   assert.equal(await modal.getByRole('button',{name:'Penting',exact:true}).count(),1);
   await modal.getByRole('button',{name:'Clear All',exact:true}).tap();
   assert.match(await modal.innerText(),/Clipboard kosong/);
   await modal.getByRole('button',{name:'Tutup',exact:true}).tap();
  });

  await test('Word Home Font Settings and text effects change selected text and are undoable',async()=>{
   await content('<p>Huruf biasa</p>');
   await wordPosition(page,[0,0],[0,5]);
   await open('Font','Font Settings');
   await page.locator('#wordFDName').selectOption('Georgia');
   await page.locator('#wordFDSize').fill('18');
   await page.locator('#wordFDKind').selectOption('bi');
   await page.locator('#wordFDUnder').selectOption('double');
   await modal.getByText('Advanced — Character Spacing').tap();
   await page.locator('#wordFDSpace').fill('2');
   await modal.getByRole('button',{name:'Apply',exact:true}).tap();
   const selection=page.locator('#pageBody1 p [data-word-font=Georgia]');
   const style=await selection.getAttribute('style');
   assert.match(style,/font-size: 18pt/);
   assert.match(style,/font-style: italic/);
   assert.match(style,/letter-spacing: 2pt/);
   assert.match(style,/double/);
   assert.equal(await selection.innerText(),'Huruf');
   await wordPosition(page,[0,0],[0,5]);
   await open('Font','Text Effects and Typography');
   await page.locator('#choiceValue').selectOption('shadow');
   await modal.getByRole('button',{name:'Terapkan',exact:true}).tap();
   assert.match(await selection.innerHTML(),/text-shadow/);
   await page.getByRole('button',{name:'Undo',exact:true}).tap();
   assert.doesNotMatch(await selection.innerHTML(),/text-shadow/);
  });

  await test('Word Home Sort, Numbering Library, and custom bullets update actual list content',async()=>{
   await content('<p>Ceri</p><p>Apel</p><p>Belimbing</p>');
   await wordPosition(page,[0,0],[2,9]);
   await open('Paragraph','Sort');
   await modal.getByRole('button',{name:'Sort',exact:true}).tap();
   assert.deepEqual(await page.locator('#pageBody1 p').allTextContents(),['Apel','Belimbing','Ceri']);
   await wordPosition(page,[0,0],[2,4]);
   await open('Paragraph','Numbering Library');
   await page.locator('#wordListStyle').selectOption('upper-roman');
   await page.locator('#wordListStart').fill('4');
   await modal.getByRole('button',{name:'Apply',exact:true}).tap();
   assert.equal(await page.locator('#pageBody1 ol').getAttribute('start'),'4');
   assert.match(await page.locator('#pageBody1 ol').getAttribute('style'),/upper-roman/);
   assert.deepEqual(await page.locator('#pageBody1 ol li').allTextContents(),['Apel','Belimbing','Ceri']);
   await content('<p>Item</p>');
   await wordPosition(page,[0,0],[0,4]);
   await open('Paragraph','Bullet Library');
   await page.locator('#wordListStyle').selectOption('custom');
   await page.locator('#wordListSymbol').fill('◆');
   await modal.getByRole('button',{name:'Apply',exact:true}).tap();
   assert.equal(await page.locator('#pageBody1 ul').getAttribute('data-word-custom-bullet'),'');
   assert.match(await page.locator('#pageBody1 ul').getAttribute('style'),/◆/);
  });

  await test('Word Home Paragraph Settings apply hanging indent and spacing to multiple paragraphs',async()=>{
   await content('<p>Baris satu</p><p>Baris dua</p>');
   await wordPosition(page,[0,0],[1,9]);
   await open('Paragraph','Paragraph Settings');
   await page.locator('#paAlign').selectOption('justify');
   await page.locator('#paIndent').selectOption('hanging');
   await page.locator('#paFirst').fill('0.5');
   await page.locator('#paAfter').fill('6');
   await modal.getByRole('button',{name:'Apply',exact:true}).tap();
   for(const paragraph of await page.locator('#pageBody1 p').all()){
    const style=await paragraph.getAttribute('style');
    assert.match(style,/text-indent: -0.5cm/);
    assert.equal(await paragraph.evaluate(node=>node.style.marginBottom),'6pt');
    assert.match(style,/text-align: justify/);
   }
  });

  await test('Word Home Styles Gallery creates and reapplies a named document style',async()=>{
   await content('<p style="color:#21699a;font-size:17pt">Contoh</p><p>Baris berikutnya</p>');
   await wordPosition(page,[0,1]);
   await open('Styles','Styles Gallery');
   await modal.getByRole('button',{name:'Create a Style',exact:true}).tap();
   await page.locator('#dialogInput').fill('Judul Kelas');
   await modal.getByRole('button',{name:'OK',exact:true}).tap();
   await wordPosition(page,[1,2]);
   await open('Styles','Styles Gallery');
   await modal.getByRole('button',{name:/Judul Kelas/}).tap();
   assert.equal(await page.locator('#pageBody1 p').nth(1).getAttribute('data-word-custom-style'),'Judul Kelas');
   assert.match(await page.locator('#pageBody1 p').nth(1).getAttribute('style'),/rgb\(33, 105, 154\)/);
   await open('Styles','Styles Gallery');
   await modal.getByRole('button',{name:'Modify Style',exact:true}).tap();
   await page.locator('#wordStyleSize').fill('21');
   await modal.getByRole('button',{name:'Apply to Document',exact:true}).tap();
   assert.deepEqual(await page.locator('#pageBody1 p').evaluateAll(nodes=>nodes.map(node=>node.style.fontSize)),['21pt','21pt']);
  });

  await test('Word Home Find and Replace supports case and whole-word options across inline formatting',async()=>{
   await content('<p>bu<strong>ku</strong> BUKU bukunya buku.</p>');
   await wordPosition(page,[0,0]);
   await open('Editing','Replace');
   await page.locator('#wordFindTerm').fill('buku');
   await page.locator('#wordFindReplacement').fill('arsip');
   await page.locator('#wordFindCase').check();
   await page.locator('#wordFindWhole').check();
   await modal.getByRole('button',{name:'Find Next',exact:true}).tap();
   assert.equal(await page.locator('#wordFindStatus').innerText(),'Hasil 1 dari 2');
   await modal.getByRole('button',{name:'Replace All',exact:true}).tap();
   assert.equal(await page.locator('#wordFindStatus').innerText(),'2 hasil diganti.');
   assert.equal(await page.locator('#pageBody1 p').innerText(),'arsip BUKU bukunya arsip.');
   await modal.getByRole('button',{name:'Tutup',exact:true}).tap();
  });

  await test('Word Home Go To and Selection Pane locate actual pages and tables',async()=>{
   await content('<p>Awal</p><div class="pagebreak" data-hardbreak="true"></div><h1>Bab Kedua</h1><table><tbody><tr><td>Contoh</td></tr></tbody></table>');
   await wordPosition(page,[0,1]);
   await open('Editing','Go To');
   await page.locator('#wordGotoType').selectOption('Heading');
   await modal.getByRole('button',{name:'Go To',exact:true}).tap();
   assert.equal(await page.evaluate(()=>currentPageFromSelection()),2);
   await open('Editing','Selection Pane');
   await modal.getByRole('button',{name:'table 1',exact:true}).tap();
   assert.equal(await page.locator('#editor table.ws-table-selected').count(),1);
  });
 }finally{await page.context().close()}
}

const formulaCases = [
  ['SUM', '=SUM(B1:B4)', 20], ['SUMIF','=SUMIF(A1:A3,"p*",B1:B3)',15], ['SUMIFS','=SUMIFS(B1:B3,A1:A3,"p*",C1:C3,">1")',10], ['nested', '=ROUND(SUM(B1:B3)/3,2)', 6.67], ['PRODUCT', '=PRODUCT(B1:B3)', 250],
  ['ABS', '=ABS(-15)', 15], ['ROUNDUP','=ROUNDUP(2.01,1)',2.1], ['ROUNDDOWN','=ROUNDDOWN(-2.19,1)',-2.1],
  ['INT','=INT(-2.1)',-3], ['MOD','=MOD(-3,2)',1], ['POWER','=POWER(3,2)',9], ['SQRT','=SQRT(16)',4],
  ['SUMPRODUCT','=SUMPRODUCT(B1:B3,C1:C3)',45], ['SUBTOTAL','=SUBTOTAL(9,B1:B3)',20],
  ['AVERAGE','=AVERAGE(B1:B4)',20/3], ['MEDIAN','=MEDIAN(B1:B3)',5], ['MODE','=MODE(B1:B3)',5],
  ['MIN','=MIN(B1:B3)',5], ['MAX','=MAX(B1:B3)',10], ['COUNT','=COUNT(B1:B4)',3],
  ['COUNTA','=COUNTA(B1:B4)',4], ['COUNTBLANK','=COUNTBLANK(B1:B5)',1], ['COUNTIF','=COUNTIF(A1:A3,"p*")',2],
  ['COUNTIFS','=COUNTIFS(B1:B3,">=5",C1:C3,">1")',2], ['AVERAGEIF','=AVERAGEIF(A1:A3,"p*",B1:B3)',7.5],
  ['AVERAGEIFS','=AVERAGEIFS(B1:B3,C1:C3,">1")',7.5],
  ['IF short-circuit','=IF(FALSE,1/0,"ok")','ok'], ['IFS','=IFS(B1<5,"low",TRUE,"ok")','ok'],
  ['AND','=AND(B1=5,B2=5)',true], ['OR','=OR(FALSE,B3>9)',true], ['NOT','=NOT(B1=0)',true],
  ['IFERROR','=IFERROR(5/0,9)',9], ['IFNA','=IFNA(NA(),8)',8], ['SWITCH','=SWITCH(2,1,"a",2,"b","c")','b'],
  ['VLOOKUP','=VLOOKUP("paper",A1:C3,2,FALSE)',10], ['HLOOKUP','=HLOOKUP("B",E8:F9,2,FALSE)',22],
  ['XLOOKUP reverse','=XLOOKUP(5,B1:B3,A1:A3,"",0,-1)','Book'],
  ['XLOOKUP wildcard','=XLOOKUP("Pap*",A1:A3,B1:B3,,2)',10],
  ['INDEX','=INDEX(A1:C3,3,2)',10], ['MATCH','=MATCH(8,E1:E3,-1)',1],
  ['XMATCH','=XMATCH(5,B1:B3,0,-1)',2], ['CHOOSE','=CHOOSE(2,5,7)',7],
  ['ROW','=ROW(C12)',12], ['COLUMN','=COLUMN(AA12)',27], ['OFFSET','=OFFSET(B1,2,0)',10],
  ['LEFT','=LEFT("Tabel",2)','Ta'], ['RIGHT','=RIGHT("Tabel",2)','el'], ['MID','=MID("Tabel",2,3)','abe'],
  ['LEN','=LEN("Tabel")',5], ['TRIM','=TRIM(" a   b ")','a b'], ['UPPER','=UPPER("aBc")','ABC'],
  ['LOWER','=LOWER("aBc")','abc'], ['PROPER','=PROPER("aBc kelas")','Abc Kelas'],
  ['CONCAT','=CONCAT("a","b")','ab'], ['CONCATENATE','=CONCATENATE("ab",2)','ab2'],
  ['TEXTJOIN','=TEXTJOIN("-",TRUE,A1:A3)','Pen-Book-Paper'], ['FIND','=FIND("b","abcd")',2],
  ['SEARCH','=SEARCH("B","abcd")',2], ['SUBSTITUTE','=SUBSTITUTE("a-a","a","b",2)','a-b'],
  ['REPLACE','=REPLACE("abcd",2,2,"ZZ")','aZZd'], ['TEXT','=TEXT(0.125,"0.0%")','12.5%'], ['VALUE','=VALUE("1,250.5")',1250.5],
  ['DATE','=DATE(2024,2,29)',45351], ['DAY','=DAY(DATE(2024,2,29))',29], ['MONTH','=MONTH(DATE(2024,2,29))',2],
  ['YEAR','=YEAR(DATE(2024,2,29))',2024], ['DATEDIF','=DATEDIF(DATE(2024,1,1),DATE(2025,4,1),"M")',15],
  ['EDATE month end','=DAY(EDATE(DATE(2024,1,31),1))',29], ['EOMONTH','=DAY(EOMONTH(DATE(2025,1,10),1))',28],
  ['NETWORKDAYS','=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,7),DATE(2024,1,1))',4],
  ['WORKDAY','=DAY(WORKDAY(DATE(2024,1,5),1))',8],
  ['PMT','=PMT(0,10,1000)',-100], ['PV','=PV(0,10,-100)',1000], ['FV','=FV(0,10,-100)',1000],
  ['NPV','=NPV(0,5,6)',11], ['IRR','=ROUND(IRR({-100;110}),4)',0.1],
  ['precedence arithmetic','=2+3*4',14], ['precedence negation','=-2^2',4], ['precedence exponentiation','=2^3^2',64],
  ['mixed references','=B$1+$B2+$B$3',20], ['other sheet quoted',"='Class 7'!$A$1*2",84],
  ['division by zero','=1/0','#DIV/0!'], ['missing name','=MYMISSINGFN(1)','#NAME?'],
  ['missing sheet','=Missing!A1','#REF!'], ['not found','=MATCH(99,B1:B3,0)','#N/A'],
  ['bad type','="letters"+2','#VALUE!'], ['domain error','=SQRT(-4)','#NUM!'],
  ['typed date','=DAY(F1)',29], ['NOW/TODAY','=INT(NOW())=TODAY()',true], ['range numeric text ignored','=SUM(B4)',0],
  ['literal numeric text coerced','=SUM("4",TRUE)',5],
];

async function excelTests() {
  const page = await load('Excel');
  await test('Excel keyboard input, Enter, Shift+Enter, Tab, F2, Alt+Enter', async () => {
    await page.locator('#cell-A1').click();
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#nameBox').inputValue(), 'A2');
    assert.equal(await page.locator('#cell-A1').innerText(), '12');
    await page.keyboard.press('Shift+Enter');
    assert.equal(await page.locator('#nameBox').inputValue(), 'A1');
    await page.keyboard.press('F2');
    await page.keyboard.press('3');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#cell-A1').innerText(),'123');
    assert.equal(await page.locator('#nameBox').inputValue(),'B1');
    await page.keyboard.press('F2');
    await page.keyboard.insertText('L1');
    await page.keyboard.press('Alt+Enter');
    await page.keyboard.insertText('L2');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => getCell(1,2).raw),'L1\nL2');
  });
  await test('Excel formula workbook fixture and dependent recalculation', async () => {
    await page.evaluate(() => {
      const sheet = newSheet('Class 7');
      setCell(1,1,'42',{},sheet);
      workbook.sheets.push(sheet);renderTabs();
      for (const [i, values] of [['Pen',5,1],['Book',5,2],['Paper',10,3],['',"'99",'']].entries()) {
        values.forEach((value,c)=>setCell(i+1,c+1,value));
      }
      [10,7,1].forEach((value,i)=>setCell(i+1,5,value));
      setCell(1,6,'2024-02-29');
      setCell(8,5,'A');setCell(8,6,'B');setCell(9,5,'11');setCell(9,6,'22');
      setCell(8,1,'=B8');setCell(8,2,'=A8');
      setCell(9,1,'=B1*3');
      refreshCells();
    });
    assert.equal(await page.locator('#cell-A8').innerText(),'#CIRC!');
    assert.equal(await page.locator('#cell-A9').innerText(),'15');
    await page.evaluate(() => { setCell(1,2,'8');refreshCells(); });
    assert.equal(await page.locator('#cell-A9').innerText(),'24');
    await page.evaluate(() => { setCell(1,2,'5');refreshCells(); });
  });
  const results = await page.evaluate(cases => cases.map(([,formula]) => {
    setCell(20,11,formula);
    return evalAt(20,11);
  }),formulaCases);
  for (const [i, [name,,expected]] of formulaCases.entries()) {
    await test('Excel formula '+name, () => {
      const actual=results[i];
      if (typeof expected==='number') assert.ok(typeof actual==='number'&&Math.abs(actual-expected)<1e-9, String(actual)+' != '+expected);
      else assert.equal(actual,expected);
    });
  }
  await test('Excel formula names, exponent literal and absolute Fill Down/Right', async () => {
    await page.evaluate(() => { setCell(12,2,'=1E3+A1+$B1+B$1+$B$1+\'Class 7\'!A1');refreshCells(); });
    await excelSelect(page,'B12:B14');
    await page.keyboard.press('Control+d');
    assert.equal(await page.evaluate(() => getCell(14,2).raw),"=1E3+A3+$B3+B$1+$B$1+'Class 7'!A3");
    await excelSelect(page,'B12:D12');
    await page.keyboard.press('Control+r');
    assert.equal(await page.evaluate(() => getCell(12,4).raw),"=1E3+C1+$B1+D$1+$B$1+'Class 7'!C1");
  });
  await test('Excel worksheet copy, cross-sheet cut, Undo and Redo', async () => {
    await page.evaluate(() => { setCell(15,1,'Dari lembar satu');refreshCells(); });
    await excelSelect(page,'A15');
    await page.keyboard.press('Control+c');
    await excelSelect(page,'A16');
    await page.keyboard.press('Control+v');
    assert.equal(await page.evaluate(() => getCell(16,1).raw),'Dari lembar satu');
    await page.keyboard.press('Control+x');
    await page.locator('#sheetTabs [data-index="1"]').click();
    await excelSelect(page,'A16');
    await page.keyboard.press('Control+v');
    assert.deepEqual(await page.evaluate(() => [getCell(16,1,workbook.sheets[0])?.raw??null,getCell(16,1)?.raw]),[null,'Dari lembar satu']);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => getCell(16,1,workbook.sheets[0])?.raw),'Dari lembar satu');
    await page.keyboard.press('Control+y');
    assert.equal(await page.evaluate(() => getCell(16,1)?.raw),'Dari lembar satu');
  });
  await test('Excel filter, sort, chart, print preview and virtual print', async () => {
    await page.evaluate(() => {
      changeSheet(0);
      [['Item','Qty'],['Pena',3],['Map',1],['Buku',2]].forEach((row,i)=>row.forEach((value,j)=>setCell(i+22,j+1,value)));
      selectRange(23,1,25,2);sortSelection();selectRange(22,1,25,2);
      formatTable();insertChart('line');
    });
    assert.equal(await page.locator('#cell-A23').innerText(),'Buku');
    await page.locator('#cell-A22 .filter-button').click();
    await page.locator('#filterPop input[value="Map"]').uncheck();
    await page.locator('#filterApply').click();
    assert.equal(await page.locator('.dataRow.is-hidden').count(),1);
    assert.equal(await page.locator('canvas').count(),1);
    await page.evaluate(() => { current().printArea={r1:22,c1:1,r2:25,c2:2};showPrintPreview(); });
    assert.match(await page.locator('#previewBody').innerText(),/Pena/);
    await page.locator('#modalBody').getByRole('button',{name:'Print',exact:true}).click();
    assert.match(await page.locator('#modalBody').innerText(),/Print virtual berhasil/);
  });
  await test('Excel formula bar confirmation and cancellation',async()=>{
    await page.evaluate(()=>closeModal());
    await excelSelect(page,'J2');
    await page.locator('#formulaInput').fill('=SUM(2,3)');
    await page.locator('#checkIndicator').click();
    assert.equal(await page.locator('#cell-J2').innerText(),'5');
    await page.locator('#formulaInput').fill('=SUM(5,6)');
    await page.locator('#cancelIndicator').click();
    assert.equal(await page.locator('#cell-J2').innerText(),'5');
  });
  await test('Excel source references move when rows are inserted and deleted',async()=>{
    const values=await page.evaluate(()=>{
      const sh=newSheet('Structural Test'),linked=newSheet('Cross Ref');
      workbook.sheets.push(sh,linked);changeSheet(workbook.sheets.indexOf(sh));
      setCell(1,1,'10');setCell(2,1,'20');setCell(3,1,'30');
      setCell(1,2,'=SUM($A$1:A3)');
      setCell(1,1,"=SUM('Structural Test'!A1:A3)",{},linked);
      selectRange(2,1,2,1);insertGrid('row');
      const inserted=[getCell(1,2)?.raw,getCell(1,1,linked)?.raw,evalAt(1,1,new Set(),linked)];
      selectRange(3,1,3,1);insertGrid('row',true);
      const deleted=[getCell(1,2)?.raw,getCell(1,1,linked)?.raw,evalAt(1,1,new Set(),linked)];
      changeSheet(0);
      return [inserted,deleted];
    });
    assert.deepEqual(values,[['=SUM($A$1:A4)',"=SUM('Structural Test'!A1:A4)",60],['=SUM($A$1:A3)',"=SUM('Structural Test'!A1:A3)",40]]);
  });
  await test('Excel Formula Library shows Indonesian guidance and opens Formula Lab',async()=>{
    await page.locator('#formulaGuideBtn').click();
    await page.locator('#formulaGuideSearch').fill('XLOOKUP');
    await page.locator('#formulaPicker button').click();
    assert.match(await page.locator('#formulaGuideDetail').innerText(),/Mencari satu nilai/);
    await page.locator('#formulaLibraryLab').click();
    assert.match(await page.locator('#sheetTabs .active').innerText(),/Formula Lab/);
    assert.equal(await page.evaluate(()=>evalAt(7,5)),8000);
    await page.evaluate(()=>changeSheet(0));
  });
  await test('Excel workbook, mission scores, identity separation and reset', async () => {
    await page.evaluate(() => {
      closeModal();
      setCell(29,1,'Hanya siswa Excel');
      lessonCompleted[0][0]=true;
      excelMissionScores['0:0']={best:100,last:100};
      savePracticeStorage();
    });
    await page.reload();
    await login(page,'Excel');
    assert.deepEqual(await page.evaluate(() => [getCell(29,1)?.raw,lessonCompleted[0][0],excelMissionScores['0:0']?.best]),['Hanya siswa Excel',true,100]);
    await login(page,'Excel','02','Siswa Kedua');
    assert.deepEqual(await page.evaluate(() => [getCell(29,1)?.raw??null,lessonCompleted[0][0],practiceStageUnlocked(1)]), [null,false,false]);
    assert.deepEqual(await page.evaluate(() => [practiceLevels.length,totalPracticeMissions]),[10,77]);
    await login(page,'Excel');
    assert.equal(await page.evaluate(() => getCell(29,1)?.raw),'Hanya siswa Excel');
  });
  await page.context().close();
}

async function syncTests() {
  await test('Apps Script validates identities, prevents duplicate writes, and aggregates latest reports', () => {
    const src=fs.readFileSync(resolve(__dirname,'Google_Sheets_Monitoring.gs'),'utf8');
    const rows=[['header']];
    const storage={
      getLastRow:()=>rows.length,
      getRange:(row,col,num)=>({
        getValues:()=>rows.slice(row-1,row-1+num).map(record=>record.slice(col-1,col)),
        setValues:values=>rows.push(...values.map(record=>record.map(v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v))),
      }),
    };
    const services={
      PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'sheet-id'})},
      SpreadsheetApp:{openById:()=>({getSheetByName:()=> storage}),flush(){}},
      ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
      LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},console,
    };
    const ctx=vm.createContext(services);
    vm.runInContext(src+'\nglobalThis.testApi={doPost,normalizeEvent_,summarize_};',ctx);
    const {doPost,normalizeEvent_,summarize_}=ctx.testApi;
    const base={app:'ExcelClassroom',name:'=1+1',klass:'7A',code:'01',time:'2026-11-25T12:00:00Z'};
    const event={...base,id:'excel-abcd01',passedLevels:10,score:100};
    const post=items=>doPost({parameter:{payload:JSON.stringify({events:items})}});
    assert.equal(post([event]).acceptedIds[0],event.id);
    assert.equal(post([event,event]).acceptedIds.length,2);
    assert.equal(rows.length,2);
    assert.equal(normalizeEvent_(event,new Date())[4],"'=1+1");
    assert.equal(rows[1][6],'01');
    assert.equal(normalizeEvent_({...event,id:'bad!'},new Date()),null);
    assert.equal(summarize_(rows.slice(1),'7A',new Date('2026-11-26')).active,1);
    assert.equal(summarize_(rows.slice(1),'7B',new Date('2026-11-26')).students.length,0);
  });
  for (const app of Object.keys(files)) await test(app+' queues offline and retries only after verified receipt', async () => {
    const page=await load(app);
    try {
      const endpoint='https://script.google.com/macros/s/testClassroom/exec';
      let replies=0,allowSuccess=false;
      const sending=await page.evaluate(([app, endpoint])=>{
        if(app==='Word'){setEndpoint(endpoint);enqueueReport('TES_KONEKSI');return queue.length}
        setReportEndpoint(endpoint);enqueueReport('KIRIM_MANUAL');return reportQueue.length;
      },[app,endpoint]);
      assert.equal(sending,1);
      await page.context().route(endpoint,async route=>{
        replies++;
        const body=new URLSearchParams(route.request().postData()).get('payload');
        const ids=JSON.parse(body).events.map(event=>event.id);
        await route.fulfill({status:200,headers:{'access-control-allow-origin':'*'},json: allowSuccess ? {ok:true,acceptedIds:ids} : {ok:false}});
      });
      await page.context().setOffline(false);
      await page.evaluate(app=>app==='Word'?flushQueue():flushReports(),app);
      assert.equal(await page.evaluate(app=>app==='Word'?queue.length:reportQueue.length,app),1);
      allowSuccess=true;
      await page.evaluate(app=>app==='Word'?flushQueue():flushReports(),app);
      assert.equal(await page.evaluate(app=>app==='Word'?queue.length:reportQueue.length,app),0);
      assert.ok(replies>=2);
    } finally {await page.context().close();}
  });
}

async function exportTests(){
  const endpoint='https://script.google.com/macros/s/testClassroom/exec';
  for (const app of Object.keys(files)) await test(app+' teacher export opens offline with clean student state',async()=>{
    const page=await load(app);
    try {
      const downloadEvent=page.waitForEvent('download',{timeout:6000});
      await page.evaluate(([app,endpoint])=>{
        if(app==='Word'){
          setEndpoint(endpoint);
          editor.innerHTML='<p>TEKS SISWA PRIBADI</p>';document.querySelector('#docName').value='TEKS SISWA PRIBADI';
          exportStudentHTML();
        }else{
          setReportEndpoint(endpoint);
          setCell(1,1,'TEKS SISWA PRIBADI');refreshCells();
          downloadStudentHTML();
        }
      },[app,endpoint]);
      const download=await downloadEvent;
      assert.equal(download.suggestedFilename(),files[app]);
      const path=await download.path(),source=fs.readFileSync(path,'utf8');
      assert.ok(source.includes(endpoint));
      assert.ok(!source.includes('TEKS SISWA PRIBADI'));
      assert.ok(!source.includes('Siswa Uji'));
      const restored=await page.context().newPage();
      restored.on('pageerror',error=>browserErrors.push(app+' export '+error.message));
      const temp=fs.mkdtempSync(resolve(tmpdir(),'classroom-export-'));
      try{
        const html=resolve(temp,files[app]);fs.copyFileSync(path,html);
        await restored.goto(pathToFileURL(html).href);
        await login(restored,app,'09','Siswa Ekspor');
        assert.ok(await restored.evaluate(app=>app==='Word'?pages().length===1:workbook.sheets.length===1,app));
      }finally{fs.rmSync(temp,{recursive:true,force:true})}
    }finally{await page.context().close()}
  });
}

async function layoutTests() {
  const sizes=[[1366,768,false],[1920,1080,false],[390,844,true],[844,390,true],[820,1180,true]];
  const output=process.env.CLASSROOM_SCREENSHOTS;
  if (output) fs.mkdirSync(output,{recursive:true});
  for (const app of Object.keys(files)) for (const [width,height,touch] of sizes) {
    await test(app+' offline layout at '+width+'×'+height,async()=>{
      const page=await load(app,{width,height},touch);
      try {
        const locator=page.locator(app==='Word'?'#editScroll':'#gridHost');
        assert.ok((await locator.boundingBox()).height>=95);
        const scrollWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
        assert.ok(scrollWidth<=width+1, 'outer document width '+scrollWidth);
        if (touch&&app==='Excel') {
          await page.locator('#cell-A1').tap();
          await page.locator('#mobileEdit').tap();
          await page.locator('#cell-A1 .editor').fill('Sentuh');
          await page.locator('#cell-A1 .editor').press('Enter');
          assert.equal(await page.locator('#cell-A1').innerText(),'Sentuh');
        }
        if (app==='Word') await page.evaluate(() => { editor.innerHTML='<p>Latihan mengetik dan mengatur halaman.</p><p><strong>Surat Undangan</strong></p>'; });
        if (output) await page.screenshot({path:resolve(output,app+'-'+width+'x'+height+'.png')});
      } finally {await page.context().close();}
    });
  }
}

(async () => {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
  try {
    await wordTests();
    await wordMobileEditingTests();
    await wordHomeControlsTests();
    await excelTests();
    await syncTests();
    await layoutTests();
    await exportTests();
    await test('No uncaught script errors',()=>assert.deepEqual(browserErrors,[]));
  } finally {
    await browser.close();
    const total=log.length, passed=log.filter(x=>x.passed).length;
    console.log(passed+' / '+total+' passed');
    if(process.env.CLASSROOM_REPORT)fs.writeFileSync(process.env.CLASSROOM_REPORT,JSON.stringify(log,null,2));
    if(passed!==total)process.exitCode=1;
  }
})().catch(error=>{ console.error(error);process.exitCode=1; });
