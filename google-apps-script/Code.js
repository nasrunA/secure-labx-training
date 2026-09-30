const WEBSITE_API = 'https://secure-labx.yummy-chair-2953.chatgpt.site/api';
const SYNC_MINUTES = 5;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Secure LabX Sync')
    .addItem('Refresh from website', 'syncFromWebsite')
    .addItem('Install / repair automatic sync', 'setupSync')
    .addToUi();
}

function setupSync() {
  const spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setSpreadsheetTimeZone('Asia/Kuala_Lumpur');

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === 'syncFromWebsite' || handler === 'syncEditedRow') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('syncFromWebsite')
    .timeBased()
    .everyMinutes(SYNC_MINUTES)
    .create();

  ScriptApp.newTrigger('syncEditedRow')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();

  syncFromWebsite();
  spreadsheet.toast('Automatic two-way sync is active.', 'Secure LabX', 5);
}

function syncFromWebsite() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(1000)) return;

  try {
    const data = fetchWebsiteData_();

    replaceRows_('Training', data.sessions.map(function (session) {
      return [
        session.id,
        session.referenceCode,
        session.name,
        dateValue_(session.startDate),
        dateValue_(session.endDate),
        session.location || '',
        number_(session.companyCount),
        number_(session.participantCount),
        number_(session.totalAmount)
      ];
    }), 9);

    replaceRows_('Companies', data.companies.map(function (company) {
      const profile = profile_(company);
      const participants = number_(company.participantCount);
      const gross = number_(company.total);
      const issued = profile.creditIssued !== '' && profile.creditIssued != null
        ? number_(profile.creditIssued)
        : participants * 1399;
      const used = number_(profile.creditUsed);

      return [
        company.id,
        company.sessionId,
        company.companyName,
        participants,
        number_(company.unitPrice),
        gross,
        titleCase_(company.grantStatus),
        gross * 0.96,
        issued,
        used,
        Math.max(issued - used, 0),
        titleCase_(company.rebateStatus),
        dateTimeValue_(company.lastRefresh)
      ];
    }), 13);

    replaceRows_('Participants', data.participants.map(function (participant) {
      return [
        participant.id,
        participant.companyId,
        participant.companyName,
        participant.fullName,
        participant.icNumber,
        titleCase_(participant.applicationStatus)
      ];
    }), 6);

    replaceRows_('Rebates', data.companies.map(function (company) {
      const profile = profile_(company);
      return [
        company.id,
        profile.rebateId || '',
        company.companyName,
        conditionLabel_(profile.companyColor),
        profile.rebatePlan || '',
        zonesToText_(profile.zones),
        profile.currentPlan || '',
        profile.currentSubscription || '',
        profile.renewedSubscription || '',
        dateValue_(profile.usageDate),
        numberOrBlank_(profile.creditUsed),
        profile.nextInvoice || '',
        profile.referenceDocument || '',
        profile.relatedDocs || '',
        profile.remarks || '',
        dateTimeValue_(company.lastRefresh)
      ];
    }), 16);

    const dashboard = SpreadsheetApp.getActive().getSheetByName('Dashboard');
    if (dashboard) {
      dashboard.getRange('A3').setValue(
        'Live website data · Last refreshed ' +
        Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm:ss')
      );
    }
  } finally {
    lock.releaseLock();
  }
}

