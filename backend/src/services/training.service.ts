import {injectable, BindingScope} from '@loopback/core';
import {Pool} from 'pg';
import {HttpErrors} from '@loopback/rest';

export type GrantStatus = 'follow_up' | 'applied' | 'approved' | 'rejected';
export type RebateStatus = 'fully_used' | 'unused';
export interface CreateSession {referenceCode: string; name: string; startDate: string; endDate: string; location?: string}
export interface CreateCompany {companyName: string; participantCount: number; grantStatus?: GrantStatus; rebateStatus?: RebateStatus; rebateProfile?: Record<string, unknown>}
export type ApplicationStatus = 'registered' | 'pending_application';
export interface CreateParticipant {fullName: string; icNumber: string; applicationStatus?: ApplicationStatus}

@injectable({scope: BindingScope.SINGLETON})
export class TrainingService {
  private readonly pool = new Pool({connectionString: process.env.DATABASE_URL});
  private readonly unitPrice = 1799;

  async reporting(year: number) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new HttpErrors.UnprocessableEntity('Choose a valid reporting year.');
    const [records, participantRecords, availableYears] = await Promise.all([
      this.pool.query(`SELECT p.id AS "sessionId", to_char(p.start_date, 'YYYY-MM-DD') AS "startDate", c.id AS "companyId", c.participant_count AS "participantCount", c.gross_hrdc_claim AS "grossClaim", c.grant_status AS "grantStatus", c.rebate_profile AS "rebateProfile" FROM training_programs p LEFT JOIN training_companies c ON c.training_program_id = p.id WHERE EXTRACT(YEAR FROM p.start_date) = $1 ORDER BY p.start_date, c.created_at`, [year]),
      this.pool.query(`SELECT COUNT(cp.id)::int AS count FROM company_participants cp JOIN training_companies c ON c.id = cp.training_company_id JOIN training_programs p ON p.id = c.training_program_id WHERE EXTRACT(YEAR FROM p.start_date) = $1`, [year]),
      this.pool.query(`SELECT DISTINCT EXTRACT(YEAR FROM start_date)::int AS year FROM training_programs WHERE start_date IS NOT NULL ORDER BY year DESC`),
    ]);
    const numeric = (value: unknown) => {
      const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    const monthly = Array.from({length: 12}, (_, index) => ({month:index + 1, training_revenue:0, rebate_issued:0, credit_used:0, remaining_credit:0, number_of_trainings:0, net_contribution:0, sessions:new Set<string>()}));
    const sessions = new Set<string>();
    const usageByPlan = new Map<string, {name:string; amount:number; count:number}>();
    let trainingRevenue = 0, rebateIssued = 0, creditUsed = 0, hrdcPaid = 0, totalParticipants = 0, numberOfCompanies = 0;
    for (const row of records.rows) {
      sessions.add(row.sessionId);
      const calendarMonth = Number(String(row.startDate || '').slice(5, 7));
      const monthIndex = Number.isInteger(calendarMonth) && calendarMonth >= 1 && calendarMonth <= 12 ? calendarMonth - 1 : 0;
      const month = monthly[monthIndex];
      month.sessions.add(row.sessionId);
      if (!row.companyId) continue;
      const rebateProfile = row.rebateProfile || {};
      const participants = numeric(row.participantCount);
      const revenue = numeric(row.grossClaim) * 0.96;
      const issued = rebateProfile.creditIssued !== '' && rebateProfile.creditIssued != null ? numeric(rebateProfile.creditIssued) : participants * 1399;
      const used = numeric(rebateProfile.creditUsed);
      const remaining = Math.max(issued - used, 0);
      trainingRevenue += revenue; rebateIssued += issued; creditUsed += used; totalParticipants += participants; numberOfCompanies++;
      if (row.grantStatus === 'approved') hrdcPaid += revenue;
      month.training_revenue += revenue; month.rebate_issued += issued; month.credit_used += used; month.remaining_credit += remaining; month.net_contribution += revenue - issued;
      const plan = rebateProfile.rebatePlan || rebateProfile.currentPlan || 'Other';
      const usage = usageByPlan.get(plan) || {name:plan, amount:0, count:0};
      usage.amount += used; if (used > 0) usage.count++; usageByPlan.set(plan, usage);
    }
    const unutilised = Math.max(rebateIssued - creditUsed, 0);
    const summary = sessions.size ? {
      total_training_revenue:rounded(trainingRevenue), total_rebate_credit:rounded(rebateIssued), hrdc_paid_to_slx:rounded(hrdcPaid), net_training_contribution:rounded(trainingRevenue - rebateIssued), rebate_credit_used:rounded(creditUsed), unutilised_rebate_credit:rounded(unutilised), rebate_utilisation_percent:rebateIssued ? rounded(creditUsed / rebateIssued * 100) : 0, number_of_trainings:sessions.size, number_of_companies:numberOfCompanies, total_participants:totalParticipants, participant_records:numeric(participantRecords.rows[0]?.count),
    } : null;
    return {
      summary,
      monthly:monthly.map(month => ({month:month.month, training_revenue:rounded(month.training_revenue), rebate_issued:rounded(month.rebate_issued), credit_used:rounded(month.credit_used), remaining_credit:rounded(month.remaining_credit), number_of_trainings:month.sessions.size, net_contribution:rounded(month.net_contribution)})),
      usage:[...usageByPlan.values()].map(item => ({...item, amount:rounded(item.amount)})).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
      years:availableYears.rows.map(row => row.year),
    };
  }

