import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { default: bcrypt } = await import("bcryptjs");
  const { connectDB } = await import("@/lib/db");
  const { User } = await import("@/models");
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EXPLICIT_ADMIN_SEED !== "true") throw new Error("Explicit admin seeding in production requires ALLOW_EXPLICIT_ADMIN_SEED=true for this one command.");
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase(); const password = process.env.ADMIN_PASSWORD || "";
  if (!email || password.length < 14) throw new Error("Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 14 characters in your environment.");
  if (password === "replace-with-a-unique-password" || /^(changeme|password|admin|administrator)$/i.test(password)) throw new Error("ADMIN_PASSWORD is still a placeholder. Set a unique password of at least 14 characters.");
  await connectDB();
  const existing = await User.findOne({ email }).select("+passwordHash");
  if (existing) {
    if (existing.role !== "admin") throw new Error("ADMIN_EMAIL already exists as a normal user. Promote it through a controlled database operation; the script will not silently change a live role.");
    console.log(`Admin account already exists: ${email}; password was not reset.`);
  } else {
    const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
    await User.create({ name: "Marketplace Admin", email, passwordHash: await bcrypt.hash(password, rounds), role: "admin", status: "active", isTestAccount: false });
    console.log(`Created admin account: ${email}`);
  }
  await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect());
}
main().catch(async (error: unknown) => { console.error(error instanceof Error ? error.message : error); try { await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect()); } catch {} process.exitCode = 1; });
