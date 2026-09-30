import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {SpreadsheetFile, Workbook} from '@oai/artifact-tool'

const baseUrl = 'https://secure-labx.yummy-chair-2953.chatgpt.site/api'
const outputDir = fileURLToPath(new URL('../outputs/google-sheet-setup/', import.meta.url))
const outputPath = path.join(outputDir, 'secure-labx-reporting.xlsx')
const previewPath = path.join(outputDir, 'dashboard-preview.png')
const font = 'Arial'
const navy = '#25323B'
const teal = '#0B7A75'
const paleTeal = '#E8F3F1'
const line = '#DCE3E7'
const muted = '#6F7E89'
const currencyFormat = '"RM "#,##0.00;[Red]("RM "#,##0.00);-'

async function api(path) {
  const response = await fetch(`${baseUrl}${path}`)
  if (!response.ok) throw new Error(`Website API ${path} returned ${response.status}`)
  return response.json()
}

const sessions = await api('/training-sessions')
const companyGroups = await Promise.all(sessions.map(async session => ({
  session,
  companies: await api(`/training-sessions/${session.id}/companies`),
})))
const companies = companyGroups.flatMap(({session, companies}) => companies.map(company => ({...company, sessionId:session.id, sessionName:session.name})))
const participantGroups = await Promise.all(companies.map(async company => ({
  company,
  participants: await api(`/training-companies/${company.id}/participants`),
})))
const participants = participantGroups.flatMap(({company, participants}) => participants.map(participant => ({...participant, companyId:company.id, companyName:company.companyName})))
const reporting = await api('/reporting?year=2026')

const number = value => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const date = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null
const titleCase = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
const profile = company => ({
  rebateId:'', companyColor:'white', zones:[], rebatePlan:'Yearly Subscription', currentPlan:'Yearly Subscription',
  currentSubscription:'', renewedSubscription:'', usageDate:'', creditUsed:'', creditIssued:'', nextInvoice:'',
  referenceDocument:'', relatedDocs:'', remarks:'', ...(company.rebateProfile || {}),
})
const columnName = count => {
  let value = count, result = ''
  while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26) }
  return result
}

const workbook = Workbook.create()
const dashboard = workbook.worksheets.add('Dashboard')
const training = workbook.worksheets.add('Training')
const companySheet = workbook.worksheets.add('Companies')
const participantSheet = workbook.worksheets.add('Participants')
const rebateSheet = workbook.worksheets.add('Rebates')

function applyBase(sheet) {
  sheet.showGridLines = false
  sheet.getRange('A1:Z200').format.font = {name:font, size:10, color:'#32434F'}
}

function addTable(sheet, headers, rows, name) {
  const safeRows = rows.length ? rows : [headers.map(() => null)]
  const range = sheet.getRangeByIndexes(0, 0, safeRows.length + 1, headers.length)
  range.values = [headers, ...safeRows]
  const tableRange = `A1:${columnName(headers.length)}${safeRows.length + 1}`
  const table = sheet.tables.add(tableRange, true, name)
  table.style = 'TableStyleMedium2'
  sheet.getRange(`A1:${columnName(headers.length)}1`).format = {
    fill: navy,
    font: {name:font, size:10, bold:true, color:'#FFFFFF'},
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: true,
    borders: {preset:'outside', style:'thin', color:navy},
  }
  range.format.verticalAlignment = 'center'
  range.format.autofitColumns()
  range.format.autofitRows()
  sheet.freezePanes.freezeRows(1)
  return range
}

for (const sheet of [dashboard, training, companySheet, participantSheet, rebateSheet]) applyBase(sheet)
dashboard.tabColor = navy
training.tabColor = '#5C7C8A'
companySheet.tabColor = '#5C7C8A'
participantSheet.tabColor = '#5C7C8A'
rebateSheet.tabColor = '#5C7C8A'

dashboard.getRange('A2:H2').values = [['Secure LabX reporting dashboard', null, null, null, null, null, null, null]]
dashboard.getRange('A2:H2').format = {font:{name:font, size:16, bold:true, color:navy}, borders:{bottom:{style:'medium', color:teal}}}
dashboard.getRange('A3:H3').values = [[`Website database snapshot for 2026 · Prepared ${new Date().toLocaleString('en-MY')}`, null, null, null, null, null, null, null]]
dashboard.getRange('A3:H3').format.font = {name:font, size:10, italic:true, color:muted}

