import {inject} from '@loopback/core';
import {del, get, param, patch, post, requestBody, response} from '@loopback/rest';
import {CreateCompany, CreateParticipant, CreateSession, TrainingService} from '../services/training.service.js';

export class TrainingController {
  constructor(@inject('services.TrainingService') private training: TrainingService) {}

  @get('/api/training-sessions')
  async listSessions(@param.query.string('search') search = '') { return this.training.listSessions(search); }

  @get('/api/reporting')
  async reporting(@param.query.number('year') year = 2026) { return this.training.reporting(year); }

  @get('/api/training-sessions/{id}/companies')
  async getCompanies(@param.path.string('id') id: string) { return this.training.getCompanies(id); }

  @post('/api/training-sessions')
  @response(200, {description: 'Training session created'})
  async createSession(@requestBody() input: CreateSession) { return this.training.createSession(input); }

  @patch('/api/training-sessions/{id}')
  async updateSession(@param.path.string('id') id: string, @requestBody() input: Partial<CreateSession>) { return this.training.updateSession(id, input); }

  @post('/api/training-sessions/{id}/companies')
  async createCompany(@param.path.string('id') id: string, @requestBody() input: CreateCompany) { return this.training.createCompany(id, input); }

  @patch('/api/training-companies/{id}')
  async updateCompany(@param.path.string('id') id: string, @requestBody() input: Partial<CreateCompany>) { return this.training.updateCompany(id, input); }

  @del('/api/training-companies/{id}')
  async deleteCompany(@param.path.string('id') id: string) { return this.training.deleteCompany(id); }

  @get('/api/training-companies/{id}/participants')
  async getParticipants(@param.path.string('id') id: string) { return this.training.getParticipants(id); }

  @post('/api/training-companies/{id}/participants')
  async createParticipant(@param.path.string('id') id: string, @requestBody() input: CreateParticipant) { return this.training.createParticipant(id, input); }

  @patch('/api/company-participants/{id}')
  async updateParticipant(@param.path.string('id') id: string, @requestBody() input: Partial<CreateParticipant>) { return this.training.updateParticipant(id, input); }

  @del('/api/company-participants/{id}')
  async deleteParticipant(@param.path.string('id') id: string) { return this.training.deleteParticipant(id); }
}
