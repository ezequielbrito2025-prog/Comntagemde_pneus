/**
 * CONTAGEM DE PNEUS — servidor (Google Apps Script)
 *
 * Guarda as contagens numa planilha do Google e envia o relatório
 * diário em Excel por e-mail, com alerta das diferenças.
 *
 * Instalação: ver INSTALACAO.md, passo 2.
 */

/* ═══════════ AJUSTE AQUI ═══════════ */
var EMAIL = "italo.amaro@consorciorecifeambiental.com.br"; // quem recebe o relatório
var COPIA = "";              // outro e-mail em cópia, ou deixe vazio
var HORA_ENVIO = 18;         // hora do envio automático (0 a 23)
var EMPRESA = "Consórcio Recife Ambiental";
/* ═══════════════════════════════════ */

var ABA_DIAS = "Contagens";
var ABA_ITENS = "Itens";

/* ──────────────── entrada da API ──────────────── */
function doPost(e) {
  var resposta;
  try {
    var p = JSON.parse(e.postData.contents);
    switch (p.acao) {
      case "ler":         resposta = { ok: true, dia: lerDia(p.data) }; break;
      case "datas":       resposta = { ok: true, datas: listarDatas() }; break;
      case "salvar":      salvarDia(p.dia); resposta = { ok: true }; break;
      case "apagar":      apagarDia(p.data); resposta = { ok: true }; break;
      case "itens":       resposta = { ok: true, itens: lerItens() }; break;
      case "salvarItens": salvarItens(p.itens); resposta = { ok: true }; break;
      case "enviar":      resposta = { ok: enviarRelatorio(p.data, p.email || EMAIL) }; break;
      default:            resposta = { ok: false, erro: "ação desconhecida" };
    }
  } catch (err) {
    resposta = { ok: false, erro: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, servico: "Contagem de Pneus", versao: 1 })
  ).setMimeType(ContentService.MimeType.JSON);
}

/* ──────────────── planilha ──────────────── */
function planilha() {
  var id = PropertiesService.getScriptProperties().getProperty("PLANILHA_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* recria abaixo */ }
  }
  var ss = SpreadsheetApp.create("Contagem de Pneus — base de dados");
  PropertiesService.getScriptProperties().setProperty("PLANILHA_ID", ss.getId());
  return ss;
}

function aba(nome) {
  var ss = planilha();
  var s = ss.getSheetByName(nome);
  if (!s) {
    s = ss.insertSheet(nome);
    s.appendRow(nome === ABA_DIAS ? ["Data", "JSON", "Atualizado em"] : ["JSON"]);
    s.setFrozenRows(1);
    var padrao = ss.getSheetByName("Página1") || ss.getSheetByName("Sheet1");
    if (padrao && ss.getSheets().length > 1) ss.deleteSheet(padrao);
  }
  return s;
}

function linhaDaData(iso) {
  var s = aba(ABA_DIAS);
  var col = s.getRange(2, 1, Math.max(1, s.getLastRow() - 1), 1).getDisplayValues();
  for (var i = 0; i < col.length; i++) if (col[i][0] === iso) return i + 2;
  return 0;
}

function lerDia(iso) {
  var l = linhaDaData(iso);
  if (!l) return null;
  try { return JSON.parse(aba(ABA_DIAS).getRange(l, 2).getValue()); } catch (e) { return null; }
}

function salvarDia(dia) {
  var s = aba(ABA_DIAS);
  var l = linhaDaData(dia.data);
  var valores = [dia.data, JSON.stringify(dia), new Date()];
  if (l) s.getRange(l, 1, 1, 3).setValues([valores]);
  else s.appendRow(valores);
}

function apagarDia(iso) {
  var l = linhaDaData(iso);
  if (l) aba(ABA_DIAS).deleteRow(l);
}

function listarDatas() {
  var s = aba(ABA_DIAS);
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 1).getDisplayValues()
    .map(function (r) { return r[0]; })
    .filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
    .sort().reverse();
}

function lerItens() {
  var s = aba(ABA_ITENS);
  if (s.getLastRow() < 2) return [];
  try { return JSON.parse(s.getRange(2, 1).getValue()) || []; } catch (e) { return []; }
}

function salvarItens(itens) {
  var s = aba(ABA_ITENS);
  s.getRange(2, 1).setValue(JSON.stringify(itens || []));
}

/* ──────────────── relatório ──────────────── */
function num(v) { return (v === "" || v == null) ? 0 : (Number(v) || 0); }
function fisico(l) { return num(l.contagem) + num(l.entrada) + num(l.me); }
function dif(l) { return fisico(l) - num(l.saldo); }
function conferido(l) { return l && l.saldo !== "" && l.contagem !== ""; }
function situacao(l) {
  if (!conferido(l)) return "PENDENTE";
  var d = dif(l);
  return d < 0 ? "FALTA" : (d > 0 ? "SOBRA" : "OK");
}
function brl(iso) { return iso ? iso.split("-").reverse().join("/") : ""; }

