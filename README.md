<<<<<<< HEAD
# Air Ticket Agency Management
## সফটওয়্যারের পরিচিতি, ফিচার ও ডেভেলপমেন্ট পরিকল্পনা

**প্রজেক্টের নাম:** Air Ticket Agency Management  
**ধরন:** Air Ticket Agency / Sub-Agent Management Software  
**প্রধান ভাষা:** ENGLISH  
**Frontend:** HTML, CSS, Vanilla JavaScript  
**Backend ও Database:** Supabase (পরিকল্পিত)  
**Hosting:** Cloudflare (পরিকল্পিত)  
**Source Code:** GitHub  
**Android App:** Capacitor-এর মাধ্যমে একই Web App থেকে Android সংস্করণ তৈরির পরিকল্পনা

> এই README হলো সফটওয়্যারের পরিকল্পনা ও ফিচারের নথি। বর্তমান ZIP-টি প্রাথমিক Project Foundation; এখানে উল্লেখিত সব ফিচার এখনো তৈরি বা Supabase-এর সঙ্গে সংযুক্ত করা হয়নি।

---

# ১. সফটওয়্যারের উদ্দেশ্য

Air Ticket Agency Management হবে একটি এয়ার টিকিট এজেন্সির দৈনন্দিন কাজ, বুকিং, টিকিট বিক্রি, কাস্টমার, সোর্স এজেন্সি, পেমেন্ট, বকেয়া, আয়-ব্যয় এবং লাভ-ক্ষতির হিসাব পরিচালনার সফটওয়্যার।

এটি মূলত এজেন্সির নিজস্ব ব্যবস্থাপনা ও হিসাব রাখার জন্য তৈরি হবে। প্রাথমিক সংস্করণে সরাসরি Airline GDS বা Airline Ticket Issuing API সংযোগ অন্তর্ভুক্ত নয়। টিকিট ও বুকিংয়ের তথ্য ম্যানুয়ালি এন্ট্রি করা যাবে এবং প্রয়োজন অনুযায়ী ডকুমেন্ট আপলোডের সুবিধা রাখা হবে।

# ২. প্রধান মডিউল ও ফিচার

## ২.১ Dashboard
- মোট বিক্রয় ও বুকিংয়ের সারাংশ
- ইস্যু হওয়া টিকিটের সংখ্যা
- মোট Purchase ও Selling
- Gross Profit ও Net Profit
- Customer Due ও Agency Payable
- Cash ও Bank Balance
- সাম্প্রতিক বিক্রয়, বুকিং, পেমেন্ট ও খরচ
- Staff Role অনুযায়ী আলাদা Dashboard

## ২.২ Booking Management
- নতুন Booking তৈরি ও সম্পাদনা
- কাস্টমার ও যাত্রীর তথ্য
- Airline, Route, Flight ও Travel Date
- PNR ও Booking Status
- Source Agency নির্বাচন
- Advance Payment
- Booking Document আপলোড
- Booking History
- Booking থেকে Ticket Sale-এ Convert
- Booking Cancel করার রেকর্ড

Booking ইস্যু না হওয়া পর্যন্ত সম্পন্ন বিক্রয় হিসেবে গণনা হবে না। একটি Booking সর্বোচ্চ একবার Sale-এ Convert করা যাবে।

## ২.৩ Ticket Sales
- Booking থেকে Ticket Sale
- সরাসরি Ticket Sale
- এক Sale-এ একাধিক Passenger ও Ticket
- Ticket Number, PNR ও Flight Details
- Purchase Price ও Selling Price
- Source Agency নির্বাচন
- Customer Payment ও Due
- Sales History
- Ticket Information ও Documents

একটি Sale-এ একাধিক Source Agency-এর টিকিট থাকতে পারে। পরিকল্পনা অনুযায়ী প্রতিটি Ticket/Passenger-এর জন্য আলাদা Source Agency নির্বাচন করা যাবে।

## ২.৪ Customer Management
- Customer তৈরি, সম্পাদনা ও তালিকা
- নাম, মোবাইল, WhatsApp, Email ও ঠিকানা
- প্রয়োজন অনুযায়ী Passport Information
- Customer-এর Booking ও Ticket History
- মোট কেনাকাটা, Paid ও Due
- Customer Statement

