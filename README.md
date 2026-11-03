# CAFlow - CA Office Management SaaS Platform

**CAFlow** is a modern, production-ready Chartered Accountant (CA) Office Management Web Application inspired by Practive (`app.practive.in`), built with a unique design system, enterprise-grade architecture, and persistent Neon Serverless PostgreSQL backend.

---

## 🎨 Design System & Palette

- **Primary**: Deep Forest Green (`#176B57`)
- **Secondary**: Dark Charcoal (`#202A33`)
- **Background**: Warm Off-White (`#F7F8F5`)
- **Cards**: Pure White (`#FFFFFF`)
- **Accent**: Muted Amber (`#DDAA45`)
- **Text**: Dark Slate (`#263238`)
- **Borders**: Light Grey-Green (`#E1E7E2`)

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, React Router, Recharts
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, Zod validation, JWT authentication, bcryptjs
- **Database**: Neon Serverless PostgreSQL (47 normalized relational models with multi-tenant isolation)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js >= v18
- Neon PostgreSQL Database

### 2. Backend Setup
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npx tsx src/index.ts
```
The backend server runs on `http://localhost:5000`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend application runs on `http://localhost:5173`.

---

## 🔑 Demo Login Credentials

- **Firm Owner / Managing Partner**: `kapil@manavi.com` / `Admin@123`
- **Audit Manager**: `neha@manavi.com` / `Employee@123`
- **Finance Controller**: `rajesh@manavi.com` / `Employee@123`
- **Audit Assistant**: `jagan@manavi.com` / `Employee@123`

---

## 📦 Implemented Modules

1. **Dashboard**: Top summary cards (Due Today, Due Tomorrow, Due in 7 Days, Overdue up to 7 days, Overdue > 7 days), task distribution donut chart, live attendance check-in/out widget, today's to-do list, and performance trend chart.
2. **Tasks**: Workflows for TDS 24Q, GST GSTR-3B, Advance Tax, DSC applications & renewals, Trademark registrations, checklists, comments, and status transitions.
3. **Clients**: 24 Indian enterprise client entities (A M Dairy Products, Abhaya Agro Farms, Acupressure Healthcare, Adhvithi Homes, etc.), search by PAN/GST/Mobile, and integrated WhatsApp quick-links.
4. **Attendance**: Daily and monthly tracking, date navigation, live Check-In / Check-Out calculation, and hours summaries.
5. **To-Do**: Personal and team reminders with priority tags (High, Medium, Low) and category filtering.
6. **Renewals**: Licence and certificate expiry alerts (FSSAI, DSC Combo, Trademarks).
7. **Documents**:
   - **In-Out Register**: Physical custody logs (USB DSC tokens, Partnership deeds), return dates, and return actions.
   - **Client Document Vault**: Categorized cloud document storage (Tax, GST, Audit, KYC).
   - **Document Collection Requests**: Client statement requests and fulfillment tracking.
8. **Finance & Billing**: Professional fee invoices, 18% GST tax calculation, payment receipts (NEFT/Cheque/UPI), and expense tracking.
9. **Timesheets**: Billable vs non-billable hours, work descriptions, and manager approval workflows.
10. **Services & Retainers**: Service catalogue with turnaround defaults and recurring client retainership contracts.
11. **Send Notifications**: Multi-channel broadcast wizard (WhatsApp, Email, SMS, In-App) with client template previews.
12. **Reports & Analytics**: Real financial aggregations, receivables ageing, and service workload distribution.
13. **Settings**: Organization tax profiles (PAN, GSTIN, address) and user role administration.
14. **Client Portal**: Dedicated secure view for client statement uploads, filing progress, and invoice payments.
