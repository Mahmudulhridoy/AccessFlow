import 'dotenv/config';

const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'CLIENT_ORIGIN'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env variable: ${key}`);
}

export default {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_ACCESS_SECRET,
  clientOrigin: process.env.CLIENT_ORIGIN,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  mlServiceUrl: (process.env.ML_SERVICE_URL || '').replace(/\/+$/, ''),
  mlServiceApiKey: process.env.ML_SERVICE_API_KEY || '',
  mlTimeoutMs: Number(process.env.ML_TIMEOUT_MS || 5000),
  mlAcceptDevModel: process.env.NODE_ENV !== 'production' && process.env.ML_ACCEPT_DEV_MODEL === 'true',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM || 'AccessFlow <no-reply@accessflow.local>',
  allowPrivateTargets:
    process.env.NODE_ENV === 'development' && process.env.ALLOW_PRIVATE_TARGETS === 'true',
};