## ২.৫ Customer Payments & Due
- Customer-এর কাছ থেকে টাকা গ্রহণ
- Advance, Partial ও Full Payment
- একাধিক কিস্তিতে Payment
- Payment Method ও Cash/Bank Account নির্বাচন
- Payment Receipt
- কোন Payment কোন Sale বা Due-এর বিপরীতে নেওয়া হয়েছে তার Allocation
- Customer Ledger ও Due Report

## ২.৬ Agency Management
- একাধিক Source Agency যুক্ত করা
- Agency Name ও Contact Person
- Mobile, WhatsApp ও Email
- Address ও Account Reference
- Opening Balance ও Notes
- Active / Inactive Status
- Agency-এর Ticket Purchase History

Inactive Agency পুরোনো হিসাব ও ইতিহাসে থাকবে, তবে নতুন লেনদেনে নির্বাচন করা যাবে না।

## ২.৭ Agency Accounts & Payments
- Agency-কে টাকা প্রদান
- Partial ও Full Payment
- Agency Payable হিসাব
- Payment Allocation
- Agency Statement
- Agency Ledger
- Opening Balance ও Transaction History

## ২.৮ Expense Management
- নতুন Expense যোগ করা
- Expense Category
- তারিখ, Amount ও Payment Method
- Cash/Bank Account নির্বাচন
- Reference ও Notes
- Expense History ও Report

## ২.৯ Cash & Bank Management
- একাধিক Cash/Bank Account
- Opening Balance
- Cash In ও Cash Out
- Bank Deposit ও Withdrawal
- Account-to-Account Transfer
- Cashbook ও Bankbook
- প্রতিটি Account-এর বর্তমান Balance
- Transaction History

Cash/Bank Balance এবং Profit আলাদা বিষয় হিসেবে হিসাব করা হবে।

## ২.১০ Refund, Cancellation & Reissue
- Ticket Cancellation
- Customer Refund
- Agency Refund
- Ticket Reissue
- Date/Flight Change
- Name Correction
- Additional Charge ও Adjustment
- Refund ও Change History

পুরোনো আর্থিক রেকর্ড মুছে না ফেলে Reversal/Adjustment ও History সংরক্ষণ করা হবে।

## ২.১১ Reports & Profit/Loss
- Daily, Weekly ও Monthly Sales
- Date Range Report
- Booking ও Issued Ticket Report
- Customer Due Report
- Agency Payable Report
- Purchase ও Selling Report
- Gross Profit ও Net Profit
- Expense Report
- Cash ও Bank Report
- Refund Report
- Staff Activity Report

## ২.১২ Receipts & Invoices
- Booking Receipt
- Customer Invoice
- Payment Receipt
- PDF তৈরি
- Thermal Print
- A4 Print
- WhatsApp Share

**গুরুত্বপূর্ণ:** Customer-এর জন্য তৈরি Invoice, Receipt বা Ticket Summary-তে Purchase Price ও Profit কখনো দেখানো হবে না। সেখানে Selling/Fare, Paid, Due এবং প্রয়োজনীয় Ticket/Passenger Information থাকবে।

## ২.১৩ Staff Management & Permissions
প্রাথমিক Role:
- **Owner:** সম্পূর্ণ নিয়ন্ত্রণ ও সব তথ্যের প্রবেশাধিকার।
- **Manager:** অপারেশন ও আর্থিক ব্যবস্থাপনা; Purchase Price ও Profit দেখতে পারবেন।
- **Ticket Staff:** Booking, Ticket Sale ও Customer-এর কাজ; Purchase Price ও Profit দেখতে পারবেন না।
- **Accounts Staff:** Payment, Due, Expense, Cash ও Bank পরিচালনা; Purchase Price ও Profit দেখতে পারবেন না।

Permission শুধু পেজে তথ্য Hide করে নয়, Database ও Backend-এও নিরাপদভাবে কার্যকর করতে হবে।

## ২.১৪ Settings, Backup & Audit Logs
- Company Profile ও Logo
- Invoice/Receipt Settings
- User ও Role Settings
- Backup Management
- গুরুত্বপূর্ণ কাজের Audit Log
- কে, কখন, কোন Record-এ কী পরিবর্তন করেছেন তার History

---

# ৩. গুরুত্বপূর্ণ হিসাবের নিয়ম

