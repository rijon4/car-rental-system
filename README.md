# 🚗 AutoClip — Car Rental Management System

A full-stack car rental management system built with **Node.js + Express** backend and a rich **vanilla JS/CSS web UI**.

## Features

### Fleet Management (Vehicles)
- Add / edit / delete vehicles (make, model, year, color, license plate, VIN, fuel type, transmission, seats, daily rate, status, mileage)
- Search by make, model, plate, VIN, color, year
- Statuses: `available`, `rented`, `maintenance`, `retired`

### Customer Management
- Add / edit / delete customers (name, email, phone, license number, expiry, class, DOB, driving years)
- License expiry validation at booking time

### Rentals & Bookings
- Create rentals (vehicle + customer + dates + locations + discount %)
- Automatic price calculation: `days × daily rate`, plus tax (default 8%) and discount
- Overlap prevention — a vehicle cannot be double-booked
- Check-out flow (odometer capture, vehicle → `rented`)
- Return flow (late fee calculation, damage charges, mileage update, vehicle → `available`)
- Cancellation flow
- Payment recording (partial / full) with balance tracking

### Dashboard & Reports
- Fleet stats (total, available, rented, maintenance, retired)
- Active rentals with overdue detection
- Revenue this month / outstanding balance / occupancy / avg rental days
- Revenue by period + monthly revenue chart

### Security
- Session-based auth (`POST /api/auth/login` → Bearer token)
- Admin role required for all write operations

## Tech Stack
- Backend: Node.js + Express 5, JSON-file persistence (`data/db.json`)
- Frontend: Static SPA (`public/`) served by Express
- Default admin: **admin / admin123**

## Run

```bash
npm install
npm start
```

Open **http://localhost:3000**

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns token |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/vehicles` | List / create vehicle |
| GET/PUT/DELETE | `/api/vehicles/:id` | Get / update / delete vehicle |
| GET/POST | `/api/customers` | List / create customer |
| GET/PUT/DELETE | `/api/customers/:id` | Get / update / delete customer |
| GET | `/api/rentals` | List rentals (filters: status, customerId, vehicleId) |
| GET | `/api/rentals/:id` | Get rental |
| POST | `/api/rentals` | Create rental |
| POST | `/api/rentals/:id/checkout` | Checkout |
| POST | `/api/rentals/:id/return` | Return (late fee + damages) |
| POST | `/api/rentals/:id/cancel` | Cancel |
| POST | `/api/rentals/:id/payments` | Record payment |
| GET | `/api/reports/summary` | Dashboard summary |
| GET | `/api/reports/revenue?from=&to=` | Revenue report |
| GET | `/api/logs` | Activity logs |

All endpoints except `/api/auth/login` require `Authorization: Bearer <token>`.

## Default Seed Data

- 8 vehicles (various statuses)
- 6 customers
- 3 rentals (1 active, 1 completed, 1 pending)
- 1 payment
