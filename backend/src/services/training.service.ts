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
    const [summary, monthly, usage, years] = await Promise.all([
      this.pool.query('SELECT * FROM dashboard_summaries WHERE reporting_year = $1', [year]),
      this.pool.query(`SELECT m.*, p.reporting_month AS month FROM monthly_training_performance m JOIN reporting_periods p ON p.id = m.reporting_period_id WHERE p.reporting_year = $1 ORDER BY p.reporting_month`, [year]),
      this.pool.query(`SELECT c.name, COALESCE(SUM(r.amount_used),0) AS amount, COALESCE(SUM(r.usage_count),0) AS count FROM credit_usage_categories c LEFT JOIN credit_usage_records r ON r.category_id = c.id AND r.reporting_period_id IN (SELECT id FROM reporting_periods WHERE reporting_year = $1) GROUP BY c.id ORDER BY c.display_order`, [year]),
      this.pool.query('SELECT reporting_year AS year FROM dashboard_summaries ORDER BY reporting_year DESC'),
    ]);
    return {summary:summary.rows[0] || null, monthly:monthly.rows, usage:usage.rows, years:years.rows.map(r => r.year)};
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