  async listSessions(search = '') {
    const {rows} = await this.pool.query(`
      SELECT p.id, p.reference_code AS "referenceCode", p.name,
        to_char(p.start_date, 'YYYY-MM-DD') AS "startDate", to_char(p.end_date, 'YYYY-MM-DD') AS "endDate", p.location,
        COUNT(c.id)::int AS "companyCount", COALESCE(SUM(c.participant_count), 0)::int AS "participantCount",
        COALESCE(SUM(c.gross_hrdc_claim), 0)::numeric AS "totalAmount"
      FROM training_programs p LEFT JOIN training_companies c ON c.training_program_id = p.id
      WHERE p.name ILIKE $1 OR COALESCE(p.location, '') ILIKE $1
      GROUP BY p.id ORDER BY p.start_date ASC`, [`%${search}%`]);
    return rows;
  }

  async getCompanies(sessionId: string) {
    const {rows} = await this.pool.query(`SELECT id, company_name AS "companyName", participant_count AS "participantCount", unit_price AS "unitPrice", gross_hrdc_claim AS "total", grant_status AS "grantStatus", rebate_status AS "rebateStatus", rebate_profile AS "rebateProfile", updated_at AS "lastRefresh" FROM training_companies WHERE training_program_id = $1 ORDER BY created_at`, [sessionId]);
    return rows;
  }

  async createSession(input: CreateSession) {
    const {rows} = await this.pool.query(`INSERT INTO training_programs(reference_code, name, start_date, end_date, location, status) VALUES($1,$2,$3,$4,$5,'planned') RETURNING id, reference_code AS "referenceCode", name, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate", location`, [input.referenceCode, input.name, input.startDate, input.endDate, input.location ?? null]);
    return rows[0];
  }

  async updateSession(id: string, input: Partial<CreateSession>) {
    const {rows} = await this.pool.query(`UPDATE training_programs SET name = COALESCE($2, name), start_date = COALESCE($3, start_date), end_date = COALESCE($4, end_date), location = COALESCE($5, location) WHERE id = $1 RETURNING id, reference_code AS "referenceCode", name, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate", location`, [id, input.name ?? null, input.startDate ?? null, input.endDate ?? null, input.location ?? null]);
    return rows[0];
  }

  async createCompany(sessionId: string, input: CreateCompany) {
    const participants = Number(input.participantCount);
    if (!Number.isInteger(participants) || participants < 0) throw new Error('participantCount must be an integer of 0 or more');
    const total = participants * this.unitPrice;
    const {rows} = await this.pool.query(`INSERT INTO training_companies(training_program_id, company_name, participant_count, unit_price, gross_hrdc_claim, grant_status, rebate_status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, company_name AS "companyName", participant_count AS "participantCount", unit_price AS "unitPrice", gross_hrdc_claim AS total, grant_status AS "grantStatus", rebate_status AS "rebateStatus"`, [sessionId, input.companyName, participants, this.unitPrice, total, input.grantStatus ?? 'follow_up', input.rebateStatus ?? 'unused']);
    return rows[0];
  }

