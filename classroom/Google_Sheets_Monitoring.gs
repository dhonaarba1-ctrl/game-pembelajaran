const LOG_SHEET = 'Aktivitas Classroom';
const DASHBOARD_SHEET = 'Dashboard Classroom';
const ALL_CLASSES = 'Semua kelas';
const ACTIVE_DAYS = 7;
const LOG_COLUMNS = [
  'ID', 'Diterima (UTC)', 'Aktivitas siswa (UTC)', 'Simulator', 'Nama', 'Kelas', 'Kode siswa',
  'Aktivitas', 'Level aktif', 'Misi aktif', 'Misi lulus', 'Total misi', 'Level lulus',
  'Nilai misi', 'Status misi', 'Misi dokumen', 'Nilai terbaik dokumen', 'Dokumen lulus',
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Classroom')
    .addItem('Siapkan pemantauan', 'initializeClassroomMonitoring')
    .addItem('Perbarui dashboard', 'refreshClassroomDashboard')
    .addToUi();
}

function initializeClassroomMonitoring() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Buka Apps Script dari spreadsheet guru.');
  PropertiesService.getScriptProperties().setProperty('CLASSROOM_SPREADSHEET', spreadsheet.getId());
  const log = findOrCreate_(spreadsheet, LOG_SHEET);
  log.getRange(1, 1, 1, LOG_COLUMNS.length).setValues([LOG_COLUMNS]).setFontWeight('bold');
  log.setFrozenRows(1);
  const dashboard = findOrCreate_(spreadsheet, DASHBOARD_SHEET);
  dashboard.getRange('A1:B1').setValues([['Kelas', ALL_CLASSES]]).setFontWeight('bold');
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'refreshClassroomDashboard')) {
    ScriptApp.newTrigger('refreshClassroomDashboard').timeBased().everyMinutes(5).create();
  }
  refreshClassroomDashboard();
}

function doGet() {
  return json_({ service: 'Classroom monitoring', protocol: 2 });
}

function doPost(request) {
  let events;
  try {
    const payload = String(request.parameter?.payload || '');
    if (!payload || payload.length > 64000) return json_({ ok: false, error: 'invalid_payload' });
    const data = JSON.parse(payload);
    events = Array.isArray(data.events) ? data.events : [data];
    if (!events.length || events.length > 35) return json_({ ok: false, error: 'invalid_batch' });
  } catch {
    return json_({ ok: false, error: 'invalid_payload' });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return json_({ ok: false, error: 'busy' });
  try {
    const log = openClassroomSpreadsheet_().getSheetByName(LOG_SHEET);
    if (!log) return json_({ ok: false, error: 'not_initialized' });
    const existing = new Set(log.getLastRow() > 1
      ? log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().flat().map(String)
      : []);
    const acceptedIds = [];
    const rows = [];
    const now = new Date();
    for (const event of events) {
      const row = normalizeEvent_(event, now);
      if (!row) continue;
      const id = row[0];
      if (!existing.has(id)) {
        rows.push(row);
        existing.add(id);
      }
      acceptedIds.push(id);
    }
    if (rows.length) {
      log.getRange(log.getLastRow() + 1, 1, rows.length, LOG_COLUMNS.length).setValues(rows);
      SpreadsheetApp.flush();
    }
    return json_({ ok: true, acceptedIds });
  } catch (error) {
    console.error('Classroom recording failed', error);
    return json_({ ok: false, error: 'write_failed' });
  } finally {
    lock.releaseLock();
  }
}

function normalizeEvent_(event, now) {
  if (!event || typeof event !== 'object' || !/^[a-zA-Z0-9_-]{6,120}$/.test(event.id || '')) return null;
  const app = { WordClassroom: 'Word', ExcelClassroom: 'Excel' }[event.app];
  if (app !== 'Word' && app !== 'Excel') return null;
  const name = cleanText_(event.name, 70);
  const klass = cleanText_(event.klass, 30).toUpperCase();
  const code = cleanText_(event.code, 25).toUpperCase();
  if (!name || !klass || !code) return null;
  const time = new Date(event.time);
  const stamp = Number.isFinite(+time) && +time <= +now + 300000 ? time.toISOString() : now.toISOString();
  return [
    event.id, now.toISOString(), stamp, app, sheetText_(name), sheetText_(klass), sheetText_(code),
    sheetText_(cleanText_(event.action, 40)), number_(event.activeLevel ?? event.level, 10),
    number_(event.mission, 99), number_(event.completed, 200), number_(event.total, 200),
    number_(event.passedLevels, 10), number_(event.score, 100),
    event.status === 'lulus' ? 'lulus' : 'proses', sheetText_(cleanText_(event.docMission, 40)),
    number_(event.docScore, 100), number_(event.docCompleted, 21),
  ];
}

function cleanText_(value, length) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, length);
}

function sheetText_(value) {
  // Keep identifiers such as 01 as text and prevent interpretation as formulas.
  return value ? "'" + value : '';
}

function number_(value, maximum) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(maximum, Math.round(n))) : 0;
}

