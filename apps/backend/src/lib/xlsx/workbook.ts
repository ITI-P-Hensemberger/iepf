// Purpose: Small .xlsx writer: sheets with styled cells, Excel tables (filters and banded
// rows), frozen headers and native charts. Only what the year report needs; no dependency.
import { zip } from './zip'

export type Style = 'default' | 'title' | 'subtitle' | 'note' | 'section' | 'label' | 'value' | 'valuePercent' | 'valueDecimal' | 'date' | 'datetime' | 'percent' | 'decimal' | 'wrap'
export type CellValue = string | number | Date | null | undefined
export interface Cell { value: CellValue, style?: Style }
export type CellInput = CellValue | Cell

export interface Column {
  header: string
  width?: number
  style?: Style
}

export interface Range {
  sheet: string
  col: number
  firstRow: number
  lastRow: number
}

export interface ChartSeries {
  name: string
  values: Range
}

export interface ChartSpec {
  type: 'column' | 'bar' | 'line'
  title: string
  categories: Range
  series: ChartSeries[]
  // Top-left cell (0-based column, 1-based row) and size in cells.
  at: { col: number, row: number }
  size?: { cols: number, rows: number }
  percent?: boolean
}

// Validated categorical palette (colour-blind separation checked), in fixed order.
export const SERIES_COLORS = ['2A78D6', 'EB6834', '1BAF7A', 'EDA100'] as const

const STYLE_INDEX: Record<Style, number> = {
  default: 0,
  title: 1,
  subtitle: 2,
  note: 3,
  section: 4,
  label: 5,
  value: 6,
  date: 7,
  datetime: 8,
  percent: 9,
  decimal: 10,
  wrap: 11,
  valuePercent: 12,
  valueDecimal: 13
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="166" formatCode="0.0"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><b/><sz val="18"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><sz val="11"/><color rgb="FF4B5563"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><b/><sz val="13"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
<font><b/><sz val="12"/><color rgb="FF111827"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="9" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="166" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// Characters XML 1.0 does not allow, e.g. control characters pasted into a comment.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\v\f\u000E-\u001F￾￿]/g

export function escapeXml(value: string) {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function columnName(index: number) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

const romeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

// Excel stores dates as days since 1899-12-30 in wall-clock time: here, the school's.
export function excelSerial(date: Date) {
  const parts = Object.fromEntries(romeParts.formatToParts(date).map(part => [part.type, part.value]))
  const wallClock = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return wallClock / 86_400_000 + 25_569
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, '\'\'')}'`
}

export function rangeRef(range: Range) {
  const col = columnName(range.col)
  return `${quoteSheet(range.sheet)}!$${col}$${range.firstRow}:$${col}$${range.lastRow}`
}

function toCell(input: CellInput): Cell {
  if (input instanceof Date || input === null || input === undefined || typeof input !== 'object') {
    return { value: input as CellValue }
  }
  return input
}