/** Monta as linhas do relatório de uma data. */
function montarLinhas(iso) {
  var dia = lerDia(iso);
  if (!dia || !dia.linhas) return [];
  var itens = lerItens();
  var porId = {};
  itens.forEach(function (i) { porId[i.id] = i; });

  var out = [];
  Object.keys(dia.linhas).forEach(function (id) {
    var l = dia.linhas[id];
    var it = porId[id] || { grupo: "?", medida: id, marca: "", cod: "" };
    out.push([
      brl(iso), it.grupo, it.medida, it.marca || "—", it.cod,
      num(l.saldo), num(l.contagem), num(l.entrada), num(l.me),
      fisico(l), dif(l), situacao(l), l.obs || "", l.por || ""
    ]);
  });
  out.sort(function (a, b) { return a[10] - b[10]; }); // diferença crescente
  return out;
}

var CABECALHO = ["Data", "Grupo", "Medida", "Marca", "Código", "Saldo do sistema",
  "Contagem", "Entrada", "ME", "Físico total", "Diferença", "Situação",
  "Observação", "Lançado por"];

/** Gera o .xlsx da data e devolve o blob. */
function gerarExcel(iso) {
  var linhas = montarLinhas(iso);
  if (!linhas.length) return null;

  var temp = SpreadsheetApp.create("contagem-pneus-" + iso);
  var id = temp.getId();

  try {
    var s1 = temp.getSheets()[0].setName("Contagem");
    s1.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO])
      .setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
    s1.getRange(2, 1, linhas.length, CABECALHO.length).setValues(linhas);
    s1.setFrozenRows(1);
    s1.autoResizeColumns(1, CABECALHO.length);
    // pinta as diferenças
    for (var i = 0; i < linhas.length; i++) {
      var sit = linhas[i][11];
      if (sit === "FALTA") s1.getRange(i + 2, 1, 1, CABECALHO.length).setBackground("#FDE2E2");
      else if (sit === "SOBRA") s1.getRange(i + 2, 1, 1, CABECALHO.length).setBackground("#FDF0DC");
    }

    var divs = linhas.filter(function (l) { return l[11] === "FALTA" || l[11] === "SOBRA"; });
    var s2 = temp.insertSheet("ALERTA - Diferenças");
    if (divs.length) {
      s2.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO])
        .setFontWeight("bold").setBackground("#9C2828").setFontColor("#FFFFFF");
      s2.getRange(2, 1, divs.length, CABECALHO.length).setValues(divs);
      s2.setFrozenRows(1);
      s2.autoResizeColumns(1, CABECALHO.length);
    } else {
      s2.getRange(1, 1).setValue("Nenhuma diferença nesta contagem.").setFontWeight("bold");
    }

    var acc = {}, tot = { s: 0, f: 0, d: 0, falta: 0, sobra: 0 };
    linhas.forEach(function (l) {
      var g = l[1];
      acc[g] = acc[g] || { s: 0, f: 0, d: 0, falta: 0, sobra: 0 };
      acc[g].s += l[5]; acc[g].f += l[9]; acc[g].d += l[10];
      if (l[11] === "FALTA") acc[g].falta++;
      if (l[11] === "SOBRA") acc[g].sobra++;
    });
    var res = [["Grupo", "Saldo do sistema", "Físico total", "Diferença",
      "Itens com falta", "Itens com sobra"]];
    Object.keys(acc).forEach(function (g) {
      res.push([g, acc[g].s, acc[g].f, acc[g].d, acc[g].falta, acc[g].sobra]);
      tot.s += acc[g].s; tot.f += acc[g].f; tot.d += acc[g].d;
      tot.falta += acc[g].falta; tot.sobra += acc[g].sobra;
    });
    res.push(["TOTAL GERAL", tot.s, tot.f, tot.d, tot.falta, tot.sobra]);
    var s3 = temp.insertSheet("Resumo");
    s3.getRange(1, 1, res.length, 6).setValues(res);
    s3.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#1F3864").setFontColor("#FFFFFF");
    s3.getRange(res.length, 1, 1, 6).setFontWeight("bold");
    s3.autoResizeColumns(1, 6);

    SpreadsheetApp.flush();

    var url = "https://docs.google.com/spreadsheets/d/" + id + "/export?format=xlsx";
    var blob = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }
    }).getBlob().setName("contagem-pneus-" + iso + ".xlsx");

    return { blob: blob, linhas: linhas, tot: tot, divs: divs };
  } finally {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
  }
}

