// pnpm db:migrate — applies src/db/migrations (the server also does this on start).
import { connect } from './client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { close } = await connect(url);
await close();
console.log('Migrations applied.');
