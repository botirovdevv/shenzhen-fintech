// pnpm db:seed — resets the demo user (aziz@femate.uz / demo1234).
import { connect } from './client';
import { DEMO, resetDemo } from './demo';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const { db, close } = await connect(url);
await resetDemo(db);
await close();
console.log(`Demo user ready: ${DEMO.email} / ${DEMO.password}`);
