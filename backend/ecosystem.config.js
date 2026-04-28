/**
 * PM2 Ecosystem Config — Talent Hub Backend
 *
 * Usage:
 *   pm2 start ecosystem.config.js          # start / restart
 *   pm2 stop talent-hub-backend            # stop
 *   pm2 logs talent-hub-backend            # tail logs
 *   pm2 monit                              # live CPU/memory/log dashboard
 *   pm2 startup                            # auto-start on OS reboot
 *   pm2 save                               # persist current process list
 */

module.exports = {
  apps: [
    {
      name: 'talent-hub-backend',

      // Run the compiled JS (production-safe, no ts-node overhead)
      script: 'dist/index.js',

      // Restart policy
      autorestart: true,         // restart on crash
      max_restarts: 20,          // give up after 20 rapid restarts (prevents infinite loop on fatal bug)
      min_uptime: '10s',         // a restart counts only if process lived < 10s
      restart_delay: 3000,       // wait 3s between restarts (lets DB/Redis recover)

      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },

      // Logs (PM2 writes these automatically)
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Memory guard — restart if backend leaks past 512 MB
      max_memory_restart: '512M',
    },
  ],
};