function onEdit(event) {
  if (event.range.getSheet().getName() === DASHBOARD_SHEET && event.range.getA1Notation() === 'B1') {
    refreshDashboard_(event.source);
  }
}

function refreshClassroomDashboard() {
  refreshDashboard_(openClassroomSpreadsheet_());
}

function refreshDashboard_(spreadsheet) {
  const log = spreadsheet.getSheetByName(LOG_SHEET);
  if (!log) return;
  const dashboard = findOrCreate_(spreadsheet, DASHBOARD_SHEET);
  const data = log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, LOG_COLUMNS.length).getValues() : [];
  const classes = [...new Set(data.map(row => String(row[5])))].sort();
  const values = [ALL_CLASSES, ...classes];
  const filter = String(dashboard.getRange('B1').getValue());
  const selected = values.includes(filter) ? filter : ALL_CLASSES;
  dashboard.getRange('B1').setValue(sheetText_(selected)).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build()
  );
  const summary = summarize_(data, selected, new Date());
  const top = [
    ['Metrik', 'Jumlah'],
    ['Total siswa', summary.students.length],
    ['Aktif dalam ' + ACTIVE_DAYS + ' hari', summary.active],
    ['Lulus salah satu simulator', summary.graduated],
    ['Lulus Word', summary.wordPassed],
    ['Lulus Excel', summary.excelPassed],
    ['Menuntaskan 21 misi dokumen Word', summary.docsPassed],
  ];
  dashboard.getRange('A3:B9').setValues(top);
  const headers = ['Nama', 'Kelas', 'Kode siswa', 'Word lulus', 'Excel lulus', 'Misi Word', 'Misi Excel', 'Dokumen Word', 'Aktivitas terakhir (UTC)'];
  const list = summary.students.map(student => [
    sheetText_(student.name), sheetText_(student.klass), sheetText_(student.code),
    student.Word?.[12] === 10 ? 'Lulus' : 'Proses', student.Excel?.[12] === 10 ? 'Lulus' : 'Proses',
    String(student.Word?.[10] || 0) + ' / 80', String(student.Excel?.[10] || 0) + ' / 77',
    String(student.Word?.[17] || 0) + ' / 21', student.last[2],
  ]);
  const detailHeader = ['Aktivitas (UTC)', 'Simulator', 'Nama', 'Kelas', 'Kode siswa', 'Aksi', 'Level', 'Misi', 'Nilai', 'Status', 'Dokumen'];
  const historyRows = summary.history.slice(0, 100).map(row => [
    row[2], row[3], ...row.slice(4, 8).map(sheetText_), row[8], row[9], row[13], row[14], sheetText_(row[15]),
  ]);

  const detailStart = 14 + list.length;
  const requiredRows = detailStart + historyRows.length + 1;
  if (dashboard.getMaxRows() < requiredRows) {
    dashboard.insertRowsAfter(dashboard.getMaxRows(), requiredRows - dashboard.getMaxRows());
  }
  dashboard.getRange(11, 1, Math.max(1, dashboard.getLastRow() - 10), 11).clearContent().setFontWeight('normal').setBackground(null);
  dashboard.getRange(11, 1, 1 + list.length, headers.length).setValues([headers, ...list]);
  dashboard.getRange(detailStart, 1, 1 + historyRows.length, detailHeader.length).setValues([detailHeader, ...historyRows]);
  dashboard.getRange('A3:B3').setFontWeight('bold').setBackground('#dceaf5');
  for (const row of [11, detailStart]) dashboard.getRange(row, 1, 1, 11).setFontWeight('bold').setBackground('#dceaf5');
  dashboard.setFrozenRows(1);
}

function summarize_(data, selected, now) {
  const history = data.filter(row => selected === ALL_CLASSES || row[5] === selected)
    .sort((a, b) => String(b[2]).localeCompare(String(a[2])) || String(b[1]).localeCompare(String(a[1])));
  const byStudent = new Map();
  for (const row of history) {
    const id = JSON.stringify([row[5], row[6]]);
    if (!byStudent.has(id)) byStudent.set(id, { name: row[4], klass: row[5], code: row[6], last: row });
    const entry = byStudent.get(id);
    if (row[3] === 'Word' || row[3] === 'Excel') entry[row[3]] ??= row;
  }
  const students = [...byStudent.values()];
  return {
    students, history,
    active: students.filter(s => +new Date(s.last[2]) >= +now - ACTIVE_DAYS * 86400000).length,
    graduated: students.filter(s => s.Word?.[12] === 10 || s.Excel?.[12] === 10).length,
    wordPassed: students.filter(s => s.Word?.[12] === 10).length,
    excelPassed: students.filter(s => s.Excel?.[12] === 10).length,
    docsPassed: students.filter(s => s.Word?.[17] === 21).length,
  };
}

function findOrCreate_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function openClassroomSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('CLASSROOM_SPREADSHEET');
  if (!id) throw new Error('Jalankan initializeClassroomMonitoring terlebih dahulu.');
  return SpreadsheetApp.openById(id);
}

function json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
