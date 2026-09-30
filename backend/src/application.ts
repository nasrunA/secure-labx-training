import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {TrainingController} from './controllers/training.controller.js';
import {TrainingService} from './services/training.service.js';

export class SecureLabxApiApplication extends RestApplication {
  constructor() {
    super({rest: {
      port: Number(process.env.PORT ?? 3001),
      host: '0.0.0.0',
      bodyParser: {
        json: {limit: '10mb'},
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
    this.controller(TrainingController);
  }
}
