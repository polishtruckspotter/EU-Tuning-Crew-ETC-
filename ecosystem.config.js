module.exports = {
  apps: [
    {
      name: 'etc-bot',
      cwd: './bot',
      script: './src/index.js',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'etc-bot-backend',
      cwd: './bot/backend',
      script: './index.mjs',
      interpreter: 'node',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.BACKEND_PORT || 3001
      }
    }
  ]
};