function syncEditedRow(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  const sheetName = sheet.getName();
  if (['Training', 'Companies', 'Participants', 'Rebates'].indexOf(sheetName) === -1) return;
  if (event.range.getRow() < 2) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return;

  try {
    const firstRow = Math.max(event.range.getRow(), 2);
    const lastRow = event.range.getLastRow();
    for (let row = firstRow; row <= lastRow; row += 1) {
      pushRow_(sheet, row);
    }
    SpreadsheetApp.getActive().toast('Website updated.', 'Secure LabX', 3);
  } catch (error) {
    SpreadsheetApp.getActive().toast(error.message, 'Sync failed', 8);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function pushRow_(sheet, row) {
  const name = sheet.getName();
  const widths = {Training: 9, Companies: 13, Participants: 6, Rebates: 16};
  const values = sheet.getRange(row, 1, 1, widths[name]).getValues()[0];

  if (name === 'Training') pushTraining_(sheet, row, values);
  if (name === 'Companies') pushCompany_(sheet, row, values);
  if (name === 'Participants') pushParticipant_(sheet, row, values);
  if (name === 'Rebates') pushRebate_(values);
}

function pushTraining_(sheet, row, values) {
  let id = String(values[0] || '').trim();
  const body = {
    referenceCode: String(values[1] || '').trim(),
    name: String(values[2] || '').trim(),
    startDate: formatDate_(values[3]),
    endDate: formatDate_(values[4]),
    location: String(values[5] || '').trim()
  };

  if (!body.referenceCode && !body.name && !body.startDate && !body.endDate) return;

  if (!id) {
    const created = api_('/training-sessions', 'post', body);
    sheet.getRange(row, 1).setValue(created.id);
  } else {
    api_('/training-sessions/' + encodeURIComponent(id), 'patch', body);
  }
}

function pushCompany_(sheet, row, values) {
  let id = String(values[0] || '').trim();
  const sessionId = String(values[1] || '').trim();
  const companyName = String(values[2] || '').trim();
  if (!companyName && !id) return;

  if (!id) {
    if (!sessionId) throw new Error('A new company row needs a Session ID.');
    const created = api_(
      '/training-sessions/' + encodeURIComponent(sessionId) + '/companies',
      'post',
      {
        companyName: companyName,
        participantCount: wholeNumber_(values[3]),
        grantStatus: slug_(values[6]) || 'follow_up',
        rebateStatus: slug_(values[11]) || 'unused'
      }
    );
    id = created.id;
    sheet.getRange(row, 1).setValue(id);
  }

  const current = findCompany_(id);
  const currentProfile = profile_(current || {});
  api_('/training-companies/' + encodeURIComponent(id), 'patch', {
    companyName: companyName,
    participantCount: wholeNumber_(values[3]),
    grantStatus: slug_(values[6]) || 'follow_up',
    rebateStatus: slug_(values[11]) || 'unused',
    rebateProfile: Object.assign({}, currentProfile, {
      creditIssued: numberOrBlank_(values[8]),
      creditUsed: numberOrBlank_(values[9])
    })
  });
}

function pushParticipant_(sheet, row, values) {
  let id = String(values[0] || '').trim();
  const companyId = String(values[1] || '').trim();
  const fullName = String(values[3] || '').trim();
  const icNumber = String(values[4] || '').trim();
  const applicationStatus = slug_(values[5]) || 'pending_application';
  if (!fullName && !icNumber && !id) return;

  if (!id) {
    if (!companyId) throw new Error('A new participant row needs a Company Record ID.');
    const created = api_(
      '/training-companies/' + encodeURIComponent(companyId) + '/participants',
      'post',
      {fullName: fullName, icNumber: icNumber, applicationStatus: applicationStatus}
    );
    sheet.getRange(row, 1).setValue(created.id);
  } else {
    api_('/company-participants/' + encodeURIComponent(id), 'patch', {
      fullName: fullName,
      icNumber: icNumber,
      applicationStatus: applicationStatus
    });
  }
}

function pushRebate_(values) {
  const companyId = String(values[0] || '').trim();
  if (!companyId) return;

  const current = findCompany_(companyId);
  if (!current) throw new Error('The company record could not be found on the website.');

  const currentProfile = profile_(current);
  const updatedProfile = Object.assign({}, currentProfile, {
    rebateId: String(values[1] || '').trim(),
    companyColor: conditionValue_(values[3]),
    rebatePlan: String(values[4] || '').trim(),
    zones: textToZones_(values[5]),
    currentPlan: String(values[6] || '').trim(),
    currentSubscription: String(values[7] || '').trim(),
    renewedSubscription: String(values[8] || '').trim(),
    usageDate: formatDate_(values[9]),
    creditUsed: numberOrBlank_(values[10]),
    nextInvoice: String(values[11] || '').trim(),
    referenceDocument: String(values[12] || '').trim(),
    relatedDocs: String(values[13] || '').trim(),
    remarks: String(values[14] || '').trim()
  });

  api_('/training-companies/' + encodeURIComponent(companyId), 'patch', {
    rebateProfile: updatedProfile
  });
}

function fetchWebsiteData_() {
  const sessions = api_('/training-sessions');
  const companies = [];
  const participants = [];

  sessions.forEach(function (session) {
    const sessionCompanies = api_(
      '/training-sessions/' + encodeURIComponent(session.id) + '/companies'
    );
    sessionCompanies.forEach(function (company) {
      company.sessionId = session.id;
      company.sessionName = session.name;
      companies.push(company);

      const companyParticipants = api_(
        '/training-companies/' + encodeURIComponent(company.id) + '/participants'
      );
      companyParticipants.forEach(function (participant) {
        participant.companyId = company.id;
        participant.companyName = company.companyName;
        participants.push(participant);
      });
    });
  });

  return {sessions: sessions, companies: companies, participants: participants};
}

function findCompany_(companyId) {
  const sessions = api_('/training-sessions');
  for (let index = 0; index < sessions.length; index += 1) {
    const companies = api_(
      '/training-sessions/' + encodeURIComponent(sessions[index].id) + '/companies'
    );
    for (let companyIndex = 0; companyIndex < companies.length; companyIndex += 1) {
      if (String(companies[companyIndex].id) === String(companyId)) {
        return companies[companyIndex];
      }
    }
  }
  return null;
}

function api_(path, method, body) {
  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    headers: {'Accept': 'application/json'}
  };

  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(WEBSITE_API + path, options);
  const status = response.getResponseCode();
  const text = response.getContentText();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (ignored) {}

  if (status < 200 || status >= 300) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : 'Website returned error ' + status;
    throw new Error(message);
  }
  return data;
}

