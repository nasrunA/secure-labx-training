import {injectable, BindingScope} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {Pool} from 'pg';
import {pbkdf2, randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const deriveBits = promisify(pbkdf2);
const passwordIterations = 150_000;
const sessionLifetimeSeconds = 14 * 24 * 60 * 60;
const accountRoles = new Set(['applicant', 'trainer', 'sales']);
const validEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 12 && value.length <= 256;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const hashPassword = async (password: string, salt: Buffer) =>
  (await deriveBits(password, salt, passwordIterations, 32, 'sha256')).toString('hex');

export type AccountRole = 'applicant' | 'trainer' | 'sales' | 'superadmin';
export interface AuthUser {id: string; email: string; role: AccountRole}
export interface ManagedAccount extends AuthUser {createdAt: Date}

@injectable({scope: BindingScope.SINGLETON})
export class AuthService {
  private readonly pool = new Pool({connectionString: process.env.DATABASE_URL});

  async login(emailInput: unknown, passwordInput: unknown, roleInput: unknown) {
    const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
    const role = roleInput;
    if (!validEmail(email) || !['applicant', 'trainer', 'sales', 'superadmin'].includes(String(role)) || typeof passwordInput !== 'string') {
      throw new HttpErrors.Unauthorized('Invalid email or password for the selected role.');
    }

    const {rows} = await this.pool.query(
      'SELECT id, email, role, password_salt, password_hash FROM users WHERE email = $1',
      [email],
    );
    const account = rows[0];
    const salt = account ? Buffer.from(account.password_salt, 'hex') : Buffer.alloc(16);
    const expected = account ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(32);
    const actual = Buffer.from(await hashPassword(passwordInput, salt), 'hex');
    const passwordMatches = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!account || account.role !== role || !passwordMatches) {
      throw new HttpErrors.Unauthorized('Invalid email or password for the selected role.');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000);
    await this.pool.query('DELETE FROM user_sessions WHERE expires_at <= now()');
    await this.pool.query(
      'INSERT INTO user_sessions(id, token_hash, user_id, expires_at) VALUES($1, $2, $3, $4)',
      [randomUUID(), hashToken(token), account.id, expiresAt],
    );
    return {
      token,
      user: {id: account.id, email: account.email, role: account.role as AccountRole},
    };
  }

  async currentUser(cookieHeader = ''): Promise<AuthUser | null> {
    const token = this.sessionToken(cookieHeader);
    if (!token) return null;
    const {rows} = await this.pool.query(
      `SELECT u.id, u.email, u.role FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  }

  async logout(cookieHeader = '') {
    const token = this.sessionToken(cookieHeader);
    if (token) await this.pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
  }

  async updateProfile(
    user: AuthUser,
    input: {email?: unknown; currentPassword?: unknown; newPassword?: unknown},
    cookieHeader: string,
  ): Promise<AuthUser> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const currentPassword = input.currentPassword;
    const newPassword = input.newPassword;
    if (!validEmail(email) || typeof currentPassword !== 'string' ||
        (newPassword !== undefined && newPassword !== '' && !validPassword(newPassword))) {
      throw new HttpErrors.UnprocessableEntity('Provide a valid email and current password. New passwords must contain at least 12 characters.');
    }

    const {rows: currentRows} = await this.pool.query(
      'SELECT password_salt, password_hash FROM users WHERE id = $1',
      [user.id],
    );
    const current = currentRows[0];
    if (!current) throw new HttpErrors.NotFound('Account was not found.');
    const actual = Buffer.from(await hashPassword(currentPassword, Buffer.from(current.password_salt, 'hex')), 'hex');
    const expected = Buffer.from(current.password_hash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new HttpErrors.Unauthorized('The current password is incorrect.');
    }

    let salt = current.password_salt;
    let passwordHash = current.password_hash;
    if (typeof newPassword === 'string' && newPassword) {
      const saltBytes = randomBytes(16);
      salt = saltBytes.toString('hex');
      passwordHash = await hashPassword(newPassword, saltBytes);
    }
    try {
      const {rows} = await this.pool.query(
        `UPDATE users SET email = $2, password_salt = $3, password_hash = $4, updated_at = now()
         WHERE id = $1 RETURNING id, email, role`,
        [user.id, email, salt, passwordHash],
      );
      if (newPassword) {
        const token = this.sessionToken(cookieHeader);
        await this.pool.query(
          'DELETE FROM user_sessions WHERE user_id = $1 AND token_hash <> $2',
          [user.id, hashToken(token)],
        );
      }
      return rows[0] as AuthUser;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new HttpErrors.Conflict('An account already uses that email address.');
      throw error;
    }
  }

  async listAccounts(user: AuthUser) {
    this.requireSuperadmin(user);
    const {rows} = await this.pool.query(
      `SELECT id, email, role, created_at AS "createdAt"
       FROM users WHERE role IN ('applicant', 'trainer', 'sales')
       ORDER BY role, email`,
    );
    return rows as ManagedAccount[];
  }

  async createAccount(user: AuthUser, input: {email?: unknown; role?: unknown; password?: unknown}) {
    this.requireSuperadmin(user);
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const role = input.role;
    if (!validEmail(email) || typeof role !== 'string' || !accountRoles.has(role) || !validPassword(input.password)) {
      throw new HttpErrors.UnprocessableEntity('Provide a valid email, account role and a password of at least 12 characters.');
    }
    const salt = randomBytes(16);
    const passwordHash = await hashPassword(input.password, salt);
    try {
      const {rows} = await this.pool.query(
        `INSERT INTO users(id, email, role, password_salt, password_hash)
         VALUES($1, $2, $3, $4, $5)
         RETURNING id, email, role, created_at AS "createdAt"`,
        [randomUUID(), email, role, salt.toString('hex'), passwordHash],
      );
      return rows[0] as ManagedAccount;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new HttpErrors.Conflict('An account already uses that email address.');
      throw error;
    }
  }

  async updateAccount(user: AuthUser, id: string, input: {email?: unknown; role?: unknown; password?: unknown}) {
    this.requireSuperadmin(user);
    const {rows: currentRows} = await this.pool.query(
      `SELECT id, email, role, password_salt, password_hash, created_at
       FROM users WHERE id = $1 AND role IN ('applicant', 'trainer', 'sales')`,
      [id],
    );
    const current = currentRows[0];
    if (!current) throw new HttpErrors.NotFound('Account was not found.');

    const email = input.email === undefined ? current.email : typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const role = input.role === undefined ? current.role : input.role;
    const password = input.password;
    if (!validEmail(email) || typeof role !== 'string' || !accountRoles.has(role) || (password !== undefined && password !== '' && !validPassword(password))) {
      throw new HttpErrors.UnprocessableEntity('Provide a valid email and account role. Passwords must contain at least 12 characters.');
    }

    let salt = current.password_salt;
    let passwordHash = current.password_hash;
    if (password) {
      const saltBytes = randomBytes(16);
      salt = saltBytes.toString('hex');
      passwordHash = await hashPassword(password, saltBytes);
    }
    try {
      const {rows} = await this.pool.query(
        `UPDATE users SET email = $2, role = $3, password_salt = $4, password_hash = $5, updated_at = now()
         WHERE id = $1 RETURNING id, email, role, created_at AS "createdAt"`,
        [id, email, role, salt, passwordHash],
      );
      if (password) await this.pool.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
      return rows[0] as ManagedAccount;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new HttpErrors.Conflict('An account already uses that email address.');
      throw error;
    }
  }

  async deleteAccount(user: AuthUser, id: string) {
    this.requireSuperadmin(user);
    const result = await this.pool.query(
      `DELETE FROM users WHERE id = $1 AND role IN ('applicant', 'trainer', 'sales')`,
      [id],
    );
    if (result.rowCount === 0) throw new HttpErrors.NotFound('Account was not found.');
    return {deleted: true};
  }

  private requireSuperadmin(user: AuthUser) {
    if (user.role !== 'superadmin') throw new HttpErrors.Forbidden('Superadmin access is required.');
  }

  private sessionToken(cookieHeader: string) {
    const sessionCookie = cookieHeader.split(';').map(part => part.trim()).find(part => part.startsWith('slx_session='));
    const token = sessionCookie?.slice('slx_session='.length) ?? '';
    return /^[a-f0-9]{64}$/.test(token) ? token : '';
  }

  private isUniqueViolation(error: unknown): error is {code: string} {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
}
