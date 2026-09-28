import 'dotenv/config';
import {SecureLabxApiApplication} from './application.js';

const app = new SecureLabxApiApplication();
await app.start();
console.log(`Secure LabX API running at ${app.restServer.url}`);
