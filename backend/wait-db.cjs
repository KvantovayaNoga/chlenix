// CommonJS-обёртка (расширение .cjs обходит "type": "module" в package.json).
// ВАЖНО: выводим e.code тоже — внутренние ошибки модуля иначе маскируются.
(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    await p.$connect();
    await p.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error('  причина:', (e && e.code ? e.code + ': ' : '') + (e && e.message ? String(e.message).split('\n')[0] : e));
    process.exit(1);
  }
})();