  async updateCompany(id: string, input: Partial<CreateCompany>) {
    const participants = input.participantCount === undefined ? null : Number(input.participantCount);
    if (participants !== null && (!Number.isInteger(participants) || participants < 0)) throw new Error('participantCount must be an integer of 0 or more');
    const {rows} = await this.pool.query(`UPDATE training_companies SET company_name = COALESCE($2, company_name), participant_count = COALESCE($3, participant_count), gross_hrdc_claim = CASE WHEN $3::int IS NULL THEN gross_hrdc_claim ELSE $3::int * unit_price END, grant_status = COALESCE($4, grant_status), rebate_status = COALESCE($5, rebate_status), rebate_profile = COALESCE($6::jsonb, rebate_profile), updated_at = now() WHERE id = $1 RETURNING id, company_name AS "companyName", participant_count AS "participantCount", unit_price AS "unitPrice", gross_hrdc_claim AS total, grant_status AS "grantStatus", rebate_status AS "rebateStatus", rebate_profile AS "rebateProfile"`, [id, input.companyName ?? null, participants, input.grantStatus ?? null, input.rebateStatus ?? null, input.rebateProfile === undefined ? null : JSON.stringify(input.rebateProfile)]);
    return rows[0];
  }

  async deleteCompany(id: string) {
    const result = await this.pool.query('DELETE FROM training_companies WHERE id = $1', [id]);
    return {deleted: result.rowCount === 1};
  }

  async getParticipants(companyId: string) {
    const {rows} = await this.pool.query(`SELECT id, full_name AS "fullName", ic_number AS "icNumber", application_status AS "applicationStatus" FROM company_participants WHERE training_company_id = $1 ORDER BY created_at`, [companyId]);
    return rows;
  }

  async createParticipant(companyId: string, input: CreateParticipant) {
    input = this.validateParticipant(input);
    try {
      const {rows} = await this.pool.query(`INSERT INTO company_participants(training_company_id, full_name, ic_number, application_status) VALUES($1,$2,$3,$4) RETURNING id, full_name AS "fullName", ic_number AS "icNumber", application_status AS "applicationStatus"`, [companyId, input.fullName, input.icNumber, input.applicationStatus ?? 'pending_application']);
      return rows[0];
    } catch (error: any) {
      if (error.code === '23505') throw new HttpErrors.Conflict('This IC number has already been added for this company.')
      throw error
    }
  }

  async updateParticipant(id: string, input: Partial<CreateParticipant>) {
    input = this.validateParticipant(input);
    try {
    const {rows} = await this.pool.query(`UPDATE company_participants SET full_name = COALESCE($2, full_name), ic_number = COALESCE($3, ic_number), application_status = COALESCE($4, application_status), updated_at = now() WHERE id = $1 RETURNING id, full_name AS "fullName", ic_number AS "icNumber", application_status AS "applicationStatus"`, [id, input.fullName ?? null, input.icNumber ?? null, input.applicationStatus ?? null]);
    if (!rows[0]) throw new HttpErrors.NotFound('Participant record was not found.');
    return rows[0];
    } catch (error: any) {
      if (error.code === '23505') throw new HttpErrors.Conflict('This IC number has already been added for this company.');
      throw error;
    }
  }

  private validateParticipant<T extends Partial<CreateParticipant>>(input: T): T {
    if (input.fullName !== undefined && (typeof input.fullName !== 'string' || !input.fullName.trim())) throw new HttpErrors.UnprocessableEntity('Enter the participant name.');
    if (input.icNumber !== undefined) {
      if (typeof input.icNumber !== 'string' || !/^[\d-]+$/.test(input.icNumber)) throw new HttpErrors.UnprocessableEntity('Enter a valid 12-digit IC number.');
      const digits = input.icNumber.replace(/-/g, '');
      if (!/^\d{12}$/.test(digits)) throw new HttpErrors.UnprocessableEntity('Enter all 12 digits of the IC number.');
      input.icNumber = `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8)}`;
    }
    if (input.applicationStatus !== undefined && !['registered', 'pending_application'].includes(input.applicationStatus)) throw new HttpErrors.UnprocessableEntity('Choose Registered or Pending application.');
    return input;
  }

  async deleteParticipant(id: string) {
    const result = await this.pool.query('DELETE FROM company_participants WHERE id = $1', [id]);
    return {deleted: result.rowCount === 1};
  }
}