/** Envia o relatório de uma data. Devolve true se saiu. */
function enviarRelatorio(iso, para) {
  var r = gerarExcel(iso);
  if (!r) return false;

  var alerta = r.divs.length > 0;
  var assunto = (alerta ? "[ALERTA] " : "") + "Contagem de pneus " + brl(iso) +
    (alerta ? " — " + r.divs.length + " diferença(s)" : " — sem diferenças");

  var linhasHtml = r.divs.map(function (l) {
    return "<tr><td>" + l[1] + "</td><td>" + l[2] + "</td><td>" + (l[3] || "") +
      "</td><td>" + l[4] + "</td><td align='right'>" + l[5] + "</td>" +
      "<td align='right'>" + l[9] + "</td><td align='right'><b>" + l[10] +
      "</b></td><td>" + l[11] + "</td></tr>";
  }).join("");

  var html =
    "<div style=\"font-family:Arial,sans-serif;color:#1A1A1A\">" +
    "<h2 style=\"color:#1F3864;margin:0 0 4px\">Contagem de pneus — " + brl(iso) + "</h2>" +
    "<p style=\"color:#666;margin:0 0 16px\">" + EMPRESA + "</p>" +
    "<p>Saldo do sistema: <b>" + r.tot.s + "</b> &nbsp;·&nbsp; " +
    "Físico contado: <b>" + r.tot.f + "</b> &nbsp;·&nbsp; " +
    "Diferença: <b style=\"color:" + (r.tot.d < 0 ? "#9C2828" : r.tot.d > 0 ? "#B45309" : "#1E7B34") +
    "\">" + (r.tot.d > 0 ? "+" : "") + r.tot.d + "</b></p>" +
    (alerta
      ? "<div style=\"background:#FDE2E2;border:1px solid #E0553F;border-radius:8px;padding:12px;margin:16px 0\">" +
        "<b style=\"color:#9C2828\">ALERTA: " + r.divs.length + " pneu(s) com diferença</b><br>" +
        r.tot.falta + " com falta &nbsp;·&nbsp; " + r.tot.sobra + " com sobra</div>" +
        "<table cellpadding=\"6\" cellspacing=\"0\" border=\"1\" " +
        "style=\"border-collapse:collapse;border-color:#DDD;font-size:13px\">" +
        "<tr style=\"background:#1F3864;color:#FFF\"><th>Grupo</th><th>Medida</th><th>Marca</th>" +
        "<th>Código</th><th>Sistema</th><th>Físico</th><th>Dif.</th><th>Situação</th></tr>" +
        linhasHtml + "</table>"
      : "<div style=\"background:#E6F4E8;border:1px solid #1E7B34;border-radius:8px;padding:12px;margin:16px 0\">" +
        "<b style=\"color:#1E7B34\">Contagem sem diferenças.</b></div>") +
    "<p style=\"color:#666;font-size:12px;margin-top:20px\">" +
    "Planilha completa em anexo, com as abas Contagem, ALERTA - Diferenças e Resumo.<br>" +
    "Mensagem gerada automaticamente pelo app de contagem de pneus.</p></div>";

  var opcoes = { htmlBody: html, attachments: [r.blob], name: "Contagem de Pneus" };
  if (COPIA) opcoes.cc = COPIA;
  MailApp.sendEmail(para || EMAIL, assunto, "", opcoes);
  return true;
}

/* ──────────────── envio automático ──────────────── */

/** Roda todo dia no horário configurado. */
function envioDiario() {
  var hoje = Utilities.formatDate(new Date(), "America/Recife", "yyyy-MM-dd");
  try {
    if (!enviarRelatorio(hoje, EMAIL)) {
      MailApp.sendEmail(EMAIL, "Contagem de pneus " + brl(hoje) + " — sem lançamentos",
        "Nenhum pneu foi lançado hoje até o horário do relatório.");
    }
  } catch (err) {
    MailApp.sendEmail(EMAIL, "Contagem de pneus — falha no envio automático",
      "Erro: " + err);
  }
}

/** Execute UMA vez para ligar o envio automático diário. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "envioDiario") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("envioDiario").timeBased()
    .atHour(HORA_ENVIO).nearMinute(0).everyDays(1)
    .inTimezone("America/Recife").create();

  var ss = planilha();
  aba(ABA_DIAS); aba(ABA_ITENS);
  Logger.log("Pronto. Relatório diário às " + HORA_ENVIO + "h para " + EMAIL);
  Logger.log("Planilha de dados: " + ss.getUrl());
}

/** Teste manual: envia o relatório de hoje agora. */
function testarEnvio() {
  var hoje = Utilities.formatDate(new Date(), "America/Recife", "yyyy-MM-dd");
  Logger.log(enviarRelatorio(hoje, EMAIL) ? "Enviado." : "Nada lançado hoje.");
}