function replaceRows_(sheetName, rows, columnCount) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);

  if (rows.length + 1 > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  }

  const clearRows = Math.max(sheet.getLastRow() - 1, rows.length, 1);
  sheet.getRange(2, 1, clearRows, columnCount).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, columnCount).setValues(rows);
}

function profile_(company) {
  return Object.assign({
    rebateId: '',
    companyColor: 'white',
    zones: [],
    rebatePlan: 'Yearly Subscription',
    currentPlan: 'Yearly Subscription',
    currentSubscription: '',
    renewedSubscription: '',
    usageDate: '',
    creditUsed: '',
    creditIssued: '',
    nextInvoice: '',
    referenceDocument: '',
    referenceFiles: [],
    relatedDocs: '',
    relatedFiles: [],
    proofEmail: '',
    remarks: ''
  }, company && company.rebateProfile ? company.rebateProfile : {});
}

function zonesToText_(zones) {
  if (!Array.isArray(zones)) return '';
  return zones.map(function (zone) {
    if (typeof zone === 'string') return zone;
    const name = String(zone.name || '').trim();
    if (!name) return '';
    const label = zone.status === 'applied'
      ? 'Applied / invoice issued'
      : zone.status === 'attention' ? 'Need attention' : 'Normal';
    return name + ' (' + label + ')';
  }).filter(Boolean).join(', ');
}

function textToZones_(value) {
  return String(value || '').split(',').map(function (part) {
    const match = part.trim().match(/^(.*?)(?:\s*\(([^()]*)\))?$/);
    const name = match ? match[1].trim() : part.trim();
    const label = match && match[2] ? match[2].toLowerCase() : '';
    let status = 'normal';
    if (label.indexOf('applied') !== -1 || label.indexOf('invoice') !== -1) status = 'applied';
    if (label.indexOf('attention') !== -1) status = 'attention';
    return {name: name, status: status};
  }).filter(function (zone) { return zone.name; });
}

function conditionLabel_(value) {
  if (value === 'yellow') return 'Applied / invoice issued';
  if (value === 'red') return 'Need attention';
  return 'Normal';
}

function conditionValue_(value) {
  const text = String(value || '').toLowerCase();
  if (text.indexOf('applied') !== -1 || text.indexOf('invoice') !== -1) return 'yellow';
  if (text.indexOf('attention') !== -1) return 'red';
  return 'white';
}

function titleCase_(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, function (character) { return character.toUpperCase(); });
}

function slug_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function number_(value) {
  const parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  return isFinite(parsed) ? parsed : 0;
}

function wholeNumber_(value) {
  return Math.max(0, Math.round(number_(value)));
}

function numberOrBlank_(value) {
  if (value === '' || value == null) return '';
  return number_(value);
}

function dateValue_(value) {
  if (!value) return '';
  const date = new Date(String(value).slice(0, 10) + 'T12:00:00');
  return isNaN(date.getTime()) ? '' : date;
}

function dateTimeValue_(value) {
  if (!value) return '';
  const date = new Date(value);
  return isNaN(date.getTime()) ? '' : date;
}

function formatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3];
  const date = new Date(value);
  return isNaN(date.getTime())
    ? ''
    : Utilities.formatDate(date, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
}
