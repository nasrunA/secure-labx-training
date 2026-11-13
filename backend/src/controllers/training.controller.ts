import {inject} from '@loopback/core';
import {del, get, param, patch, post, requestBody, RestBindings, HttpErrors} from '@loopback/rest';
import type {Request} from 'express';
import {AuthService} from '../services/auth.service.js';
import {CreateCompany, CreateParticipant, CreateSession, TrainingService} from '../services/training.service.js';

export class TrainingController {
  constructor(
    @inject('services.TrainingService') private training: TrainingService,
    @inject('services.AuthService') private auth: AuthService,
    @inject(RestBindings.Http.REQUEST) private request: Request,
  ) {}

  @get('/api/training-sessions')
  async listSessions(@param.query.string('search') search = '') { await this.requireUser(); return this.training.listSessions(search); }

  @get('/api/reporting')
  async reporting(@param.query.number('year') year = 2026) { await this.requireUser(); return this.training.reporting(year); }

  @get('/api/training-sessions/{id}/companies')
  async getCompanies(@param.path.string('id') id: string) { await this.requireUser(); return this.training.getCompanies(id); }

  @post('/api/training-sessions')
  async createSession(@requestBody() input: CreateSession) { await this.requireUser(); return this.training.createSession(input); }

  @patch('/api/training-sessions/{id}')
  async updateSession(@param.path.string('id') id: string, @requestBody() input: Partial<CreateSession>) { await this.requireUser(); return this.training.updateSession(id, input); }

  @post('/api/training-sessions/{id}/companies')
  async createCompany(@param.path.string('id') id: string, @requestBody() input: CreateCompany) { await this.requireUser(); return this.training.createCompany(id, input); }

  @patch('/api/training-companies/{id}')
  async updateCompany(@param.path.string('id') id: string, @requestBody() input: Partial<CreateCompany>) { await this.requireUser(); return this.training.updateCompany(id, input); }

  @del('/api/training-companies/{id}')
  async deleteCompany(@param.path.string('id') id: string) { await this.requireUser(); return this.training.deleteCompany(id); }

  @get('/api/training-companies/{id}/participants')
  async getParticipants(@param.path.string('id') id: string) { await this.requireUser(); return this.training.getParticipants(id); }

  @post('/api/training-companies/{id}/participants')
  async createParticipant(@param.path.string('id') id: string, @requestBody() input: CreateParticipant) { await this.requireUser(); return this.training.createParticipant(id, input); }

  @patch('/api/company-participants/{id}')
  async updateParticipant(@param.path.string('id') id: string, @requestBody() input: Partial<CreateParticipant>) { await this.requireUser(); return this.training.updateParticipant(id, input); }

  @del('/api/company-participants/{id}')
  async deleteParticipant(@param.path.string('id') id: string) { await this.requireUser(); return this.training.deleteParticipant(id); }

  private async requireUser() {
    const user = await this.auth.currentUser(this.request.headers.cookie || '');
    if (!user) throw new HttpErrors.Unauthorized('Sign in to continue.');
    return user;
  }
}
