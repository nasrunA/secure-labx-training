import {inject} from '@loopback/core';
import {del, get, param, patch, post, requestBody, RestBindings, HttpErrors} from '@loopback/rest';
import type {Request, Response} from 'express';
import {AuthService, AuthUser} from '../services/auth.service.js';

const sessionLifetimeSeconds = 14 * 24 * 60 * 60;
const cookie = (token: string, request: Request) =>
  `slx_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${request.secure ? '; Secure' : ''}`;

export class AuthController {
  constructor(
    @inject('services.AuthService') private auth: AuthService,
    @inject(RestBindings.Http.REQUEST) private request: Request,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
  ) {}

  @post('/api/auth/login')
  async login(@requestBody() input: {email?: unknown; password?: unknown; role?: unknown}) {
    const result = await this.auth.login(input.email, input.password, input.role);
    this.response.setHeader('Set-Cookie', cookie(result.token, this.request));
    return {user: result.user};
  }

  @get('/api/auth/me')
  async me() {
    const user = await this.auth.currentUser(this.request.headers.cookie || '');
    if (!user) throw new HttpErrors.Unauthorized('Sign in to continue.');
    return {user};
  }

  @post('/api/auth/logout')
  async logout() {
    await this.auth.logout(this.request.headers.cookie || '');
    this.response.setHeader(
      'Set-Cookie',
      `slx_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.request.secure ? '; Secure' : ''}`,
    );
    return {loggedOut: true};
  }

  @patch('/api/auth/profile')
  async updateProfile(@requestBody() input: {email?: unknown; currentPassword?: unknown; newPassword?: unknown}) {
    const user = await this.requireUser();
    return {user: await this.auth.updateProfile(user, input, this.request.headers.cookie || '')};
  }

  @get('/api/accounts')
  async listAccounts() {
    return this.auth.listAccounts(await this.requireUser());
  }

  @post('/api/accounts')
  async createAccount(@requestBody() input: {email?: unknown; role?: unknown; password?: unknown}) {
    return this.auth.createAccount(await this.requireUser(), input);
  }

  @patch('/api/accounts/{id}')
  async updateAccount(
    @param.path.string('id') id: string,
    @requestBody() input: {email?: unknown; role?: unknown; password?: unknown},
  ) {
    return this.auth.updateAccount(await this.requireUser(), id, input);
  }

  @del('/api/accounts/{id}')
  async deleteAccount(@param.path.string('id') id: string) {
    return this.auth.deleteAccount(await this.requireUser(), id);
  }

  private async requireUser(): Promise<AuthUser> {
    const user = await this.auth.currentUser(this.request.headers.cookie || '');
    if (!user) throw new HttpErrors.Unauthorized('Sign in to continue.');
    return user;
  }
}