const metricLabels = [
  'Total training revenue', 'Total rebate credit', 'HRDC paid to SLX', 'Net training contribution',
  'Rebate credit used', 'Unutilised credit', 'Rebate utilisation', 'No. of trainings', 'Company records', 'Total participants',
]
dashboard.getRange('A5:A14').values = metricLabels.map(label => [label])
dashboard.getRange('B5:B14').formulas = [
  ['=SUM(Companies!H2:H1000)'],
  ['=SUM(Companies!I2:I1000)'],
  ['=SUMIF(Companies!G2:G1000,"Approved",Companies!H2:H1000)'],
  ['=B5-B6'],
  ['=SUM(Companies!J2:J1000)'],
  ['=SUM(Companies!K2:K1000)'],
  ['=IFERROR(B9/B6,0)'],
  ['=COUNTA(Training!A2:A1000)'],
  ['=COUNTA(Companies!A2:A1000)'],
  ['=SUM(Companies!D2:D1000)'],
]
dashboard.getRange('A5:B14').format = {fill:'#FFFFFF', borders:{insideHorizontal:{style:'thin', color:line}, bottom:{style:'thin', color:line}}}
dashboard.getRange('A5:A14').format.font = {name:font, size:10, color:muted}
dashboard.getRange('B5:B14').format.font = {name:font, size:11, bold:true, color:navy}
dashboard.getRange('B5:B10').format.numberFormat = currencyFormat
dashboard.getRange('B11').format.numberFormat = '0.0%'
dashboard.getRange('B12:B14').format.numberFormat = '#,##0'
dashboard.getRange('A5:B5').format.borders = {top:{style:'medium', color:teal}}

const monthlyHeaders = ['Month','Training revenue','Rebate issued','Net contribution','Credit used','Remaining credit','No. of trainings']
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthlyRows = reporting.monthly.map(row => [monthNames[row.month - 1], number(row.training_revenue), number(row.rebate_issued), number(row.net_contribution), number(row.credit_used), number(row.remaining_credit), number(row.number_of_trainings)])
dashboard.getRange('A17:G29').values = [monthlyHeaders, ...monthlyRows]
dashboard.getRange('A17:G17').format = {fill:navy, font:{name:font, size:10, bold:true, color:'#FFFFFF'}, horizontalAlignment:'center', verticalAlignment:'center', wrapText:true}
dashboard.getRange('A18:G29').format.borders = {insideHorizontal:{style:'thin', color:line}}
dashboard.getRange('B18:F29').format.numberFormat = currencyFormat
dashboard.getRange('G18:G29').format.numberFormat = '#,##0'
dashboard.getRange('A17:G29').format.autofitColumns()
dashboard.getRange('A17:G29').format.autofitRows()
dashboard.getRange('A17').format.columnWidth = 15
for (const col of ['B','C','D','E','F']) dashboard.getRange(`${col}:${col}`).format.columnWidth = 16
dashboard.getRange('G:G').format.columnWidth = 15
dashboard.getRange('A:A').format.columnWidth = 29
dashboard.getRange('B:B').format.columnWidth = 19

const chart = dashboard.charts.add('column', dashboard.getRange('A17:D29'))
chart.title = 'Monthly training performance'
chart.titleTextStyle.typeface = font
chart.hasLegend = true
chart.legend.position = 'bottom'
chart.xAxis = {axisType:'textAxis', textStyle:{typeface:font}}
chart.yAxis = {numberFormatCode:'"RM "#,##0', numberFormatSourceLinked:false, textStyle:{typeface:font}}
chart.setPosition('D4', 'L15')

const trainingRows = sessions.map(session => [session.id, session.referenceCode, session.name, date(session.startDate), date(session.endDate), session.location || '', number(session.companyCount), number(session.participantCount), number(session.totalAmount)])
addTable(training, ['Session ID','Reference Code','Training Name','Start Date','End Date','Location','Companies','Participants','Gross Claim (RM)'], trainingRows, 'TrainingTable')
training.getRange(`D2:E${Math.max(trainingRows.length + 1, 2)}`).format.numberFormat = 'dd-mmm-yyyy'
training.getRange(`G2:I${Math.max(trainingRows.length + 1, 2)}`).format.numberFormat = '#,##0'
training.getRange(`I2:I${Math.max(trainingRows.length + 1, 2)}`).format.numberFormat = currencyFormat
training.getRange('A:A').format.columnWidth = 34
training.getRange('B:B').format.columnWidth = 18
training.getRange('C:C').format.columnWidth = 34
training.getRange('F:F').format.columnWidth = 20

const companyRows = companies.map(company => {
  const rebate = profile(company)
  const participants = number(company.participantCount)
  const gross = number(company.total)
  const issued = rebate.creditIssued !== '' && rebate.creditIssued != null ? number(rebate.creditIssued) : participants * 1399
  const used = number(rebate.creditUsed)
  return [company.id, company.sessionId, company.companyName, participants, number(company.unitPrice), gross, titleCase(company.grantStatus), gross * .96, issued, used, Math.max(issued - used, 0), titleCase(company.rebateStatus), company.lastRefresh ? new Date(company.lastRefresh) : null]
})
addTable(companySheet, ['Record ID','Session ID','Client / Company','Participants','Unit Price (RM)','Gross Claim (RM)','Claim Status','Amount Received (RM)','Rebate Issued (RM)','Credit Used (RM)','Remaining Credit (RM)','Rebate Status','Updated At'], companyRows, 'CompaniesTable')
companySheet.getRange(`D2:D${Math.max(companyRows.length + 1, 2)}`).format.numberFormat = '#,##0'
companySheet.getRange(`E2:F${Math.max(companyRows.length + 1, 2)}`).format.numberFormat = currencyFormat
companySheet.getRange(`H2:K${Math.max(companyRows.length + 1, 2)}`).format.numberFormat = currencyFormat
companySheet.getRange(`M2:M${Math.max(companyRows.length + 1, 2)}`).format.numberFormat = 'dd-mmm-yyyy hh:mm'
companySheet.getRange('A:B').format.columnWidth = 34
companySheet.getRange('C:C').format.columnWidth = 32
companySheet.getRange('G:G').format.columnWidth = 17
companySheet.getRange('L:L').format.columnWidth = 17