- **Purchase Price:** সোর্স এজেন্সিকে টিকিটের জন্য প্রদেয় মূল্য।
- **Selling Price:** কাস্টমারের কাছে বিক্রয়মূল্য।
- **Gross Profit:** Selling Price − Purchase Price।
- **Net Profit:** Gross Profit থেকে প্রযোজ্য Expense ও অন্যান্য সমন্বয় বাদ দেওয়ার পরের লাভ।
- Customer Paid ও Customer Due আলাদা থাকবে।
- Agency Paid ও Agency Payable আলাদা থাকবে।
- Cash/Bank Balance-কে Profit হিসেবে গণনা করা যাবে না।
- Booking-এর Advance Sale-এ Convert হলে সমন্বয় হবে; দ্বিগুণ Payment বা Income হিসেবে গণনা হবে না।
- Partial Payment সমর্থন করতে হবে।
- Refund, Cancellation ও Reissue-এর কারণে আগের হিসাবের History নষ্ট করা যাবে না।

---

# ৪. নিরাপত্তা ও ডেটা ব্যবস্থাপনা

পরিকল্পিত নিরাপত্তা ব্যবস্থা:
- Supabase Authentication
- Role-Based Access Control
- Supabase Row Level Security (RLS)
- Sensitive Financial Data-এর সীমিত প্রবেশাধিকার
- Server-side validation ও নিরাপদ Database Functions
- Audit Logs
- Database ও Storage Backup

Supabase `service_role` key কখনো Browser Frontend বা Android App-এ রাখা যাবে না। Purchase Price ও Profit-এর মতো সংবেদনশীল তথ্য শুধু Frontend-এ Hide করলেই হবে না; Database/API স্তরেও সুরক্ষা নিশ্চিত করতে হবে।

# ৫. Project Folder Structure

```text
Air_Ticket_Agency_Management/
│
├── index.html
│
├── pages/
│   ├── login.html
│   ├── dashboard.html
│   ├── bookings.html
│   ├── ticket-sales.html
│   ├── customers.html
│   ├── customer-payments.html
│   ├── agencies.html
│   ├── agency-accounts.html
│   ├── expenses.html
│   ├── cash-bank.html
│   ├── refunds.html
│   ├── reports.html
│   ├── receipts.html
│   ├── staff.html
│   ├── settings.html
│   └── audit-logs.html
│
├── js/
│   ├── main.js
│   ├── auth.js
│   └── প্রতিটি পেজের আলাদা JavaScript ফাইল
│
├── css/
│   ├── main.css
│   └── প্রতিটি পেজের আলাদা CSS ফাইল
│
└── supabase/
    ├── config.toml
    ├── schema.sql
    ├── policies.sql
    └── functions/
```

### Folder Rules
1. Root-এ `index.html` থাকবে।
2. `pages/`-এ `index.html` ছাড়া সব HTML পেজ থাকবে।
3. `js/`-এ সব JavaScript ফাইল থাকবে।
4. `css/`-এ সব CSS ফাইল থাকবে।
5. `main.css`-এ Header, Sidebar, Footer, Typography, Buttons ও অন্যান্য Common Design থাকবে।
6. প্রতিটি পেজের নিজস্ব CSS থাকবে।
7. Supabase-সম্পর্কিত Database ও Backend Files `supabase/`-এ থাকবে।
8. অপ্রয়োজনীয় Nested Folder তৈরি করা হবে না।

---

# ৬. Development Roadmap

কাজগুলো নিচের ক্রমে সম্পন্ন করার পরিকল্পনা:

1. **Requirements Finalization:** প্রতিটি পেজ, ফর্ম, Field, Workflow ও Permission চূড়ান্ত করা।
2. **UI/UX Design:** Dashboard, Navigation, Forms, Tables, Modal, Reports ও Responsive Design।
3. **Project Foundation:** Folder Structure, Shared CSS/JS, Page Navigation ও Common Components।
4. **Database Design:** Tables, Relationships, Indexes, RLS, Functions ও Storage পরিকল্পনা।
5. **Authentication & Permissions:** Login, Logout, Session, Staff ও Role Access।
6. **Customer & Agency:** Customer এবং Multiple Source Agency Management।
7. **Booking Management:** Booking, Passenger, PNR, Documents ও Advance।
8. **Ticket Sales:** Direct Sale এবং Booking-to-Sale Conversion।
9. **Payments & Accounts:** Customer Payment, Agency Payment, Due, Cash ও Bank।
10. **Expenses & Profit/Loss:** Expense, Purchase, Selling ও Profit Calculation।
11. **Refund & Ticket Changes:** Cancellation, Refund, Reissue ও Adjustments।
12. **Invoice & Printing:** PDF, Thermal, A4 ও WhatsApp Sharing।
13. **Dashboard & Reports:** Role-based Dashboard ও Financial/Operational Reports।
14. **Security & Testing:** RLS, Permissions, Calculation, Workflow ও Device Testing।
15. **Deployment:** GitHub, Cloudflare, Supabase Production Setup ও Live Testing।
16. **Android App:** Capacitor Integration, Android Testing ও APK Build।

