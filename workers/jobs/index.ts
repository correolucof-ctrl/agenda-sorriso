interface Env { JOBS_CRON_SECRET: string; AGENDA_SORRISO_BASE_URL: string }

export default {
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil((async () => {
      const target = new URL("/api/internal/jobs/run", env.AGENDA_SORRISO_BASE_URL);
      if (target.protocol !== "https:" || target.hostname !== "agenda-sorriso.correo-lucof-708.workers.dev") {
        throw new Error("Destino do agendador inválido");
      }
      const response = await fetch(target, { method: "POST", headers: { Authorization: `Bearer ${env.JOBS_CRON_SECRET}` } });
      if (!response.ok) throw new Error(`Processamento agendado falhou (${response.status})`);
    })());
  },
};