const participantRows = participants.map(participant => [participant.id, participant.companyId, participant.companyName, participant.fullName, participant.icNumber, titleCase(participant.applicationStatus)])
addTable(participantSheet, ['Participant ID','Company Record ID','Client / Company','Participant Name','IC Number','Application Status'], participantRows, 'ParticipantsTable')
participantSheet.getRange('A:B').format.columnWidth = 34
participantSheet.getRange('C:D').format.columnWidth = 30
participantSheet.getRange('E:F').format.columnWidth = 20

const rebateRows = companies.map(company => {
  const rebate = profile(company)
  const zones = Array.isArray(rebate.zones) ? rebate.zones.map(zone => typeof zone === 'string' ? zone : `${zone.name || ''}${zone.status ? ` (${titleCase(zone.status)})` : ''}`).filter(Boolean).join(', ') : ''
  return [company.id, rebate.rebateId || '', company.companyName, titleCase(rebate.companyColor === 'yellow' ? 'applied' : rebate.companyColor === 'red' ? 'attention' : 'normal'), rebate.rebatePlan || '', zones, rebate.currentPlan || '', rebate.currentSubscription || '', rebate.renewedSubscription || '', date(rebate.usageDate), number(rebate.creditUsed), rebate.nextInvoice || '', rebate.referenceDocument || '', rebate.relatedDocs || '', rebate.remarks || '', company.lastRefresh ? new Date(company.lastRefresh) : null]
})
addTable(rebateSheet, ['Company Record ID','Rebate ID','Client / Company','Company Condition','Rebate Plan','Zones','Current Plan','Current Subscription','Renewed Subscription','Usage Date','Credit Used (RM)','Next Invoice','Reference Document','Related Documents','Remarks','Updated At'], rebateRows, 'RebatesTable')
rebateSheet.getRange(`J2:J${Math.max(rebateRows.length + 1, 2)}`).format.numberFormat = 'dd-mmm-yyyy'
rebateSheet.getRange(`K2:K${Math.max(rebateRows.length + 1, 2)}`).format.numberFormat = currencyFormat
rebateSheet.getRange(`P2:P${Math.max(rebateRows.length + 1, 2)}`).format.numberFormat = 'dd-mmm-yyyy hh:mm'
rebateSheet.getRange('A:A').format.columnWidth = 34
rebateSheet.getRange('B:B').format.columnWidth = 20
rebateSheet.getRange('C:C').format.columnWidth = 30
for (const col of ['E','F','G','H','I','L','M','N','O']) rebateSheet.getRange(`${col}:${col}`).format.columnWidth = 24

companySheet.getRange(`G2:G${Math.max(companyRows.length + 1, 2)}`).conditionalFormats.add('containsText', {text:'Rejected', format:{fill:'#F8D7DA', font:{color:'#A63D40', bold:true}}})
companySheet.getRange(`G2:G${Math.max(companyRows.length + 1, 2)}`).conditionalFormats.add('containsText', {text:'Approved', format:{fill:'#DFF1E4', font:{color:'#2E7646', bold:true}}})
rebateSheet.getRange(`D2:D${Math.max(rebateRows.length + 1, 2)}`).conditionalFormats.add('containsText', {text:'Attention', format:{fill:'#F8D7DA', font:{color:'#A63D40', bold:true}}})
rebateSheet.getRange(`D2:D${Math.max(rebateRows.length + 1, 2)}`).conditionalFormats.add('containsText', {text:'Applied', format:{fill:'#FFF0C7', font:{color:'#8A651B', bold:true}}})

dashboard.getRange('A5:B14').format.fill = paleTeal
dashboard.getRange('A5:B14').format.borders = {preset:'all', style:'thin', color:'#CFE3DF'}
dashboard.getRange('A2:L30').format.verticalAlignment = 'center'
dashboard.freezePanes.freezeRows(3)

workbook.recalculate()
await fs.mkdir(outputDir, {recursive:true})
const inspection = await workbook.inspect({kind:'table', range:'Dashboard!A1:G29', include:'values,formulas', tableMaxRows:30, tableMaxCols:8, maxChars:10000})
console.log(inspection.ndjson)
const errors = await workbook.inspect({kind:'match', searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!', options:{useRegex:true, maxResults:100}, summary:'final formula error scan'})
console.log(errors.ndjson)
const preview = await workbook.render({sheetName:'Dashboard', range:'A1:L30', scale:1, format:'png'})
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()))
const output = await SpreadsheetFile.exportXlsx(workbook)
await output.save(outputPath)
console.log(JSON.stringify({output:outputPath, preview:previewPath, sheets:5, sessions:sessions.length, companies:companies.length, participants:participants.length}))
