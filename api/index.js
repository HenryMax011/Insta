// Entrada da Vercel: todas as rotas /api/* (e /health) são reescritas para esta função no vercel.json.
// Os arquivos de public/ são servidos direto pela CDN da Vercel.
import { createApp } from '../src/app.js';

export default createApp();
