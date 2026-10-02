const format = (level, msg, meta) => JSON.stringify({ level, time: new Date().toISOString(), msg, ...meta });

export const logger = {
  info: (msg, meta = {}) => console.log(format('info', msg, meta)),
  warn: (msg, meta = {}) => console.warn(format('warn', msg, meta)),
  error: (msg, meta = {}) => console.error(format('error', msg, meta)),
};
