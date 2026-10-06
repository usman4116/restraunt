// One-off script: create UMT organization
// Run with: npx tsx prisma/seed-umt.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://erp:erp@localhost:5432/restaurant_erp",
  }),
});

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: "umt" } });
  if (existing) {
    console.log("UMT organization already exists — skipping.");
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: "UMT",
      slug: "umt",
      email: "owner@umt.rest",
      currency: "USD",
      timezone: "UTC",
    },
  });

  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "Main Branch",
      code: "MAIN",
      address: "University of Management and Technology",
      city: "Lahore",
      country: "PK",
    },
  });

  const passwordHash = await bcrypt.hash("UMT@1234pass", 12);

  await prisma.user.createMany({
    data: [
      {
        organizationId: org.id,
        email: "owner@umt.rest",
        passwordHash,
        firstName: "UMT",
        lastName: "Owner",
        systemRole: "ORG_OWNER",
        emailVerified: true,
        branchIds: [],
      },
      {
        organizationId: org.id,
        email: "manager@umt.rest",
        passwordHash,
        firstName: "UMT",
        lastName: "Manager",
        systemRole: "RESTAURANT_MANAGER",
        emailVerified: true,
        branchIds: [],
      },
    ],
  });

  // Minimum chart of accounts so Finance and POS work out of the box
  await prisma.account.createMany({
    data: [
      { organizationId: org.id, code: "1000", name: "Cash on hand",       type: "ASSET",     isSystem: true },
      { organizationId: org.id, code: "1100", name: "Accounts receivable", type: "ASSET",     isSystem: true },
      { organizationId: org.id, code: "2200", name: "Sales tax payable",   type: "LIABILITY", isSystem: true },
      { organizationId: org.id, code: "2210", name: "Tips payable",        type: "LIABILITY", isSystem: true },
      { organizationId: org.id, code: "3000", name: "Owner equity",        type: "EQUITY",    isSystem: true },
      { organizationId: org.id, code: "4000", name: "Sales revenue",       type: "REVENUE",   isSystem: true },
      { organizationId: org.id, code: "5000", name: "COGS — food",         type: "EXPENSE",   isSystem: true },
      { organizationId: org.id, code: "6000", name: "Operating expenses",  type: "EXPENSE",   isSystem: true },
    ],
  });

  console.log("✅  UMT organization created.");
  console.log(`    Org ID   : ${org.id}`);
  console.log(`    Branch ID: ${branch.id}`);
  console.log("");
  console.log("  Accounts:");
  console.log("    owner@umt.rest   / UMT@1234pass  (Org Owner)");
  console.log("    manager@umt.rest / UMT@1234pass  (Restaurant Manager)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
