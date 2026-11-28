export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const production = process.env.NODE_ENV === "production";
    const { migrate } = await import("@/src/server/db/migrate");
    try {
      if (production) {
        // Fail fast on configuration that would break every login or search.
        const [{ getSecret }, { getSearch }] = await Promise.all([
          import("@/src/server/auth"),
          import("@/src/server/search"),
        ]);
        getSecret();
        getSearch();
        if (!process.env.TRUSTED_CLIENT_IP_HEADER) {
          console.warn(
            "TRUSTED_CLIENT_IP_HEADER is not set: every anonymous client shares one rate-limit bucket (see README).",
          );
        }
      }
      await migrate();
      console.log("MongoDB connection and indexes ready");
    } catch (e) {
      console.error("Startup failed:", e);
      // Production exits so the supervisor restarts it instead of serving errors.
      if (production) process.exit(1);
    }
  }
}