একটি Module সম্পন্ন ও পরীক্ষা করার পর পরবর্তী Module শুরু করা হবে।

# ৭. Development-এর সময় বাধ্যতামূলক নিয়ম

- বিদ্যমান Source Code পরীক্ষা না করে পরিবর্তন করা যাবে না।
- কাজ করা পেজ বা Feature অকারণে Delete/Replace করা যাবে না।
- অনুমতি ছাড়া Production Database Reset বা Delete করা যাবে না।
- Database পরিবর্তনের জন্য Migration Script রাখতে হবে।
- প্রতিটি গুরুত্বপূর্ণ ধাপে Backup রাখতে হবে।
- Feature সম্পন্ন হয়েছে বলার আগে বাস্তবে পরীক্ষা করতে হবে।
- Bug ও অসম্পূর্ণ কাজ Progress Report-এ লিখতে হবে।
- Customer-facing Invoice-এ Purchase Price ও Profit প্রকাশ করা যাবে না।
- Financial Calculation-এর Source of Truth হবে Database/Backend-এর যাচাইকৃত হিসাব।

# ৮. Project Progress সংরক্ষণ

প্রতিটি Development Phase শেষে `PROJECT_PROGRESS.md` আপডেট করতে হবে। এতে থাকবে:
- সম্পন্ন Phase ও Module
- তৈরি হওয়া Page ও Feature
- Database Table/Policy/Function-এর অবস্থা
- পরীক্ষার ফলাফল
- বাকি কাজ
- জানা Bug
- সর্বশেষ ZIP/Backup-এর নাম
- GitHub-এর সর্বশেষ Commit
- পরবর্তী নির্দিষ্ট কাজ

# ৯. ভবিষ্যতে কাজ পুনরায় শুরু করার নির্দেশনা

নতুন Conversation-এ কাজ শুরু করার সময়:
1. এই README দিন।
2. সর্বশেষ Project ZIP দিন।
3. `PROJECT_PROGRESS.md` দিন।
4. প্রয়োজন হলে Supabase Schema/Migration/Backup দিন।
5. নিচের নির্দেশনা ব্যবহার করুন:

**RESUME AIR TICKET AGENCY MANAGEMENT PROJECT**

"এই README ও PROJECT_PROGRESS.md অনুসরণ করুন। প্রথমে দেওয়া সর্বশেষ ZIP এবং Database Schema পরীক্ষা করুন। আগের কাজ, সিদ্ধান্ত, সম্পন্ন Feature ও বাকি কাজ বুঝে নিন। বিদ্যমান কাজ নষ্ট করবেন না। Progress অনুযায়ী যে Phase-এ কাজ বন্ধ হয়েছিল, সেখান থেকেই শুরু করুন। আগে সম্পন্ন Feature অকারণে আবার তৈরি করবেন না।"

---

# ১০. চূড়ান্ত লক্ষ্য

একটি নিরাপদ, নির্ভরযোগ্য, বাংলা ভাষার Air Ticket Agency Management Software তৈরি করা, যেখানে Booking, Direct Ticket Sale, Multiple Agency, Customer, Payments, Due, Expenses, Cash/Bank, Refund, Reports, Profit/Loss, Staff Permissions, Invoice এবং Audit History একসঙ্গে পরিচালনা করা যাবে।

**Development Status:** Initial Folder Structure তৈরি। বাকি ফিচারগুলো Roadmap অনুযায়ী ধাপে ধাপে বাস্তবায়ন ও পরীক্ষা করতে হবে।
=======
# Air-Agency
>>>>>>> 367183f9ad464274373a799e16f7ebc4d0933b61
