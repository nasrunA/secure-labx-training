import {inject} from '@loopback/core';
import {del,get,param,patch,post,requestBody,RestBindings,HttpErrors} from '@loopback/rest';
import type {Request,Response} from 'express';
import {AuthService,AuthUser} from '../services/auth.service.js';
import {CatalogueInput,CatalogueService} from '../services/catalogue.service.js';

export class CatalogueController {
  constructor(
    @inject('services.CatalogueService') private catalogue: CatalogueService,
    @inject('services.AuthService') private auth: AuthService,
    @inject(RestBindings.Http.REQUEST) private request: Request,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
  ) {}

  @get('/api/catalogue')
  async list() { await this.requireUser(); return this.catalogue.list(); }

  @get('/api/catalogue/{id}/file')
  async file(@param.path.string('id') id:string) {
    await this.requireUser();const file=await this.catalogue.file(id);
    this.response.setHeader('Content-Type',file.type);
    this.response.setHeader('Content-Disposition',`inline; filename="${file.name.replace(/["\\\r\n]/g,'_')}"`);
    this.response.setHeader('Cache-Control','private, no-store');
    this.response.send(file.data);
    return this.response;
  }

  @post('/api/catalogue')
  async create(@requestBody() input:CatalogueInput) { await this.requireSuperadmin();return this.catalogue.create(input); }

  @patch('/api/catalogue/{id}')
  async update(@param.path.string('id') id:string,@requestBody() input:CatalogueInput) { await this.requireSuperadmin();return this.catalogue.update(id,input); }

  @del('/api/catalogue/{id}')
  async delete(@param.path.string('id') id:string) { await this.requireSuperadmin();return this.catalogue.delete(id); }

  private async requireUser():Promise<AuthUser> {
    const user=await this.auth.currentUser(this.request.headers.cookie||'');
    if(!user)throw new HttpErrors.Unauthorized('Sign in to continue.');
    return user;
  }
  private async requireSuperadmin() {
    const user=await this.requireUser();
    if(user.role!=='superadmin')throw new HttpErrors.Forbidden('Superadmin access is required.');
    return user;
  }
}
