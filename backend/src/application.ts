import {RestApplication} from '@loopback/rest';
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
    this.bind('services.TrainingService').toClass(TrainingService);
    this.controller(TrainingController);
  }
}
