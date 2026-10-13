import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://test:test@localhost:3306/test',
      JWT_ACCESS_SECRET: 'test-secret',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
