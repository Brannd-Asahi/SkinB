/**
 * Servidor del Plan de piel (Google Apps Script).
 * Guarda el progreso de cada día en la hoja "registro" y le dice a la página
 * qué hora es de verdad (hora de Colombia), para que no se pueda marcar otro día.
 */
var TOKEN = 'tortuga17102026';

// Lunes 26 de octubre de 2026, 00:00 hora de Colombia (= 05:00 UTC)
var START_UTC = Date.UTC(2026, 9, 26, 5, 0, 0);
var DAY = 86400000;
var GRACE = 60 * 60000;      // el día se puede cerrar hasta la 1:00 a.m. del día siguiente
var NDAYS = 84;
var BACK_DAYS = 2;           // tolerancia para registros hechos sin internet y enviados después
var HEAD = ['dia', 'fecha', 'mascara', 'marcados', 'total', 'cerrado', 'actualizado'];

function nowMs_() { return Date.now(); }

function effDay_() {
  return Math.floor((nowMs_() - GRACE - START_UTC) / DAY);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('registro');
  if (!sh) {
    sh = ss.insertSheet('registro');
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(sh) {
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  var vals = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    out[String(r[0])] = { m: String(r[2] || 'm0').replace(/^m/, ''), c: Number(r[5]) ? 1 : 0, u: Number(r[6]) || 0 };
  }
  return out;
}

function findRow_(sh, day) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (Number(col[i][0]) === day) return i + 2;
  return -1;
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'time';

  if (action === 'time') {
    return json_({ ok: true, now: nowMs_(), eff: effDay_() });
  }
  if (p.token !== TOKEN) return json_({ ok: false, error: 'token' });

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = sheet_();

    if (action === 'state') {
      return json_({ ok: true, now: nowMs_(), eff: effDay_(), days: readAll_(sh) });
    }

    if (action === 'save') {
      var day = parseInt(p.day, 10);
      var mask = String(p.mask || '');
      var n = parseInt(p.n, 10) || 0;
      var t = parseInt(p.t, 10) || 0;
      var c = p.c === '1' ? 1 : 0;
      if (!(day >= 0 && day < NDAYS) || !/^[0-9a-z]{1,8}$/.test(mask)) {
        return json_({ ok: false, error: 'datos' });
      }
      var eff = effDay_();
      if (day > eff || day < eff - BACK_DAYS) {
        return json_({ ok: false, error: 'dia', eff: eff, now: nowMs_(), days: readAll_(sh) });
      }
      var row = findRow_(sh, day);
      var closedBefore = row > 0 && Number(sh.getRange(row, 6).getValue()) === 1;
      if (!closedBefore) {
        var fecha = Utilities.formatDate(new Date(START_UTC + day * DAY), 'America/Bogota', 'yyyy-MM-dd');
        // la máscara se guarda con una 'm' delante para que Sheets no la convierta en número
        var rowVals = [day, fecha, 'm' + mask, n, t, c, nowMs_()];
        if (row > 0) sh.getRange(row, 1, 1, HEAD.length).setValues([rowVals]);
        else sh.appendRow(rowVals);
      }
      return json_({ ok: true, locked: closedBefore, now: nowMs_(), eff: eff, days: readAll_(sh) });
    }

    return json_({ ok: false, error: 'accion' });
  } finally {
    lock.releaseLock();
  }
}
