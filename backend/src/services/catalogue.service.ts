import {injectable, BindingScope} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';

export interface CatalogueFile {name?: unknown; type?: unknown; size?: unknown; data?: unknown}
export interface CatalogueInput {title?: unknown; description?: unknown; position?: unknown; file?: CatalogueFile}

@injectable({scope: BindingScope.SINGLETON})
export class CatalogueService {
  private readonly pool = new Pool({connectionString: process.env.DATABASE_URL});

  async list() {
    const {rows} = await this.pool.query(`SELECT id,title,description,file_name AS "fileName",file_type AS "fileType",file_size AS "fileSize",position FROM catalogue_products ORDER BY position,created_at DESC`);
    return rows.map(row => ({...row,url:`/api/catalogue/${row.id}/file`}));
  }

  async file(id: string) {
    const {rows} = await this.pool.query('SELECT file_data AS data,file_name AS name,file_type AS type FROM catalogue_products WHERE id=$1',[id]);
    if (!rows[0]) throw new HttpErrors.NotFound('Catalogue product was not found.');
    return rows[0] as {data: Buffer; name: string; type: string};
  }

  async create(input: CatalogueInput) {
    const title=this.title(input.title),description=this.description(input.description),position=this.position(input.position),file=this.decodeFile(input.file);
    const id=randomUUID();
    const {rows} = await this.pool.query(`INSERT INTO catalogue_products(id,title,description,file_data,file_name,file_type,file_size,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,title,description,file_name AS "fileName",file_type AS "fileType",file_size AS "fileSize",position`,[id,title,description,file.data,file.name,file.type,file.size,position]);
    return {...rows[0],url:`/api/catalogue/${id}/file`};
  }

  async update(id: string,input: CatalogueInput) {
    const {rows:existing}=await this.pool.query('SELECT id FROM catalogue_products WHERE id=$1',[id]);
    if(!existing[0])throw new HttpErrors.NotFound('Catalogue product was not found.');
    const title=this.title(input.title),description=this.description(input.description),position=this.position(input.position);
    if(input.file){const file=this.decodeFile(input.file);await this.pool.query(`UPDATE catalogue_products SET title=$2,description=$3,file_data=$4,file_name=$5,file_type=$6,file_size=$7,position=$8,updated_at=now() WHERE id=$1`,[id,title,description,file.data,file.name,file.type,file.size,position]);}
    else await this.pool.query('UPDATE catalogue_products SET title=$2,description=$3,position=$4,updated_at=now() WHERE id=$1',[id,title,description,position]);
    return {saved:true};
  }

  async delete(id: string) {
    const {rowCount}=await this.pool.query('DELETE FROM catalogue_products WHERE id=$1',[id]);
    if(!rowCount)throw new HttpErrors.NotFound('Catalogue product was not found.');
    return {deleted:true};
  }

  private title(value: unknown) {const title=typeof value==='string'?value.trim():'';if(!title||title.length>200)throw new HttpErrors.UnprocessableEntity('Enter a product title of 1 to 200 characters.');return title;}
  private description(value: unknown) {return typeof value==='string'?value.trim():'';}
  private position(value: unknown) {const n=Number(value??0);return Number.isInteger(n)&&n>=0?n:0;}
  private decodeFile(input?: CatalogueFile) {
    if(!input||typeof input.data!=='string')throw new HttpErrors.UnprocessableEntity('Upload a poster image or PDF document.');
    const match=/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.data);
    if(!match)throw new HttpErrors.UnprocessableEntity('Upload a supported image or PDF document.');
    const data=Buffer.from(match[2],'base64'),type=match[1];
    if(!data.length||data.length>30*1024*1024)throw new HttpErrors.PayloadTooLarge('Catalogue files must be 30 MB or smaller.');
    const name=typeof input.name==='string'?input.name.replace(/[\\/\r\n]/g,'_').slice(0,255):'product-advertisement';
    return {data,name:name||'product-advertisement',type,size:data.length};
  }
}
