(function(){
"use strict";

/* ================= constants ================= */
var CATEGORIES = ["Pneu novo","Pneu conserto","Pneu recapado"];
var DEFAULT_WAREHOUSES = ["Depósito"];
var CAT_DOTS = {"Pneu novo":"var(--ok)","Pneu conserto":"var(--warn)","Pneu recapado":"var(--accent)"};
var STORE_KEY = "tireapp_store_v1";

/* ================= state =================
   Tudo é salvo em localStorage, no navegador/computador onde o app é aberto.
   Não há servidor nem sincronização entre dispositivos — é 100% local. */
var storageAvailable = true;
var store = null;            // { users:[], warehouses:[], materials:[], movements:[], dailyCounts:{} }
var currentUser = null;      // {username, role}
var materials = [];
var movements = [];
var warehouses = [];
var users = [];
var currentPage = "dashboard";
var seedBannerDismissed = false;

try { seedBannerDismissed = localStorage.getItem('tireapp_seed_dismissed') === '1'; } catch(e){}

/* ================= helpers ================= */
function qs(id){ return document.getElementById(id); }
function esc(s){
  s = (s===undefined||s===null) ? "" : String(s);
  return s.replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; });
}
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,10); }
function todayStr(){
  var d = new Date();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var day = String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+"-"+m+"-"+day;
}
function fmtDate(iso){
  if(!iso) return "—";
  var parts = iso.split('-');
  if(parts.length!==3) return iso;
  return parts[2]+"/"+parts[1]+"/"+parts[0];
}
function fmtDateTime(iso){
  try{
    var d = new Date(iso);
    return fmtDate(d.toISOString().slice(0,10)) + " " + String(d.getHours()).padStart(2,'0')+":"+String(d.getMinutes()).padStart(2,'0');
  }catch(e){ return iso||"—"; }
}
function toast(msg){
  var t = qs('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}
async function sha256(text){
  try{
    if(window.crypto && window.crypto.subtle && window.crypto.subtle.digest){
      var enc = new TextEncoder().encode(text);
      var buf = await window.crypto.subtle.digest('SHA-256', enc);
      return 'sha256_'+Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    }
  }catch(e){ /* segue para o fallback */ }
  // Fallback só para navegadores sem Web Crypto disponível (ex.: contexto não seguro).
  // Não é criptográfico, mas evita guardar a senha em texto puro.
  var str = 'tireapp::'+text, h1=0, h2=0;
  for(var i=0;i<str.length;i++){ var c=str.charCodeAt(i); h1=(Math.imul(31,h1)+c)|0; h2=(Math.imul(131,h2)+c)|0; }
  return 'fb_'+(h1>>>0).toString(16)+(h2>>>0).toString(16);
}
function warehouseName(id){ var w = warehouses.find(function(x){return x.id===id;}); return w ? w.name : "—"; }
function materialById(id){ return materials.find(function(x){return x.id===id;}); }

/* ================= modal ================= */
function openModal(html, onMount){
  var root = qs('modalRoot');
  root.innerHTML = '<div class="modal-backdrop" id="mb"><div class="modal">'+html+'</div></div>';
  var mb = qs('mb');
  mb.addEventListener('mousedown', function(e){ if(e.target===mb) closeModal(); });
  if(onMount) onMount(root);
}
function closeModal(){ qs('modalRoot').innerHTML=''; }

/* ================= local storage layer ================= */
function persistStore(){
  if(!storageAvailable) return;
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
  catch(e){ storageAvailable = false; showStorageNotice(); }
}
function showStorageNotice(){
  var el = qs('storageNotice');
  if(el) el.hidden = false;
  toast('Não foi possível salvar localmente neste navegador.');
}

async function buildSeedStore(){
  var whs = DEFAULT_WAREHOUSES.map(function(name){ return { id:uid(), name:name, createdAt:new Date().toISOString() }; });
  var depositoId = whs[0].id;
  var depositoName = whs[0].name;

  // Catálogo real do cliente (código + descrição da planilha enviada).
  // Categoria inferida a partir da descrição; quantidade começa em 0 —
  // use Movimentação → Entrada/Ajuste para lançar os quantitativos reais.
  var sample = [
    {code:"OS0027V", name:"PNEU CONSERTO 275/80", category:"Pneu conserto"},
    {code:"OT0040R33", name:"PNEU CONSERTO 235/75", category:"Pneu conserto"},
    {code:"OT0040C33", name:"PNEU CONSERTO 225/75", category:"Pneu conserto"},
    {code:"OT0040633", name:"PNEU CONSERTO 215/75", category:"Pneu conserto"},
    {code:"OT0082007AN0314", name:"PNEU CONSERTO 7.5/16", category:"Pneu conserto"},
    {code:"OT0042721", name:"PNEU RECAPADO 275/80", category:"Pneu recapado"},
    {code:"OT0042R31", name:"PNEU RECAPADO 235/75", category:"Pneu recapado"},
    {code:"OT0040C30", name:"PNEU RECAPADO 225/75", category:"Pneu recapado"},
    {code:"OT0040630", name:"PNEU RECAPADO 215/75", category:"Pneu recapado"},
    {code:"OT0080035F53515", name:"PNEU RECAPADO 7.5/16", category:"Pneu recapado"},
    {code:"OT0042A30", name:"PNEU RECAPADO 295/80", category:"Pneu recapado"},
    {code:"OT0040S30", name:"PNEU RECAPADO 11R", category:"Pneu recapado"},
    {code:"OT0080044040122", name:"PNEU NOVO 235/75 G686 GOODYEAR", category:"Pneu novo"},
    {code:"OT0082011700403", name:"PNEU NOVO 175/70 R14 F580 FIRESTONE", category:"Pneu novo"},
    {code:"OT0082017C70103", name:"PNEU NOVO 215/75 ARMOR MAX GOODYEAR", category:"Pneu novo"},
    {code:"OT0082021920103", name:"PNEU NOVO 225/75 G32 GOODYEAR", category:"Pneu novo"},
    {code:"OT0082025D00335", name:"PNEU NOVO 275/80 FG88 PIRELLI", category:"Pneu novo"},
    {code:"OT0082025E70103", name:"PNEU NOVO 275/80 ARMOR MAX GOODYEAR", category:"Pneu novo"},
    {code:"OT0082025IC0465", name:"PNEU NOVO 275/80 T819 FIRESTONE", category:"Pneu novo"},
    {code:"OT0082033140303", name:"PNEU NOVO 215/75 FG85 PIRELLI", category:"Pneu novo"},
    {code:"OT0082069790303", name:"PNEU NOVO MOTO 90/90 PIRELLI", category:"Pneu novo"},
    {code:"OT0082082790303", name:"PNEU NOVO MOTO 2,75X18 PIRELLI", category:"Pneu novo"},
    {code:"OT0082102D40303", name:"PNEU NOVO 165/70 F.ENERGY PIRELLI", category:"Pneu novo"},
    {code:"OT0082156BB0151", name:"PNEU NOVO 185/55 E.GRIP GOODYEAR", category:"Pneu novo"},
    {code:"OT008A025HG1055", name:"PNEU NOVO 275/80 R165E BRIDGESTONE", category:"Pneu novo"},
    {code:"OT008A025HT0456", name:"PNEU NOVO 275/80 T822 FIRESTONE", category:"Pneu novo"}
  ];
  var mats = sample.map(function(s){
    return { id:uid(), code:s.code, name:s.name, category:s.category, warehouseId:depositoId, warehouseName:depositoName,
      quantity:0, unit:"UND", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  });

  // Sem histórico fictício: como as quantidades reais ainda não foram informadas,
  // a lista de movimentações começa vazia — cada Entrada/Ajuste feito no app vira histórico real.
  var moves = [];

  var adminHash = await sha256('admin123');
  var usersArr = [{ username:'admin', passwordHash:adminHash, role:'admin', createdAt:new Date().toISOString() }];

  return { warehouses:whs, materials:mats, movements:moves, users:usersArr, dailyCounts:{} };
}

/* Compatibilidade com dados já salvos por uma versão anterior do app:
   - versões antigas tinham 3 locais de estoque (Depósito / Estoque de Pneus / Borracharia)
     e um campo de "estoque mínimo" por material — ambos foram removidos do app.
   Esta função roda a cada carregamento e normaliza dados antigos para o novo formato,
   sem apagar quantidades (materiais duplicados por código têm as quantidades somadas). */
function migrateStore(s){
  if(s.warehouses && s.warehouses.length > 1){
    var primary = s.warehouses.find(function(w){ return w.name === 'Depósito'; }) || s.warehouses[0];
    primary.name = 'Depósito';
    var byCode = {};
    var merged = [];
    (s.materials||[]).forEach(function(m){
      m.warehouseId = primary.id;
      m.warehouseName = 'Depósito';
      var key = (m.code||'').toLowerCase();
      if(byCode[key]){
        byCode[key].quantity = Number(byCode[key].quantity||0) + Number(m.quantity||0);
      } else {
        byCode[key] = m;
        merged.push(m);
      }
    });
    s.materials = merged;
    s.warehouses = [primary];
  }
  (s.materials||[]).forEach(function(m){ delete m.minStock; });
  if(!s.dailyCounts) s.dailyCounts = {};
  return s;
}

async function loadOrSeedStore(){
  var raw = null;
  try{ raw = localStorage.getItem(STORE_KEY); }
  catch(e){ storageAvailable = false; }

  if(raw){
    try{
      var parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.users) && Array.isArray(parsed.warehouses) && Array.isArray(parsed.materials) && Array.isArray(parsed.movements)){
        store = parsed;
      }
    }catch(e){ /* dados corrompidos: recria abaixo */ }
  }
  if(!store){
    store = await buildSeedStore();
  } else {
    store = migrateStore(store);
  }
  persistStore();
  materials = store.materials;
  movements = store.movements;
  warehouses = store.warehouses;
  users = store.users;
  if(!storageAvailable) showStorageNotice();
}

/* ================= daily count helpers ================= */
function todayCountMap(){
  var today = todayStr();
  if(!store.dailyCounts) store.dailyCounts = {};
  if(!store.dailyCounts[today]) store.dailyCounts[today] = {};
  return store.dailyCounts[today];
}
function hasCountValue(v){ return v!==undefined && v!==null && v!==''; }

/* ================= render: dashboard ================= */
function renderAll(){
  renderStats();
  renderDashboardPanels();
  renderMaterials();
  renderMovementsToday();
  renderHistory();
  renderWarehouses();
  renderCount();
  renderFilters();
  renderUsers();
}

function renderStats(){
  qs('statItems').textContent = materials.length;
  qs('statUnits').textContent = materials.reduce(function(a,m){return a+Number(m.quantity||0);},0);
  var today = todayStr();
  qs('statToday').textContent = movements.filter(function(m){return m.date===today;}).length;
  var counts = (store.dailyCounts && store.dailyCounts[today]) ? store.dailyCounts[today] : {};
  var countedN = materials.filter(function(m){ return hasCountValue(counts[m.id]); }).length;
  qs('statCount').textContent = countedN + '/' + materials.length;
}

function typePill(t){
  if(t==='entrada') return '<span class="pill pill-in">↓ Entrada</span>';
  if(t==='saida') return '<span class="pill pill-out">↑ Saída</span>';
  if(t==='transferencia') return '<span class="pill pill-transfer">⇄ Transferência</span>';
  return '<span class="pill pill-adj">⚙ Ajuste</span>';
}
function movWarehouseLabel(m){
  if(m.type==='transferencia') return esc(m.originWarehouseName||'—') + ' → ' + esc(m.destWarehouseName||'—');
  return esc(m.warehouseName||'—');
}

/* Gráfico de barras (SVG) com as unidades em estoque por categoria. */
function renderCategoryChart(){
  var byCat = {};
  CATEGORIES.forEach(function(c){ byCat[c]=0; });
  materials.forEach(function(m){ byCat[m.category] = (byCat[m.category]||0) + Number(m.quantity||0); });
  var values = CATEGORIES.map(function(c){ return byCat[c]||0; });
  var max = Math.max.apply(null, values.concat([1]));

  var W = 560, H = 240, padTop = 30, padBottom = 42, padSide = 20;
  var chartH = H - padTop - padBottom;
  var n = CATEGORIES.length;
  var gap = 30;
  var barW = Math.max(40, Math.min(96, (W - padSide*2 - gap*(n-1)) / n));
  var totalBarsW = barW*n + gap*(n-1);
  var startX = (W - totalBarsW)/2;
  var baseline = padTop+chartH;

  var bars = CATEGORIES.map(function(c, i){
    var v = byCat[c]||0;
    var h = max>0 ? Math.round((v/max)*chartH) : 0;
    if(v>0 && h<3) h = 3;
    var x = startX + i*(barW+gap);
    var y = baseline - h;
    var color = CAT_DOTS[c];
    var shortLabel = c.replace('Pneu ','');
    return '<g>'+
      '<title>'+esc(c)+': '+v+' unidade(s) em estoque</title>'+
      '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+h+'" rx="6" ry="6" style="fill:'+color+'"></rect>'+
      '<text x="'+(x+barW/2).toFixed(1)+'" y="'+(y-10).toFixed(1)+'" text-anchor="middle" style="fill:var(--ink);font-family:var(--font-mono);font-weight:700;font-size:14px;">'+v+'</text>'+
      '<text x="'+(x+barW/2).toFixed(1)+'" y="'+(baseline+22)+'" text-anchor="middle" style="fill:var(--ink-soft);font-size:12px;font-weight:600;">'+esc(shortLabel)+'</text>'+
    '</g>';
  }).join('');

  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block;max-height:260px;" role="img" aria-label="Unidades em estoque por categoria de pneu">'+
    '<line x1="'+padSide+'" y1="'+baseline+'" x2="'+(W-padSide)+'" y2="'+baseline+'" style="stroke:var(--border);stroke-width:1;"></line>'+
    bars+
    '</svg>';
}

function renderDashboardPanels(){
  var movBody = qs('dashMovBody');
  var recent = movements.slice(0,8);
  movBody.innerHTML = recent.length ? recent.map(function(m){
    return '<tr><td class="mono">'+fmtDate(m.date)+'</td><td>'+typePill(m.type)+'</td><td>'+esc(m.materialName)+'</td>'+
      '<td class="mono">'+esc(m.quantity)+'</td><td>'+esc(m.person||'—')+'</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="5">Sem movimentações ainda.</td></tr>';

  qs('dashCatBody').innerHTML = renderCategoryChart();
}

/* ================= render: materials ================= */
function renderFilters(){
  var catSel = qs('matCatFilter');
  if(catSel.options.length<=1){
    CATEGORIES.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; catSel.appendChild(o); });
  }
  var whSel = qs('matWhFilter');
  var current = whSel.value;
  whSel.innerHTML = '<option value="">Todos depósitos</option>' + warehouses.map(function(w){return '<option value="'+w.id+'">'+esc(w.name)+'</option>';}).join('');
  whSel.value = current;
}

function getMaterialFilters(){
  return {
    q: qs('matSearch').value.trim().toLowerCase(),
    cat: qs('matCatFilter').value,
    wh: qs('matWhFilter').value
  };
}

function renderMaterials(){
  qs('seedBanner').hidden = seedBannerDismissed || materials.length===0;
  var f = getMaterialFilters();
  var list = materials.filter(function(m){
    if(f.q && !((m.name||'').toLowerCase().indexOf(f.q)>-1 || (m.code||'').toLowerCase().indexOf(f.q)>-1)) return false;
    if(f.cat && m.category!==f.cat) return false;
    if(f.wh && m.warehouseId!==f.wh) return false;
    return true;
  }).slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
  var body = qs('materialsBody');
  body.innerHTML = list.length ? list.map(function(m){
    return '<tr>'+
      '<td class="mono">'+esc(m.code)+'</td>'+
      '<td>'+esc(m.name)+'</td>'+
      '<td><span class="pill pill-cat"><span class="dot" style="background:'+CAT_DOTS[m.category]+'"></span>'+esc(m.category)+'</span></td>'+
      '<td>'+esc(m.warehouseName)+'</td>'+
      '<td class="mono">'+esc(m.quantity)+'</td>'+
      '<td>'+esc(m.unit)+'</td>'+
      '<td><div class="row-actions"><button class="icon-btn" data-edit-material="'+m.id+'" title="Editar">✎</button></div></td>'+
    '</tr>';
  }).join('') : '<tr class="empty-row"><td colspan="7">Nenhum material encontrado.</td></tr>';
}

/* ================= render: movements today / history ================= */
function renderMovementsToday(){
  var today = todayStr();
  var list = movements.filter(function(m){return m.date===today;});
  var body = qs('movTodayBody');
  body.innerHTML = list.length ? list.map(function(m){
    return '<tr><td class="mono">'+fmtDateTime(m.createdAt).split(' ')[1]+'</td><td>'+typePill(m.type)+'</td><td>'+esc(m.materialName)+'</td>'+
      '<td class="mono">'+esc(m.quantity)+'</td><td class="mono">'+esc(m.asset||'—')+'</td><td>'+esc(m.person||'—')+'</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="6">Nenhuma movimentação hoje ainda. Use os botões acima para registrar.</td></tr>';
}

function renderHistory(){
  var q = qs('histSearch').value.trim().toLowerCase();
  var type = qs('histTypeFilter').value;
  var from = qs('histDateFrom').value;
  var to = qs('histDateTo').value;
  var list = movements.filter(function(m){
    if(type && m.type!==type) return false;
    if(from && m.date<from) return false;
    if(to && m.date>to) return false;
    if(q){
      var hay = ((m.materialName||'')+' '+(m.asset||'')+' '+(m.person||'')).toLowerCase();
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });
  var body = qs('historyBody');
  body.innerHTML = list.length ? list.map(function(m){
    return '<tr><td class="mono">'+fmtDate(m.date)+'</td><td>'+typePill(m.type)+'</td><td>'+esc(m.materialName)+' <span class="mono" style="color:var(--ink-faint);">'+esc(m.materialCode)+'</span></td>'+
      '<td class="mono">'+esc(m.quantity)+'</td><td class="mono">'+esc(m.asset||'—')+'</td><td>'+movWarehouseLabel(m)+'</td>'+
      '<td>'+esc(m.person||'—')+'</td><td>'+esc(m.note||'—')+'</td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="8">Nenhuma movimentação encontrada para esse filtro.</td></tr>';
}

/* ================= render: daily count (contagem diária) ================= */
function renderCount(){
  var titleEl = qs('countDateLabel');
  if(titleEl) titleEl.textContent = fmtDate(todayStr());

  var searchEl = qs('countSearch');
  var q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  var counts = todayCountMap();

  var list = materials.filter(function(m){
    if(q && !((m.name||'').toLowerCase().indexOf(q)>-1 || (m.code||'').toLowerCase().indexOf(q)>-1)) return false;
    return true;
  }).slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });

  var counted = materials.filter(function(m){ return hasCountValue(counts[m.id]); }).length;
  var progEl = qs('countProgress');
  if(progEl) progEl.textContent = counted + ' de ' + materials.length + ' contados hoje';

  var body = qs('countBody');
  body.innerHTML = list.length ? list.map(function(m){
    var raw = counts[m.id];
    return '<tr>'+
      '<td class="mono">'+esc(m.code)+'</td>'+
      '<td>'+esc(m.name)+'</td>'+
      '<td>'+esc(m.warehouseName)+'</td>'+
      '<td class="mono">'+esc(m.quantity)+' '+esc(m.unit)+'</td>'+
      '<td><input type="number" min="0" step="1" inputmode="numeric" class="count-input" data-count-material="'+m.id+'" value="'+(hasCountValue(raw)?esc(raw):'')+'" placeholder="—"></td>'+
      '<td class="mono" data-diff-cell>'+diffPillHtml(raw, m.quantity)+'</td>'+
    '</tr>';
  }).join('') : '<tr class="empty-row"><td colspan="6">Nenhum material encontrado.</td></tr>';
}

function diffPillHtml(raw, systemQty){
  if(!hasCountValue(raw)) return '<span style="color:var(--ink-faint);">—</span>';
  var diff = Number(raw) - Number(systemQty||0);
  if(diff===0) return '<span class="pill pill-ok">0</span>';
  return '<span class="pill pill-low">'+(diff>0?'+':'')+diff+'</span>';
}

/* ================= render: warehouses ================= */
function renderWarehouses(){
  var body = qs('warehousesBody');
  body.innerHTML = warehouses.length ? warehouses.map(function(w){
    var items = materials.filter(function(m){return m.warehouseId===w.id;});
    var units = items.reduce(function(a,m){return a+Number(m.quantity||0);},0);
    return '<tr><td>'+esc(w.name)+'</td><td class="mono">'+items.length+'</td><td class="mono">'+units+'</td>'+
      '<td><div class="row-actions"><button class="icon-btn" data-edit-warehouse="'+w.id+'" title="Renomear">✎</button></div></td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="4">Nenhum depósito cadastrado.</td></tr>';
}

/* ================= render: users ================= */
function renderUsers(){
  var body = qs('usersBody');
  if(!body || !currentUser) return;
  body.innerHTML = users.length ? users.slice().sort(function(a,b){return a.username.localeCompare(b.username);}).map(function(u){
    return '<tr><td>'+esc(u.username)+'</td><td><span class="pill pill-role">'+esc(u.role)+'</span></td>'+
      '<td class="mono">'+fmtDate((u.createdAt||'').slice(0,10))+'</td>'+
      '<td><div class="row-actions"><button class="icon-btn" data-reset-user="'+esc(u.username)+'" title="Redefinir senha">🔑</button>'+
      (u.username!==currentUser.username ? '<button class="icon-btn" data-del-user="'+esc(u.username)+'" title="Remover">🗑</button>' : '')+
      '</div></td></tr>';
  }).join('') : '<tr class="empty-row"><td colspan="4">Nenhum usuário.</td></tr>';
}

/* ================= navigation ================= */
function setPage(page){
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(function(n){ n.classList.toggle('active', n.dataset.page===page); });
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  qs('page-'+page).classList.add('active');
  var titles = {dashboard:'Painel', materials:'Estoque', movements:'Movimentação', count:'Contagem diária', history:'Histórico', warehouses:'Depósitos', users:'Usuários', backup:'Backup'};
  qs('pageTitle').textContent = titles[page]||page;
  qs('sidebar').classList.remove('open');
  qs('sidebarScrim').classList.remove('show');
}

/* ================= material add/edit ================= */
function whOptions(selectedId){
  return warehouses.map(function(w){ return '<option value="'+w.id+'" '+(w.id===selectedId?'selected':'')+'>'+esc(w.name)+'</option>'; }).join('');
}
function catOptions(selected){
  return CATEGORIES.map(function(c){ return '<option value="'+esc(c)+'" '+(c===selected?'selected':'')+'>'+esc(c)+'</option>'; }).join('');
}

function openMaterialModal(material){
  var editing = !!material;
  var html =
    '<h3>'+(editing?'Editar material':'Novo material')+'</h3>'+
    '<div id="matFormError" class="form-error" hidden></div>'+
    '<form id="matForm">'+
      '<div class="field"><label>Nome</label><input id="mName" required value="'+(editing?esc(material.name):'')+'" placeholder="ex: Pneu 185/65 R15"></div>'+
      '<div class="grid2">'+
        '<div class="field"><label>Código</label><input id="mCode" required value="'+(editing?esc(material.code):'')+'" placeholder="ex: PN-185/65R15"></div>'+
        '<div class="field"><label>Categoria</label><select id="mCat">'+catOptions(editing?material.category:CATEGORIES[0])+'</select></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div class="field"><label>Depósito</label><select id="mWh">'+whOptions(editing?material.warehouseId:(warehouses[0]&&warehouses[0].id))+'</select></div>'+
        '<div class="field"><label>Unidade</label><input id="mUnit" value="'+(editing?esc(material.unit):'UND')+'"></div>'+
      '</div>'+
      '<div class="field"><label>Quantidade '+(editing?'atual':'inicial')+'</label><input id="mQty" type="number" min="0" step="1" required value="'+(editing?esc(material.quantity):'0')+'" '+(editing?'disabled':'')+'></div>'+
      (editing?'<div class="helptext">Para alterar a quantidade, use Movimentação → Ajuste (mantém o histórico correto).</div>':'')+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="matCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary" id="matSave">'+(editing?'Salvar':'Cadastrar')+'</button>'+
      '</div>'+
    '</form>';
  openModal(html, function(root){
    root.querySelector('#matCancel').addEventListener('click', closeModal);
    root.querySelector('#matForm').addEventListener('submit', function(e){
      e.preventDefault();
      var errEl = root.querySelector('#matFormError');
      errEl.hidden = true;
      var name = root.querySelector('#mName').value.trim();
      var code = root.querySelector('#mCode').value.trim();
      var cat = root.querySelector('#mCat').value;
      var whId = root.querySelector('#mWh').value;
      var unit = root.querySelector('#mUnit').value.trim() || 'UND';
      var qty = Number(root.querySelector('#mQty').value);
      if(!name || !code || !whId){ errEl.textContent='Preencha nome, código e depósito.'; errEl.hidden=false; return; }
      var dup = materials.find(function(m){ return m.code.toLowerCase()===code.toLowerCase() && m.warehouseId===whId && (!editing || m.id!==material.id); });
      if(dup){ errEl.textContent='Já existe um material com esse código nesse depósito. Para levar estoque de um código já existente a outro depósito, edite a quantidade por Movimentação → Ajuste.'; errEl.hidden=false; return; }
      var whName = warehouseName(whId);
      if(editing){
        material.name=name; material.code=code; material.category=cat; material.warehouseId=whId;
        material.warehouseName=whName; material.unit=unit; material.updatedAt=new Date().toISOString();
        toast('Material atualizado.');
      } else {
        materials.push({ id:uid(), name:name, code:code, category:cat, warehouseId:whId, warehouseName:whName, unit:unit,
          quantity: isNaN(qty)?0:qty, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
        toast('Material cadastrado.');
      }
      persistStore();
      renderAll();
      closeModal();
    });
  });
}

/* ================= warehouse add/edit ================= */
function openWarehouseModal(wh){
  var editing = !!wh;
  var html =
    '<h3>'+(editing?'Renomear depósito':'Novo depósito')+'</h3>'+
    '<div id="whFormError" class="form-error" hidden></div>'+
    '<form id="whForm">'+
      '<div class="field"><label>Nome do depósito</label><input id="whName" required value="'+(editing?esc(wh.name):'')+'" placeholder="ex: Almoxarifado Central"></div>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="whCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary">'+(editing?'Salvar':'Adicionar')+'</button>'+
      '</div>'+
    '</form>';
  openModal(html, function(root){
    root.querySelector('#whCancel').addEventListener('click', closeModal);
    root.querySelector('#whForm').addEventListener('submit', function(e){
      e.preventDefault();
      var errEl = root.querySelector('#whFormError'); errEl.hidden=true;
      var name = root.querySelector('#whName').value.trim();
      if(!name){ errEl.textContent='Informe um nome.'; errEl.hidden=false; return; }
      var dup = warehouses.find(function(w){ return w.name.toLowerCase()===name.toLowerCase() && (!editing||w.id!==wh.id); });
      if(dup){ errEl.textContent='Já existe um depósito com esse nome.'; errEl.hidden=false; return; }
      if(editing){
        wh.name = name;
        materials.filter(function(m){return m.warehouseId===wh.id;}).forEach(function(m){ m.warehouseName = name; });
        toast('Depósito renomeado.');
      } else {
        warehouses.push({ id:uid(), name:name, createdAt:new Date().toISOString() });
        toast('Depósito adicionado.');
      }
      persistStore();
      renderAll();
      closeModal();
    });
  });
}

/* ================= movement modal ================= */
function openMovementModal(type){
  var labels = {
    entrada:{title:'Registrar entrada', personLabel:'Recebido por', qtyLabel:'Quantidade recebida'},
    saida:{title:'Registrar saída', personLabel:'Retirado por (borracheiro)', qtyLabel:'Quantidade retirada'},
    ajuste:{title:'Ajuste de estoque', personLabel:'Responsável pela contagem', qtyLabel:'Nova quantidade (contada)'}
  };
  var L = labels[type];
  if(materials.length===0){ toast('Cadastre um material antes de registrar movimentação.'); return; }

  var html =
    '<h3>'+L.title+'</h3>'+
    '<div id="movFormError" class="form-error" hidden></div>'+
    '<form id="movForm">'+
      '<div class="field"><label>Material</label><select id="movMaterial" required>'+
        materials.map(function(m){return '<option value="'+m.id+'">'+esc(m.code)+' — '+esc(m.name)+' ('+m.quantity+' '+esc(m.unit)+' em '+esc(m.warehouseName)+')</option>';}).join('')+
      '</select></div>'+
      '<div class="grid2">'+
        '<div class="field"><label>'+L.qtyLabel+'</label><input id="movQty" type="number" min="0" step="1" required></div>'+
        '<div class="field"><label>Data</label><input id="movDate" type="date" value="'+todayStr()+'" required></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div class="field"><label>Ativo <span style="font-weight:400;color:var(--ink-faint);">(opcional)</span></label><input id="movAsset" placeholder="ex: 126.0111"></div>'+
        '<div class="field"><label>'+L.personLabel+'</label><input id="movPerson" required placeholder="Nome"></div>'+
      '</div>'+
      '<div class="field"><label>Depósito</label><select id="movWh"></select></div>'+
      '<div class="field"><label>Observação <span style="font-weight:400;color:var(--ink-faint);">(opcional)</span></label><input id="movNote" placeholder="ex: reposição mensal"></div>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="movCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary">Registrar</button>'+
      '</div>'+
    '</form>';
  openModal(html, function(root){
    var matSel = root.querySelector('#movMaterial');
    var whSel = root.querySelector('#movWh');
    function syncWh(){
      var m = materialById(matSel.value);
      if(!m) return;
      whSel.innerHTML = whOptions(m.warehouseId);
    }
    matSel.addEventListener('change', syncWh);
    syncWh();
    root.querySelector('#movCancel').addEventListener('click', closeModal);
    root.querySelector('#movForm').addEventListener('submit', function(e){
      e.preventDefault();
      var errEl = root.querySelector('#movFormError'); errEl.hidden=true;
      var m = materialById(matSel.value);
      var qtyInput = Number(root.querySelector('#movQty').value);
      var date = root.querySelector('#movDate').value;
      var asset = root.querySelector('#movAsset').value.trim();
      var person = root.querySelector('#movPerson').value.trim();
      var whId = whSel.value;
      var note = root.querySelector('#movNote').value.trim();
      if(!m || isNaN(qtyInput) || qtyInput<0 || !date || !person){ errEl.textContent='Preencha os campos obrigatórios.'; errEl.hidden=false; return; }
      var now = new Date().toISOString();

      var prevQty = Number(m.quantity||0);
      var newQty, delta;
      if(type==='entrada'){ newQty = prevQty + qtyInput; delta = qtyInput; }
      else if(type==='saida'){
        if(qtyInput > prevQty){ errEl.textContent='Quantidade indisponível. Em estoque: '+prevQty+' '+m.unit+'.'; errEl.hidden=false; return; }
        newQty = prevQty - qtyInput; delta = qtyInput;
      } else { newQty = qtyInput; delta = qtyInput - prevQty; }

      m.quantity = newQty; m.updatedAt = now;
      movements.unshift({
        id:uid(), materialId:m.id, materialCode:m.code, materialName:m.name, type:type,
        quantity: type==='ajuste' ? Math.abs(delta) : qtyInput,
        previousQty:prevQty, newQty:newQty, date:date, asset:asset, person:person,
        warehouseId:whId, warehouseName:warehouseName(whId), note:note,
        createdAt:now, createdBy:currentUser.username
      });
      persistStore();
      renderAll();
      toast('Movimentação registrada.');
      closeModal();
      setPage('movements');
    });
  });
}

/* ================= users modal ================= */
function openUserModal(){
  var html =
    '<h3>Novo usuário</h3>'+
    '<div id="userFormError" class="form-error" hidden></div>'+
    '<form id="userForm">'+
      '<div class="field"><label>Usuário</label><input id="uUser" required placeholder="ex: joao.silva"></div>'+
      '<div class="field"><label>Senha</label><input id="uPass" type="password" required minlength="4"></div>'+
      '<div class="field"><label>Perfil</label><select id="uRole"><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="uCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary">Criar usuário</button>'+
      '</div>'+
    '</form>';
  openModal(html, function(root){
    root.querySelector('#uCancel').addEventListener('click', closeModal);
    root.querySelector('#userForm').addEventListener('submit', async function(e){
      e.preventDefault();
      var errEl = root.querySelector('#userFormError'); errEl.hidden=true;
      var uname = root.querySelector('#uUser').value.trim().toLowerCase();
      var pass = root.querySelector('#uPass').value;
      var role = root.querySelector('#uRole').value;
      if(!uname || pass.length<4){ errEl.textContent='Usuário obrigatório e senha com ao menos 4 caracteres.'; errEl.hidden=false; return; }
      var existing = users.find(function(u){return u.username.toLowerCase()===uname;});
      if(existing){ errEl.textContent='Já existe um usuário com esse nome.'; errEl.hidden=false; return; }
      var btn = root.querySelector('button[type="submit"]'); btn.disabled=true; btn.textContent='Criando…';
      var hash = await sha256(pass);
      users.push({ username:uname, passwordHash:hash, role:role, createdAt:new Date().toISOString() });
      persistStore();
      renderUsers();
      toast('Usuário criado.');
      closeModal();
    });
  });
}
function openResetPasswordModal(username){
  var html =
    '<h3>Redefinir senha — '+esc(username)+'</h3>'+
    '<div id="rpFormError" class="form-error" hidden></div>'+
    '<form id="rpForm">'+
      '<div class="field"><label>Nova senha</label><input id="rpPass" type="password" required minlength="4"></div>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="rpCancel">Cancelar</button>'+
        '<button type="submit" class="btn btn-primary">Salvar</button>'+
      '</div>'+
    '</form>';
  openModal(html, function(root){
    root.querySelector('#rpCancel').addEventListener('click', closeModal);
    root.querySelector('#rpForm').addEventListener('submit', async function(e){
      e.preventDefault();
      var errEl = root.querySelector('#rpFormError'); errEl.hidden=true;
      var pass = root.querySelector('#rpPass').value;
      if(pass.length<4){ errEl.textContent='Senha muito curta.'; errEl.hidden=false; return; }
      var u = users.find(function(x){return x.username===username;});
      if(!u){ errEl.textContent='Usuário não encontrado.'; errEl.hidden=false; return; }
      var hash = await sha256(pass);
      u.passwordHash = hash;
      persistStore();
      toast('Senha redefinida.');
      closeModal();
    });
  });
}

/* ================= exportação de contagem diária em Excel (.xlsx) =================
   Gerador mínimo de .xlsx em JS puro (sem depender de internet nem bibliotecas
   externas): um .xlsx é um .zip com alguns XML dentro. As funções abaixo montam
   esse zip "na mão" (sem compressão, método STORE) e as planilhas em XML OOXML. */
var CRC_TABLE = (function(){
  var t = new Uint32Array(256);
  for(var n=0;n<256;n++){
    var c = n;
    for(var k=0;k<8;k++){ c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes){
  var crc = 0xFFFFFFFF;
  for(var i=0;i<bytes.length;i++){ crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8); }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function strToBytes(str){ return new TextEncoder().encode(str); }

function makeZip(files){
  var localParts = [];
  var centralParts = [];
  var offset = 0;
  var dosTime = 0, dosDate = 0x21; // data fixa (01/01/1980) só para satisfazer o formato

  files.forEach(function(f){
    var nameBytes = strToBytes(f.name);
    var data = f.data;
    var crc = crc32(data);
    var size = data.length;

    var local = new Uint8Array(30 + nameBytes.length);
    var dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, dosTime, true);
    dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    var central = new Uint8Array(46 + nameBytes.length);
    var cdv = new DataView(central.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, dosTime, true);
    cdv.setUint16(14, dosDate, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  });

  var centralSize = centralParts.reduce(function(a,p){return a+p.length;},0);
  var centralOffset = offset;

  var end = new Uint8Array(22);
  var edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true);

  var totalLen = offset + centralSize + end.length;
  var out = new Uint8Array(totalLen);
  var pos = 0;
  localParts.forEach(function(p){ out.set(p, pos); pos += p.length; });
  centralParts.forEach(function(p){ out.set(p, pos); pos += p.length; });
  out.set(end, pos);
  return out;
}

function xmlEscape(s){
  return String(s===undefined||s===null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c];
  });
}
function colLetter(idx){
  var s = '', n = idx+1;
  while(n>0){ var m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=Math.floor((n-1)/26); }
  return s;
}
function xlsxCell(colIdx, rowIdx, value, styleIdx){
  var ref = colLetter(colIdx)+rowIdx;
  var sAttr = styleIdx ? ' s="'+styleIdx+'"' : '';
  if(typeof value === 'number' && isFinite(value)){
    return '<c r="'+ref+'"'+sAttr+'><v>'+value+'</v></c>';
  }
  var text = (value===undefined||value===null) ? '' : String(value);
  return '<c r="'+ref+'" t="inlineStr"'+sAttr+'><is><t xml:space="preserve">'+xmlEscape(text)+'</t></is></c>';
}
function buildXlsx(sheetName, header, rows){
  var sheetXmlRows = [];
  var rowIdx = 1;
  sheetXmlRows.push('<row r="'+rowIdx+'">' + header.map(function(h,i){ return xlsxCell(i, rowIdx, h, 1); }).join('') + '</row>');
  rowIdx++;
  rows.forEach(function(r){
    sheetXmlRows.push('<row r="'+rowIdx+'">' + r.map(function(v,i){ return xlsxCell(i, rowIdx, v, 0); }).join('') + '</row>');
    rowIdx++;
  });
  var lastCol = colLetter(header.length-1);
  var dim = 'A1:'+lastCol+(rowIdx-1);

  var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    '</Types>';

  var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'+
    '</Relationships>';

  var workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<sheets><sheet name="'+xmlEscape(sheetName).slice(0,31)+'" sheetId="1" r:id="rId1"/></sheets>'+
    '</workbook>';

  var workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
    '</Relationships>';

  var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'+
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'+
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="2">'+
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+
    '</cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
    '</styleSheet>';

  var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<dimension ref="'+dim+'"/>'+
    '<sheetData>'+sheetXmlRows.join('')+'</sheetData>'+
    '</worksheet>';

  var files = [
    {name:'[Content_Types].xml', data: strToBytes(contentTypes)},
    {name:'_rels/.rels', data: strToBytes(rootRels)},
    {name:'xl/workbook.xml', data: strToBytes(workbook)},
    {name:'xl/_rels/workbook.xml.rels', data: strToBytes(workbookRels)},
    {name:'xl/styles.xml', data: strToBytes(styles)},
    {name:'xl/worksheets/sheet1.xml', data: strToBytes(sheet)}
  ];
  return makeZip(files);
}

function downloadBytes(bytes, filename, mime){
  try{
    var blob = new Blob([bytes], {type: mime});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
    return true;
  }catch(err){ console.error(err); return false; }
}

function exportDailyCountExcel(){
  var today = todayStr();
  var counts = todayCountMap();
  var rows = materials.slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); }).map(function(m){
    var raw = counts[m.id];
    var has = hasCountValue(raw);
    var sysQty = Number(m.quantity||0);
    var countedQty = has ? Number(raw) : '(não contado)';
    var diff = has ? (Number(raw) - sysQty) : '—';
    return [m.code, m.name, m.warehouseName, sysQty, countedQty, diff];
  });
  var header = ['Código','Material','Depósito','Qtd. sistema','Qtd. contada','Diferença'];
  try{
    var bytes = buildXlsx('Contagem '+today, header, rows);
    var ok = downloadBytes(bytes, 'contagem-pneus-'+today+'.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast(ok ? 'Planilha da contagem baixada.' : 'Não foi possível gerar o Excel neste ambiente.');
  }catch(err){
    console.error(err);
    toast('Não foi possível gerar o Excel neste ambiente.');
  }
}

/* ================= event wiring ================= */
function wireStaticEvents(){
  document.querySelectorAll('.nav-item').forEach(function(n){
    n.addEventListener('click', function(){ setPage(n.dataset.page); });
  });
  qs('hamburger').addEventListener('click', function(){
    qs('sidebar').classList.add('open');
    qs('sidebarScrim').classList.add('show');
  });
  qs('sidebarScrim').addEventListener('click', function(){
    qs('sidebar').classList.remove('open');
    qs('sidebarScrim').classList.remove('show');
  });
  qs('logoutBtn').addEventListener('click', doLogout);

  qs('addMaterialBtn').addEventListener('click', function(){ openMaterialModal(null); });
  qs('addWarehouseBtn').addEventListener('click', function(){ openWarehouseModal(null); });
  qs('addUserBtn').addEventListener('click', openUserModal);
  qs('exportBackupBtn').addEventListener('click', exportBackup);
  qs('importBackupBtn').addEventListener('click', function(){ qs('importBackupInput').click(); });
  qs('importBackupInput').addEventListener('change', function(e){
    var file = e.target.files && e.target.files[0];
    if(file) importBackupFile(file);
    e.target.value = '';
  });
  qs('btnEntrada').addEventListener('click', function(){ openMovementModal('entrada'); });
  qs('btnSaida').addEventListener('click', function(){ openMovementModal('saida'); });
  qs('btnAjuste').addEventListener('click', function(){ openMovementModal('ajuste'); });

  qs('dismissSeedBanner').addEventListener('click', function(){
    seedBannerDismissed = true;
    qs('seedBanner').hidden = true;
    try{ localStorage.setItem('tireapp_seed_dismissed','1'); }catch(e){}
  });

  ['matSearch','matCatFilter','matWhFilter'].forEach(function(id){
    qs(id).addEventListener('input', renderMaterials);
    qs(id).addEventListener('change', renderMaterials);
  });
  ['histSearch','histTypeFilter','histDateFrom','histDateTo'].forEach(function(id){
    qs(id).addEventListener('input', renderHistory);
    qs(id).addEventListener('change', renderHistory);
  });

  qs('countSearch').addEventListener('input', renderCount);
  qs('exportCountBtn').addEventListener('click', exportDailyCountExcel);
  qs('clearCountBtn').addEventListener('click', function(){
    var today = todayStr();
    var counts = todayCountMap();
    if(Object.keys(counts).length===0){ toast('A contagem de hoje já está vazia.'); return; }
    var html =
      '<h3>Limpar contagem de hoje</h3>'+
      '<p style="color:var(--ink-soft);font-size:13.5px;">Isso apaga todos os valores digitados na contagem de <b>'+fmtDate(today)+'</b>. Essa ação não pode ser desfeita.</p>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="ccCancel">Cancelar</button>'+
        '<button type="button" class="btn btn-danger" id="ccConfirm">Limpar</button>'+
      '</div>';
    openModal(html, function(root){
      root.querySelector('#ccCancel').addEventListener('click', closeModal);
      root.querySelector('#ccConfirm').addEventListener('click', function(){
        store.dailyCounts[today] = {};
        persistStore();
        renderCount();
        toast('Contagem de hoje limpa.');
        closeModal();
      });
    });
  });
  qs('countBody').addEventListener('input', function(e){
    var mid = e.target.getAttribute && e.target.getAttribute('data-count-material');
    if(!mid) return;
    var counts = todayCountMap();
    var val = e.target.value;
    if(val===''){ delete counts[mid]; } else { counts[mid] = Number(val); }
    persistStore();
    var m = materialById(mid);
    var row = e.target.closest('tr');
    var diffCell = row && row.querySelector('[data-diff-cell]');
    if(diffCell && m){ diffCell.innerHTML = diffPillHtml(val, m.quantity); }
    var counted = materials.filter(function(mm){ return hasCountValue(counts[mm.id]); }).length;
    var progEl = qs('countProgress');
    if(progEl) progEl.textContent = counted + ' de ' + materials.length + ' contados hoje';
    var statCountEl = qs('statCount');
    if(statCountEl) statCountEl.textContent = counted + '/' + materials.length;
  });

  qs('content').addEventListener('click', function(e){
    var editId = e.target.getAttribute && e.target.getAttribute('data-edit-material');
    if(editId){ openMaterialModal(materialById(editId)); return; }
    var whId = e.target.getAttribute && e.target.getAttribute('data-edit-warehouse');
    if(whId){ openWarehouseModal(warehouses.find(function(w){return w.id===whId;})); return; }
    var resetU = e.target.getAttribute && e.target.getAttribute('data-reset-user');
    if(resetU){ openResetPasswordModal(resetU); return; }
    var delU = e.target.getAttribute && e.target.getAttribute('data-del-user');
    if(delU){ confirmDeleteUser(delU); return; }
  });
}

function confirmDeleteUser(username){
  var admins = users.filter(function(u){return u.role==='admin';});
  var target = users.find(function(u){return u.username===username;});
  if(target && target.role==='admin' && admins.length<=1){ toast('Não é possível remover o único administrador.'); return; }
  var html =
    '<h3>Remover usuário</h3>'+
    '<p style="color:var(--ink-soft);font-size:13.5px;">Remover <b>'+esc(username)+'</b>? Essa ação não pode ser desfeita.</p>'+
    '<div class="modal-actions">'+
      '<button type="button" class="btn btn-secondary" id="delCancel">Cancelar</button>'+
      '<button type="button" class="btn btn-danger" id="delConfirm">Remover</button>'+
    '</div>';
  openModal(html, function(root){
    root.querySelector('#delCancel').addEventListener('click', closeModal);
    root.querySelector('#delConfirm').addEventListener('click', function(){
      var idx = users.findIndex(function(u){return u.username===username;});
      if(idx>-1) users.splice(idx,1);
      persistStore();
      renderUsers();
      toast('Usuário removido.');
      closeModal();
    });
  });
}

/* ================= backup: export / import ================= */
async function exportBackup(){
  var payload = JSON.stringify(store, null, 2);
  var filename = 'estoque-pneus-backup-' + todayStr() + '.json';
  try{
    if(window.claude && typeof window.claude.use === 'function'){
      var downloads = await window.claude.use('downloads');
      if(downloads){
        await downloads.save({ filename: filename, data: payload });
        toast('Backup salvo.');
        return;
      }
    }
  }catch(err){
    if(err && err.code === 'declined'){ return; } // usuário cancelou o diálogo, não é erro
    console.warn('downloads capability indisponível, usando download direto do navegador', err);
  }
  var ok = downloadBytes(strToBytes(payload), filename, 'application/json');
  toast(ok ? 'Backup baixado.' : 'Não foi possível gerar o backup neste ambiente.');
}

function importBackupFile(file){
  var reader = new FileReader();
  reader.onload = function(){
    var parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(e){ toast('Arquivo inválido: não é um JSON de backup reconhecível.'); return; }
    if(!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.warehouses) || !Array.isArray(parsed.materials) || !Array.isArray(parsed.movements)){
      toast('Arquivo inválido: não parece um backup deste app.');
      return;
    }
    var html =
      '<h3>Importar backup</h3>'+
      '<p style="color:var(--ink-soft);font-size:13.5px;">Este arquivo tem <b>'+parsed.materials.length+'</b> material(is), '+
      '<b>'+parsed.movements.length+'</b> movimentação(ões), <b>'+parsed.warehouses.length+'</b> depósito(s) e '+
      '<b>'+parsed.users.length+'</b> usuário(s).<br><br>Importar vai <b>substituir todos os dados atuais</b> deste computador. Essa ação não pode ser desfeita.</p>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn btn-secondary" id="impCancel">Cancelar</button>'+
        '<button type="button" class="btn btn-danger" id="impConfirm">Substituir dados</button>'+
      '</div>';
    openModal(html, function(root){
      root.querySelector('#impCancel').addEventListener('click', closeModal);
      root.querySelector('#impConfirm').addEventListener('click', function(){
        store = migrateStore(parsed);
        materials = store.materials; movements = store.movements; warehouses = store.warehouses; users = store.users;
        persistStore();
        renderAll();
        toast('Backup importado com sucesso.');
        closeModal();
      });
    });
  };
  reader.onerror = function(){ toast('Não foi possível ler o arquivo.'); };
  reader.readAsText(file);
}

/* ================= auth ================= */
function showLoginError(msg){
  var el = qs('loginError');
  el.textContent = msg;
  el.hidden = false;
}
async function doLogin(e){
  e.preventDefault();
  qs('loginError').hidden = true;
  var uname = qs('loginUser').value.trim().toLowerCase();
  var pass = qs('loginPass').value;
  var btn = qs('loginBtn');
  btn.disabled = true; btn.textContent = 'Entrando…';
  var u = users.find(function(x){return x.username.toLowerCase()===uname;});
  var hash = await sha256(pass);
  if(!u || hash !== u.passwordHash){
    showLoginError('Usuário ou senha inválidos.');
    btn.disabled=false; btn.textContent='Entrar';
    return;
  }
  currentUser = { username: u.username, role: u.role };
  btn.disabled=false; btn.textContent='Entrar';
  enterApp();
}
function doLogout(){
  currentUser = null;
  qs('appScreen').hidden = true;
  qs('loginScreen').hidden = false;
  qs('loginPass').value = '';
}
function enterApp(){
  qs('loginScreen').hidden = true;
  qs('appScreen').hidden = false;
  qs('whoName').textContent = currentUser.username;
  qs('whoRole').textContent = currentUser.role;
  qs('whoAvatar').textContent = currentUser.username.slice(0,2).toUpperCase();
  qs('navUsersItem').hidden = currentUser.role !== 'admin';
  qs('navBackupItem').hidden = currentUser.role !== 'admin';
  renderAll();
  setPage('dashboard');
}

/* ================= init ================= */
function init(){
  wireStaticEvents();
  qs('loginForm').addEventListener('submit', doLogin);
  var btn = qs('loginBtn');
  loadOrSeedStore().then(function(){
    btn.disabled = false; btn.textContent = 'Entrar';
  }).catch(function(err){
    console.error('Erro ao carregar dados locais:', err);
    btn.disabled = false; btn.textContent = 'Entrar';
    showLoginError('Ocorreu um problema ao carregar os dados salvos neste navegador. Você ainda pode tentar entrar; se persistir, recarregue a página.');
  });
}
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }

})();
