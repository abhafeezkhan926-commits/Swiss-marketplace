import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { default: mongoose } = await import("mongoose");
  const { ensureDefaultPackages } = await import("@/lib/wallet");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EXPLICIT_PACKAGE_SEED !== "true") throw new Error("Set ALLOW_EXPLICIT_PACKAGE_SEED=true to seed packages in production.");
  await ensureDefaultPackages();
  console.log("Default coin package seed checked. Existing package configuration was not overwritten.");
  await mongoose.disconnect();
}
main().catch(async (error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