function cellXml(ref: string, cell: Cell) {
  const { value } = cell
  const style = cell.style ?? (value instanceof Date
    ? 'datetime'
    : 'default')
  const s = STYLE_INDEX[style]
    ? ` s="${STYLE_INDEX[style]}"`
    : ''
  if (value === null || value === undefined || value === '') {
    return s
      ? `<c r="${ref}"${s}/>`
      : ''
  }
  if (value instanceof Date) {
    return `<c r="${ref}"${s}><v>${excelSerial(value)}</v></c>`
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? `<c r="${ref}"${s}><v>${value}</v></c>`
      : ''
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

interface TableDef {
  id: number
  name: string
  ref: string
  columns: string[]
}

export interface TableRef {
  headerRow: number
  firstRow: number
  lastRow: number
  column: (index: number) => Range
}

export class Sheet {
  readonly rows = new Map<number, Map<number, Cell>>()
  readonly heights = new Map<number, number>()
  readonly charts: ChartSpec[] = []
  readonly tables: TableDef[] = []
  widths: number[] = []
  frozenRows = 0
  gridlines = true
  nextRow = 1

  constructor(readonly workbook: Workbook, readonly name: string) {}

  set(row: number, col: number, input: CellInput) {
    const cells = this.rows.get(row) ?? new Map<number, Cell>()
    cells.set(col, toCell(input))
    this.rows.set(row, cells)
  }

  get(row: number, col: number) {
    return this.rows.get(row)?.get(col)?.value
  }

  addRow(cells: CellInput[], height?: number) {
    const row = this.nextRow
    cells.forEach((cell, col) => this.set(row, col, cell))
    if (height)
      this.heights.set(row, height)
    this.nextRow += 1
    return row
  }

  skip(rows = 1) {
    this.nextRow += rows
  }

  // A heading, a one-line explanation and a blank row: the top of every sheet.
  addHeading(title: string, subtitle?: string) {
    this.addRow([
      { value: title, style: 'title' }
    ], 28)
    if (subtitle) {
      this.addRow([
        { value: subtitle, style: 'subtitle' }
      ])
    }
    this.skip()
  }

  // An Excel table: header with filters, banded rows; widths follow the content.
  addTable(name: string, columns: Column[], rows: CellValue[][]): TableRef {
    const headerRow = this.nextRow
    this.addRow(columns.map(column => column.header))
    for (const values of rows) {
      this.addRow(values.map((value, col) => ({ value, style: columns[col]?.style })))
    }
    // An empty table still needs one data row to be valid.
    const lastRow = rows.length > 0
      ? this.nextRow - 1
      : this.addRow([])
    const id = this.workbook.nextTableId()
    this.tables.push({
      id,
      name: `${name.replace(/\W/g, '')}${id}`,
      ref: `A${headerRow}:${columnName(columns.length - 1)}${lastRow}`,
      columns: columns.map(column => column.header)
    })
    columns.forEach((column, col) => {
      const longest = Math.max(column.header.length, ...rows.slice(0, 500).map(values => displayLength(values[col])))
      this.widths[col] = Math.max(this.widths[col] ?? 0, column.width ?? Math.min(48, Math.max(10, longest + 2)))
    })
    return {
      headerRow,
      firstRow: headerRow + 1,
      lastRow,
      column: index => ({
        sheet: this.name,
        col: index,
        firstRow: headerRow + 1,
        lastRow
      })
    }
  }

  addChart(spec: ChartSpec) {
    this.charts.push(spec)
  }

  freezeAbove(row: number) {
    this.frozenRows = row - 1
  }

  toXml(drawingRelId: string | null, tableRelIds: string[]) {
    const view = [
      `<sheetView workbookViewId="0"${this.gridlines ? '' : ' showGridLines="0"'}${this.workbook.sheets[0] === this
        ? ' tabSelected="1"'
        : ''}>`,
      this.frozenRows > 0
        ? `<pane ySplit="${this.frozenRows}" topLeftCell="A${this.frozenRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.frozenRows + 1}" sqref="A${this.frozenRows + 1}"/>`
        : '',
      '</sheetView>'
    ].join('')
    const cols = this.widths.length > 0
      ? `<cols>${this.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width ?? 10}" customWidth="1"/>`).join('')}</cols>`
      : ''
    const data = [
      ...this.rows.keys()
    ].sort((a, b) => a - b).map((row) => {
      const cells = [
        ...this.rows.get(row)!.entries()
      ].sort(([a], [b]) => a - b).map(([col, cell]) => cellXml(`${columnName(col)}${row}`, cell)).join('')
      const height = this.heights.get(row)
      return `<row r="${row}"${height
        ? ` ht="${height}" customHeight="1"`
        : ''}>${cells}</row>`
    }).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${drawingRelId
  ? `<drawing r:id="${drawingRelId}"/>`
  : ''}${tableRelIds.length > 0
  ? `<tableParts count="${tableRelIds.length}">${tableRelIds.map(id => `<tablePart r:id="${id}"/>`).join('')}</tableParts>`
  : ''}</worksheet>`
  }
}

function displayLength(value: CellValue) {
  if (value === null || value === undefined)
    return 0
  if (value instanceof Date)
    return 16
  return String(value).length
}

