import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {TrainingController} from './controllers/training.controller.js';
import {AuthController} from './controllers/auth.controller.js';
import {AuthService} from './services/auth.service.js';
import {TrainingService} from './services/training.service.js';
import {CatalogueController} from './controllers/catalogue.controller.js';
import {CatalogueService} from './services/catalogue.service.js';

export class SecureLabxApiApplication extends RestApplication {
  constructor() {
    super({rest: {
      port: Number(process.env.PORT ?? 3001),
      host: '127.0.0.1',
      requestBodyParser: {
        // Catalogue uploads are base64 JSON, so allow room for the file's encoding overhead.
        json: {limit: '42mb'},
      },
      cors: {
        origin: 'http://localhost:3000',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        allowedHeaders: 'Content-Type, Authorization',
      },
    }});
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);
    this.bind('services.TrainingService').toClass(TrainingService);
    this.bind('services.CatalogueService').toClass(CatalogueService);
    this.bind('services.AuthService').toClass(AuthService);
    this.controller(TrainingController);
    this.controller(AuthController);
    this.controller(CatalogueController);
  }
}
