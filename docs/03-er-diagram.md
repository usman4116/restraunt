# ER Diagram (core entities)

Full schema in `prisma/schema.prisma`. Every tenant table additionally carries: `organizationId`, (`branchId`), `createdAt`, `updatedAt`, `deletedAt`, `createdById`, `updatedById`, `status`.

```mermaid
erDiagram
    Organization ||--o{ Branch : has
    Organization ||--o{ User : employs
    User }o--o{ Role : assigned
    Role ||--o{ RolePermission : grants
    User ||--o{ Session : opens
    User ||--o{ AuditLog : produces

    Branch ||--o{ FloorSection : contains
    FloorSection ||--o{ DiningTable : contains
    DiningTable ||--o{ Reservation : booked
    Customer ||--o{ Reservation : makes

    MenuCategory ||--o{ MenuItem : groups
    MenuItem ||--o{ MenuItemVariant : has
    MenuItem }o--o{ ModifierGroup : offers
    ModifierGroup ||--o{ Modifier : contains
    MenuItem ||--o{ BranchMenuItem : "per-branch price/availability"
    MenuItem ||--o| Recipe : "costed by"
    Recipe ||--o{ RecipeIngredient : uses
    InventoryItem ||--o{ RecipeIngredient : "consumed as"

    Customer ||--o{ Order : places
    Order ||--o{ OrderItem : contains
    OrderItem ||--o{ OrderItemModifier : with
    Order ||--o{ Payment : "settled by"
    Order ||--o{ KitchenTicket : dispatches
    KitchenTicket ||--o{ KitchenTicketItem : lists
    Order ||--o| Delivery : "fulfilled by"
    Delivery }o--|| Rider : "assigned to"
    Order ||--o{ OrderDiscount : applies
    Coupon ||--o{ OrderDiscount : redeemed

    Warehouse ||--o{ StockLevel : holds
    InventoryItem ||--o{ StockLevel : "stocked as"
    InventoryItem ||--o{ StockMovement : "ledger of"
    StockBatch ||--o{ StockMovement : tracks
    Supplier ||--o{ PurchaseOrder : receives
    PurchaseOrder ||--o{ PurchaseOrderItem : lists
    PurchaseOrder ||--o| GoodsReceipt : "received via"

    Customer ||--o{ LoyaltyTransaction : earns
    Customer ||--o{ Feedback : gives

    Employee ||--o{ AttendanceRecord : logs
    Employee ||--o{ LeaveRequest : requests
    Employee }o--|| Shift : works
    PayrollRun ||--o{ PayrollEntry : pays
    Employee ||--o{ PayrollEntry : receives

    Account ||--o{ JournalLine : posted
    JournalEntry ||--o{ JournalLine : contains
    Expense }o--|| Account : categorized
```

## Key design decisions

- **Orders are immutable after close** — corrections happen via refund/void records, preserving audit trail.
- **Stock ledger (`StockMovement`) is append-only**; `StockLevel` is a maintained aggregate (recomputable from ledger).
- **Finance is double-entry**: `JournalEntry` must balance (checked in service layer + DB trigger); P&L and balance sheet are queries over `JournalLine`.
- **Recipes decouple menu from inventory**: selling a MenuItem consumes inventory through its active Recipe version.
- **Branch overrides** (`BranchMenuItem`) let franchises vary price/availability without duplicating the catalog.
- **Partitioning candidates** (when volume demands): `orders`, `stock_movements`, `audit_logs` by month via `created_at`.