function seriesCache(sheet: Sheet, range: Range, numeric: boolean) {
  const points: string[] = []
  for (let row = range.firstRow; row <= range.lastRow; row += 1) {
    const value = sheet.get(row, range.col)
    if (value === null || value === undefined || value === '')
      continue
    const text = value instanceof Date
      ? String(excelSerial(value))
      : String(value)
    points.push(`<c:pt idx="${row - range.firstRow}"><c:v>${escapeXml(text)}</c:v></c:pt>`)
  }
  const count = range.lastRow - range.firstRow + 1
  return numeric
    ? `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${count}"/>${points.join('')}</c:numCache>`
    : `<c:strCache><c:ptCount val="${count}"/>${points.join('')}</c:strCache>`
}

const TEXT_GREY = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="4B5563"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="it-IT"/></a:p></c:txPr>'

function chartXml(workbook: Workbook, spec: ChartSpec) {
  const sheetOf = (range: Range) => workbook.sheet(range.sheet)
  const isBar = spec.type !== 'line'
  const series = spec.series.map((item, idx) => {
    const color = SERIES_COLORS[idx % SERIES_COLORS.length]
    const fill = isBar
      ? `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`
      : `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>`
    return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/><c:tx><c:v>${escapeXml(item.name)}</c:v></c:tx>${fill}`
      + `<c:cat><c:strRef><c:f>${escapeXml(rangeRef(spec.categories))}</c:f>${seriesCache(sheetOf(spec.categories), spec.categories, false)}</c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>${escapeXml(rangeRef(item.values))}</c:f>${seriesCache(sheetOf(item.values), item.values, true)}</c:numRef></c:val>`
      + `${isBar ? '' : '<c:smooth val="0"/>'}</c:ser>`
  }).join('')

  const plot = isBar
    ? `<c:barChart><c:barDir val="${spec.type === 'bar'
      ? 'bar'
      : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="60"/><c:overlap val="-8"/><c:axId val="1001"/><c:axId val="1002"/></c:barChart>`
    : `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="1001"/><c:axId val="1002"/></c:lineChart>`
  // Horizontal bars read top to bottom in the table's order.
  const catPos = spec.type === 'bar'
    ? 'l'
    : 'b'
  const valPos = spec.type === 'bar'
    ? 'b'
    : 'l'
  const catOrientation = spec.type === 'bar'
    ? 'maxMin'
    : 'minMax'
  const valFormat = spec.percent ? '0%' : 'General'

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="it-IT" sz="1200" b="1"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill></a:rPr><a:t>${escapeXml(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}`
+ `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="${catOrientation}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D1D5DB"/></a:solidFill></a:ln></c:spPr>${TEXT_GREY}<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
+ `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/>${spec.percent ? '<c:max val="1"/>' : ''}<c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${valFormat}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${TEXT_GREY}<c:crossAx val="1001"/><c:crosses val="${spec.type === 'bar'
  ? 'max'
  : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  + `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${spec.series.length > 1
    ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${TEXT_GREY}</c:legend>`
    : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`
}

function drawingXml(charts: Array<{ spec: ChartSpec, relId: string }>) {
  const anchors = charts.map(({ spec, relId }, i) => {
    const size = spec.size ?? { cols: 8, rows: 16 }
    const from = `<xdr:from><xdr:col>${spec.at.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.at.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    const to = `<xdr:to><xdr:col>${spec.at.col + size.cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${spec.at.row - 1 + size.rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    return `<xdr:twoCellAnchor editAs="oneCell">${from}${to}<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${escapeXml(spec.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${relId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`
}

function rels(items: Array<{ id: string, type: string, target: string }>) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(item => `<Relationship Id="${item.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${item.type}" Target="${item.target}"/>`).join('')}</Relationships>`
}

const INVALID_SHEET_NAME = /[[\]:*?/\\]/g

export class Workbook {
  readonly sheets: Sheet[] = []
  private tableCount = 0

  constructor(readonly properties: { title: string, creator: string, created: Date }) {}

  addSheet(name: string) {
    const clean = name.replace(INVALID_SHEET_NAME, ' ').slice(0, 31)
    const sheet = new Sheet(this, clean)
    this.sheets.push(sheet)
    return sheet
  }

  sheet(name: string) {
    const found = this.sheets.find(sheet => sheet.name === name)
    if (!found)
      throw new Error(`Unknown sheet ${name}`)
    return found
  }

  nextTableId() {
    this.tableCount += 1
    return this.tableCount
  }

  toBuffer() {
    const files: Array<{ name: string, data: string }> = []
    const overrides: Array<{ part: string, type: string }> = []
    let chartCount = 0
    let drawingCount = 0

    this.sheets.forEach((sheet, index) => {
      const sheetRels: Array<{ id: string, type: string, target: string }> = []
      let drawingRelId: string | null = null
      if (sheet.charts.length > 0) {
        drawingCount += 1
        drawingRelId = `rId${sheetRels.length + 1}`
        sheetRels.push({ id: drawingRelId, type: 'drawing', target: `../drawings/drawing${drawingCount}.xml` })
        const drawingRels = sheet.charts.map((spec, i) => {
          chartCount += 1
          files.push({
            name: `xl/charts/chart${chartCount}.xml`,
            data: chartXml(this, spec)
          })
          overrides.push({ part: `/xl/charts/chart${chartCount}.xml`, type: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml' })
          return { spec, relId: `rId${i + 1}`, target: `../charts/chart${chartCount}.xml` }
        })
        files.push({
          name: `xl/drawings/drawing${drawingCount}.xml`,
          data: drawingXml(drawingRels)
        })
        files.push({
          name: `xl/drawings/_rels/drawing${drawingCount}.xml.rels`,
          data: rels(drawingRels.map(item => ({ id: item.relId, type: 'chart', target: item.target })))
        })
        overrides.push({ part: `/xl/drawings/drawing${drawingCount}.xml`, type: 'application/vnd.openxmlformats-officedocument.drawing+xml' })
      }
      const tableRelIds = sheet.tables.map((table) => {
        const id = `rId${sheetRels.length + 1}`
        sheetRels.push({ id, type: 'table', target: `../tables/table${table.id}.xml` })
        const columns = table.columns.map((name, i) => `<tableColumn id="${i + 1}" name="${escapeXml(name)}"/>`).join('')
        files.push({
          name: `xl/tables/table${table.id}.xml`,
          data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${table.id}" name="${table.name}" displayName="${table.name}" ref="${table.ref}" totalsRowShown="0"><autoFilter ref="${table.ref}"/><tableColumns count="${table.columns.length}">${columns}</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`
        })
        overrides.push({ part: `/xl/tables/table${table.id}.xml`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml' })
        return id
      })
      files.push({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        data: sheet.toXml(drawingRelId, tableRelIds)
      })
      overrides.push({ part: `/xl/worksheets/sheet${index + 1}.xml`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' })
      if (sheetRels.length > 0) {
        files.push({
          name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
          data: rels(sheetRels)
        })
      }
    })

    const created = this.properties.created.toISOString().replace(/\.\d{3}Z$/, 'Z')
    files.unshift(
      {
        name: '[Content_Types].xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides.map(item => `<Override PartName="${item.part}" ContentType="${item.type}"/>`).join('')}</Types>`
      },
      {
        name: '_rels/.rels',
        data: rels([
          { id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' },
          { id: 'rId2', type: 'extended-properties', target: 'docProps/app.xml' }
        ]).replace('</Relationships>', '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
      },
      {
        name: 'docProps/core.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(this.properties.title)}</dc:title><dc:creator>${escapeXml(this.properties.creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`
      },
      {
        name: 'docProps/app.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>IEPF</Application></Properties>`
      },
      {
        name: 'xl/workbook.xml',
        data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${this.sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029"/></workbook>`
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: rels([
          ...this.sheets.map((_, i) => ({ id: `rId${i + 1}`, type: 'worksheet', target: `worksheets/sheet${i + 1}.xml` })),
          { id: `rId${this.sheets.length + 1}`, type: 'styles', target: 'styles.xml' }
        ])
      },
      { name: 'xl/styles.xml', data: STYLES_XML }
    )
    return zip(files)
  }
}
