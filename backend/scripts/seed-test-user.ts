import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { default: bcrypt } = await import("bcryptjs");
  const { connectDB } = await import("@/lib/db");
  const { User, Wallet, WalletTransaction } = await import("@/models");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed test credits in production.");
  const email = (process.env.TEST_USER_EMAIL || "").trim().toLowerCase();
  const password = process.env.TEST_USER_PASSWORD || "";
  const initialCoins = Number(process.env.TEST_USER_INITIAL_COINS || 100000);
  if (!email || !password || password.length < 10 || !Number.isSafeInteger(initialCoins) || initialCoins < 0) {
    throw new Error("Set TEST_USER_EMAIL, TEST_USER_PASSWORD (10+ chars), and TEST_USER_INITIAL_COINS in .env.local first.");
  }
  await connectDB();
  let user = await User.findOne({ email }).select("+passwordHash");
  if (!user) {
    const rounds = Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12)));
    user = await User.create({ name: "Demo Test User", email, passwordHash: await bcrypt.hash(password, rounds), role: "user", status: "active", isTestAccount: true });
    console.log(`Created test account: ${email}`);
  } else if (!user.isTestAccount) {
    throw new Error("That email already belongs to a non-test account. Choose a dedicated TEST_USER_EMAIL; no changes were made.");
  } else {
    console.log(`Test account already exists: ${email}; existing password and balance will not be reset.`);
  }
  const wallet = await Wallet.findOne({ userId: user._id });
  if (!wallet) {
    await Wallet.create({ userId: user._id, availableCoins: initialCoins, reservedCoins: 0, testCoinsTotal: initialCoins });
    if (initialCoins > 0) {
      await WalletTransaction.create({ userId: user._id, type: "test_credit", amountCoins: initialCoins, reservedDelta: 0, availableBefore: 0, availableAfter: initialCoins, reservedBefore: 0, reservedAfter: 0, status: "completed", idempotencyKey: "seed:test-user:initial", relatedEntityType: "seed", relatedEntityId: "test-user", metadata: { demoOnly: true } });
    }
    console.log(`Initialized demo-only wallet with ${initialCoins.toLocaleString()} test coins.`);
  } else {
    console.log(`Wallet already exists with ${wallet.availableCoins.toLocaleString()} available coins; balance was not reset.`);
  }
  await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect());
}
main().catch(async (error: unknown) => { console.error(error instanceof Error ? error.message : error); try { await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect()); } catch {} process.exitCode = 1; });
