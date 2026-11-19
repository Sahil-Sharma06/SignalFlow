process.env.SIGNALFLOW_NO_AUTOSEED = "1";

void (async () => {
  const { db } = await import("@/lib/db/client");
  const { seed } = await import("@/lib/db/seed");
  seed(db, { log: true });
})();
