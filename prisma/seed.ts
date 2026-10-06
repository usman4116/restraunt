// Demo restaurant dataset. Run with: npm run db:seed
// Login after seeding: owner@demo.rest / Demo1234pass
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
  const existing = await prisma.organization.findUnique({ where: { slug: "demo-bistro" } });
  if (existing) {
    console.log("Demo organization already seeded — skipping.");
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: "Demo Bistro",
      slug: "demo-bistro",
      email: "owner@demo.rest",
      currency: "USD",
      timezone: "UTC",
    },
  });

  const branch = await prisma.branch.create({
    data: {
      organizationId: org.id,
      name: "Downtown",
      code: "MAIN",
      address: "42 Market Street",
      city: "Springfield",
      country: "US",
    },
  });

  const passwordHash = await bcrypt.hash("Demo1234pass", 12);
  await prisma.user.createMany({
    data: [
      {
        organizationId: org.id, email: "owner@demo.rest", passwordHash,
        firstName: "Olivia", lastName: "Owner", systemRole: "ORG_OWNER", emailVerified: true,
      },
      {
        organizationId: org.id, email: "manager@demo.rest", passwordHash,
        firstName: "Marco", lastName: "Manager", systemRole: "RESTAURANT_MANAGER", emailVerified: true,
      },
      {
        organizationId: org.id, email: "cashier@demo.rest", passwordHash,
        firstName: "Cathy", lastName: "Cashier", systemRole: "CASHIER", emailVerified: true,
      },
      {
        organizationId: org.id, email: "chef@demo.rest", passwordHash,
        firstName: "Charlie", lastName: "Chef", systemRole: "CHEF", emailVerified: true,
      },
    ],
  });

  // Floor
  const section = await prisma.floorSection.create({
    data: { organizationId: org.id, branchId: branch.id, name: "Main Hall" },
  });
  await prisma.diningTable.createMany({
    data: Array.from({ length: 8 }, (_, i) => ({
      organizationId: org.id,
      branchId: branch.id,
      sectionId: section.id,
      name: `T${i + 1}`,
      capacity: i < 4 ? 2 : 4,
      posX: (i % 4) * 120,
      posY: Math.floor(i / 4) * 120,
    })),
  });

  // Menu
  const categoryNames = ["Starters", "Mains", "Pizza", "Desserts", "Drinks"];
  const categories = await Promise.all(
    categoryNames.map((name, i) =>
      prisma.menuCategory.create({
        data: { organizationId: org.id, name, sortOrder: i },
      }),
    ),
  );
  const cat = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  const menu: Array<{
    name: string; category: string; price: number; tax: number; prep?: number;
    allergens?: string[]; variants?: { name: string; delta: number }[];
  }> = [
    { name: "Garlic Bread", category: "Starters", price: 5.5, tax: 8, prep: 8, allergens: ["gluten"] },
    { name: "Bruschetta", category: "Starters", price: 6.9, tax: 8, prep: 10, allergens: ["gluten"] },
    { name: "Caesar Salad", category: "Starters", price: 8.5, tax: 8, prep: 7, allergens: ["egg", "dairy"] },
    { name: "Grilled Salmon", category: "Mains", price: 18.9, tax: 8, prep: 20, allergens: ["fish"] },
    { name: "Ribeye Steak", category: "Mains", price: 26.5, tax: 8, prep: 25,
      variants: [{ name: "250g", delta: 0 }, { name: "400g", delta: 9 }] },
    { name: "Chicken Alfredo", category: "Mains", price: 14.9, tax: 8, prep: 18, allergens: ["gluten", "dairy"] },
    { name: "Margherita", category: "Pizza", price: 11.0, tax: 8, prep: 15, allergens: ["gluten", "dairy"],
      variants: [{ name: 'Small 10"', delta: -2 }, { name: 'Large 14"', delta: 4 }] },
    { name: "Pepperoni", category: "Pizza", price: 13.0, tax: 8, prep: 15, allergens: ["gluten", "dairy"],
      variants: [{ name: 'Small 10"', delta: -2 }, { name: 'Large 14"', delta: 4 }] },
    { name: "Tiramisu", category: "Desserts", price: 6.5, tax: 8, prep: 5, allergens: ["egg", "dairy", "gluten"] },
    { name: "Cheesecake", category: "Desserts", price: 6.0, tax: 8, prep: 5, allergens: ["dairy", "gluten"] },
    { name: "Espresso", category: "Drinks", price: 2.5, tax: 8, prep: 3 },
    { name: "Fresh Lemonade", category: "Drinks", price: 3.9, tax: 8, prep: 4 },
    { name: "Sparkling Water", category: "Drinks", price: 2.0, tax: 8, prep: 1 },
  ];

  for (const [i, m] of menu.entries()) {
    await prisma.menuItem.create({
      data: {
        organizationId: org.id,
        categoryId: cat[m.category],
        name: m.name,
        sku: `SKU-${String(i + 1).padStart(3, "0")}`,
        basePrice: m.price,
        taxRate: m.tax,
        prepTimeMinutes: m.prep,
        allergens: m.allergens ?? [],
        sortOrder: i,
        variants: m.variants
          ? { create: m.variants.map((v, vi) => ({ name: v.name, priceDelta: v.delta, sortOrder: vi })) }
          : undefined,
      },
    });
  }

  // Inventory
  const warehouse = await prisma.warehouse.create({
    data: { organizationId: org.id, branchId: branch.id, name: "Kitchen Store", code: "KS01" },
  });
  const inventory: Array<[string, string, string, number, number]> = [
    // name, sku, unit, qty, reorderLevel
    ["Flour", "ING-001", "kg", 40, 10],
    ["Mozzarella", "ING-002", "kg", 12, 5],
    ["Tomato Sauce", "ING-003", "L", 18, 6],
    ["Salmon Fillet", "ING-004", "kg", 8, 3],
    ["Ribeye Cut", "ING-005", "kg", 15, 5],
    ["Chicken Breast", "ING-006", "kg", 20, 6],
    ["Coffee Beans", "ING-007", "kg", 6, 2],
    ["Lemons", "ING-008", "kg", 9, 3],
  ];
  for (const [name, sku, unit, qty, reorder] of inventory) {
    const item = await prisma.inventoryItem.create({
      data: {
        organizationId: org.id, name, sku, unit,
        reorderLevel: reorder, reorderQty: reorder * 3, avgCost: 4.2, lastCost: 4.2,
      },
    });
    await prisma.stockLevel.create({
      data: {
        organizationId: org.id, warehouseId: warehouse.id,
        inventoryItemId: item.id, quantity: qty,
      },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId: org.id, branchId: branch.id, warehouseId: warehouse.id,
        inventoryItemId: item.id, type: "ADJUSTMENT", quantity: qty, unitCost: 4.2,
        note: "Opening stock",
      },
    });
  }

  // Customers
  await prisma.customer.createMany({
    data: [
      { organizationId: org.id, firstName: "Ava", lastName: "Nguyen", phone: "+15550001", email: "ava@example.com", loyaltyPoints: 240, visitCount: 12 },
      { organizationId: org.id, firstName: "Liam", lastName: "Patel", phone: "+15550002", email: "liam@example.com", loyaltyPoints: 80, visitCount: 4 },
      { organizationId: org.id, firstName: "Sofia", lastName: "Garcia", phone: "+15550003", loyaltyPoints: 0, visitCount: 1 },
    ],
  });

  // Chart of accounts — the minimum the POS needs to post a sale to the ledger.
  // Codes here must match POS_ACCOUNT_CODES in the finance service.
  await prisma.account.createMany({
    data: [
      { organizationId: org.id, code: "1000", name: "Cash on hand", type: "ASSET", isSystem: true },
      { organizationId: org.id, code: "1100", name: "Accounts receivable", type: "ASSET", isSystem: true },
      { organizationId: org.id, code: "2200", name: "Sales tax payable", type: "LIABILITY", isSystem: true },
      { organizationId: org.id, code: "2210", name: "Tips payable", type: "LIABILITY", isSystem: true },
      { organizationId: org.id, code: "3000", name: "Owner equity", type: "EQUITY", isSystem: true },
      { organizationId: org.id, code: "4000", name: "Sales revenue", type: "REVENUE", isSystem: true },
      { organizationId: org.id, code: "5000", name: "COGS — food", type: "EXPENSE", isSystem: true },
      { organizationId: org.id, code: "6000", name: "Operating expenses", type: "EXPENSE", isSystem: true },
    ],
  });

  // Sales history — 14 days of completed orders so dashboards and reports
  // have something to show. Deterministic pseudo-random for reproducible seeds.
  const menuItems = await prisma.menuItem.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, basePrice: true, taxRate: true },
  });
  const tables = await prisma.diningTable.findMany({
    where: { branchId: branch.id },
    select: { id: true },
  });
  const customers = await prisma.customer.findMany({
    where: { organizationId: org.id },
    select: { id: true },
  });

  let seedState = 20260803;
  const rand = () => {
    seedState = (seedState * 1103515245 + 12345) % 2147483648;
    return seedState / 2147483648;
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  let orderSeq = 0;
  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const isWeekend = [0, 6].includes(new Date(Date.now() - dayOffset * 864e5).getDay());
    const orderCount = Math.floor((isWeekend ? 14 : 8) + rand() * 6);

    for (let n = 0; n < orderCount; n++) {
      const placedAt = new Date(Date.now() - dayOffset * 864e5);
      placedAt.setHours(11 + Math.floor(rand() * 11), Math.floor(rand() * 60), 0, 0);

      const lineCount = 1 + Math.floor(rand() * 4);
      const lines = Array.from({ length: lineCount }, () => {
        const item = pick(menuItems);
        const quantity = 1 + Math.floor(rand() * 2);
        const unitPrice = Number(item.basePrice);
        return {
          menuItemId: item.id,
          nameSnapshot: item.name,
          quantity,
          unitPrice,
          taxRate: Number(item.taxRate),
          lineTotal: Number((unitPrice * quantity).toFixed(2)),
        };
      });

      const subtotal = Number(lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
      const taxAmount = Number((subtotal * 0.08).toFixed(2));
      const type = rand() < 0.6 ? "DINE_IN" : rand() < 0.5 ? "TAKEAWAY" : "DELIVERY";
      const tipAmount = type === "DINE_IN" ? Number((subtotal * 0.1 * rand()).toFixed(2)) : 0;
      const totalAmount = Number((subtotal + taxAmount + tipAmount).toFixed(2));

      orderSeq += 1;
      await prisma.order.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          orderNumber: `MAIN-${String(orderSeq).padStart(6, "0")}`,
          type: type as "DINE_IN" | "TAKEAWAY" | "DELIVERY",
          orderStatus: "COMPLETED",
          tableId: type === "DINE_IN" ? pick(tables).id : null,
          customerId: rand() < 0.4 ? pick(customers).id : null,
          guestCount: type === "DINE_IN" ? 1 + Math.floor(rand() * 4) : null,
          subtotal,
          taxAmount,
          tipAmount,
          totalAmount,
          paidAmount: totalAmount,
          placedAt,
          completedAt: new Date(placedAt.getTime() + 45 * 60_000),
          createdAt: placedAt,
          items: { create: lines },
          payments: {
            create: {
              organizationId: org.id,
              branchId: branch.id,
              method: rand() < 0.5 ? "CARD" : "CASH",
              paymentStatus: "CAPTURED",
              amount: totalAmount,
              tipAmount,
              processedAt: placedAt,
              createdAt: placedAt,
            },
          },
        },
      });
    }
  }

  // Back-fill the ledger and the delivery board from the seeded sales, so a
  // fresh install shows revenue in Finance and runs in Delivery rather than
  // empty modules. Mirrors what placeOrder() now does for live orders.
  const seededOrders = await prisma.order.findMany({
    where: { branchId: branch.id },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      tipAmount: true,
      totalAmount: true,
      placedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const ledgerAccounts = await prisma.account.findMany({
    where: { organizationId: org.id },
    select: { id: true, code: true },
  });
  const accountId = (code: string) => ledgerAccounts.find((a) => a.code === code)!.id;
  const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  let entrySeq = 0;
  for (const o of seededOrders) {
    const net = Number(o.subtotal) - Number(o.discountAmount);
    const tax = Number(o.taxAmount);
    const tip = Number(o.tipAmount);
    entrySeq += 1;

    await prisma.journalEntry.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        entryNumber: `JE-${String(entrySeq).padStart(6, "0")}`,
        entryDate: utcDay(o.placedAt ?? o.createdAt),
        memo: `POS order ${o.orderNumber}`,
        referenceType: "order",
        referenceId: o.id,
        journalStatus: "POSTED",
        postedAt: o.placedAt ?? o.createdAt,
        createdAt: o.createdAt,
        lines: {
          create: [
            { accountId: accountId("1000"), debit: Number(o.totalAmount), credit: 0, memo: `Order ${o.orderNumber}` },
            { accountId: accountId("4000"), debit: 0, credit: net, memo: `Sales — ${o.orderNumber}` },
            ...(tax > 0
              ? [{ accountId: accountId("2200"), debit: 0, credit: tax, memo: `Tax — ${o.orderNumber}` }]
              : []),
            ...(tip > 0
              ? [{ accountId: accountId("2210"), debit: 0, credit: tip, memo: `Tip — ${o.orderNumber}` }]
              : []),
          ],
        },
      },
    });
  }

  const zone = await prisma.deliveryZone.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      name: "Downtown",
      deliveryFee: 3.5,
      minOrderAmount: 10,
      etaMinutes: 30,
    },
  });
  const rider = await prisma.rider.create({
    data: {
      organizationId: org.id,
      name: "Marco Silva",
      phone: "+15550100",
      vehicleType: "Scooter",
      vehicleNumber: "SC-4412",
      isAvailable: true,
    },
  });

  const streets = ["12 Oak St", "88 Maple Ave", "5 Birch Ln", "301 Cedar Rd", "47 Pine Way"];
  for (const [i, o] of seededOrders.filter((s) => s.type === "DELIVERY").entries()) {
    const placed = o.placedAt ?? o.createdAt;
    // Everything but the newest few runs is history; leave those open so the
    // dispatch board has something to act on.
    const isRecent = Date.now() - placed.getTime() < 864e5;
    await prisma.delivery.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        orderId: o.id,
        zoneId: zone.id,
        address: `${streets[i % streets.length]}, Apt ${1 + (i % 9)}`,
        deliveryStatus: isRecent ? "PENDING" : "DELIVERED",
        riderId: isRecent ? null : rider.id,
        assignedAt: isRecent ? null : placed,
        pickedUpAt: isRecent ? null : new Date(placed.getTime() + 10 * 60_000),
        deliveredAt: isRecent ? null : new Date(placed.getTime() + 35 * 60_000),
        riderEarning: isRecent ? 0 : 52.1,
        createdAt: placed,
      },
    });
  }

  // A few live kitchen tickets and upcoming reservations for today's view.
  const todayOrders = await prisma.order.findMany({
    where: { branchId: branch.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, items: { select: { id: true, nameSnapshot: true, quantity: true } } },
  });
  for (const [i, o] of todayOrders.entries()) {
    await prisma.kitchenTicket.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        orderId: o.id,
        ticketNumber: `KT-${String(i + 1).padStart(4, "0")}`,
        ticketStatus: i === 0 ? "COOKING" : "NEW",
        items: {
          create: o.items.map((it) => ({
            orderItemId: crypto.randomUUID(),
            nameSnapshot: it.nameSnapshot,
            quantity: it.quantity,
          })),
        },
      },
    });
  }

  for (let i = 1; i <= 4; i++) {
    const reservedAt = new Date(Date.now() + i * 3600_000);
    await prisma.reservation.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        tableId: pick(tables).id,
        guestName: ["Ava Nguyen", "Liam Patel", "Sofia Garcia", "Noah Kim"][i - 1],
        guestPhone: `+1555010${i}`,
        partySize: 2 + (i % 3),
        reservedAt,
        resStatus: "CONFIRMED",
      },
    });
  }

  console.log(`Seeded Demo Bistro with ${orderSeq} orders across 14 days.`);
  console.log("  owner@demo.rest / Demo1234pass (Org Owner)");
  console.log("  manager@demo.rest, cashier@demo.rest, chef@demo.rest — same password");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
