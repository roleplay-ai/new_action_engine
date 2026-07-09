# Timezone Handling: IST Display, UTC Storage

This document explains how the application handles timezones, ensuring IST (India Standard Time) display on the client while storing all times in UTC in the database.

---

## Core Principle

**Client displays in IST, Database stores in UTC**

- ✅ All date/time inputs from users are in IST
- ✅ All date/time displays to users are in IST
- ✅ All database storage is in UTC
- ✅ Conversions happen at the boundary (server actions & client mapping)

---

## Utility Functions

### Location: `lib/timezone-utils.ts`

All timezone conversion utilities are centralized in one file:

#### **IST to UTC Conversion (for storing)**
- `istToUTCDate(istDateStr)` - Convert IST date to UTC date string
- `istToUTCTime(istTimeStr)` - Convert IST time to UTC time string
- `istToUTCDateTime(istDateStr, istTimeStr)` - Convert IST datetime to UTC ISO string

#### **UTC to IST Conversion (for display)**
- `utcToISTDate(utcDateStr)` - Convert UTC date to IST date string
- `utcToISTTime(utcTimeStr)` - Convert UTC time to IST time string
- `utcToISTDateTime(utcISOString)` - Convert UTC ISO string to IST date & time components

#### **Display Formatting**
- `formatISTDate(utcDateStr)` - Format UTC date as IST display (DD/MM/YYYY)
- `formatISTTime(utcTimeStr)` - Format UTC time as IST display with AM/PM

#### **Current Time Helpers**
- `getCurrentISTDate()` - Get current date in IST (YYYY-MM-DD)
- `getCurrentISTTime()` - Get current time in IST (HH:MM)

---

## Server-Side (UTC Storage)

### Package Actions (`app/actions/packages.ts`)

#### `createPackage`
```typescript
// Input: activationTime in IST from admin
const activationTimeIST = params.activationTime ?? params.deliveryTime ?? null;

// Convert to UTC before storing
const activationTimeUTC = activationTimeIST ? istToUTCTime(activationTimeIST) : null;

// Store UTC in database
await supabase.from("packages").insert({
  delivery_time: activationTimeUTC, // Stored in UTC
  // ...
});
```

#### `configurePackageDeliveries`
```typescript
// Input: delivery dates and times in IST from admin
for (const d of deliveries) {
  // Convert IST to UTC before storing
  const deliveryDateUTC = d.deliveryDate ? istToUTCDate(d.deliveryDate) : null;
  const deliveryTimeUTC = d.deliveryTime ? istToUTCTime(d.deliveryTime) : null;
  
  // Store UTC in database
  await supabase.from("package_actions").insert({
    delivery_date: deliveryDateUTC,
    delivery_time: deliveryTimeUTC,
    // ...
  });
}
```

### User Actions (`app/actions/user-actions.ts`)

#### `scheduleAction`
```typescript
// Input: day ("Today"/"Tomorrow") and time in IST from user
function toScheduledAt(day: string, timeIST: string): string {
  const currentISTDate = getCurrentISTDate();
  // ... calculate target date
  
  // Convert IST date + time to UTC ISO string
  return istToUTCDateTime(targetDateStr, timeIST);
}

// Store UTC in database
await supabase.from("user_actions").upsert({
  scheduled_at: scheduledAtUTC, // UTC ISO string
  accepted_at: new Date().toISOString(), // UTC ISO string
  // ...
});
```

---

## Client-Side (IST Display)

### Package Configuration (`components/AdminDashboard.tsx`)

#### Default Values (IST)
```typescript
const [packageConfig, setPackageConfig] = useState({
  startDate: getCurrentISTDate(), // IST date
  activationTime: '09:00', // IST time
  // ...
});
```

#### Delivery Configuration (IST)
```typescript
const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig[]>([]);

// DeliveryConfig stores IST dates and times
type DeliveryConfig = {
  weekNumber: number;
  deliveryDate: string; // IST date (YYYY-MM-DD)
  deliveryTime: string; // IST time (HH:MM)
  actionIds: string[];
};
```

#### UI Labels
All time input fields are labeled with "(IST)" suffix:
- "Package Activation Time IST"
- "Date (IST)"
- "Time (IST)"

### Data Fetching & Display (`lib/store.tsx`)

#### User Actions Mapping (UTC → IST)
```typescript
function mapDbUserAction(row): UserAction {
  // Database returns UTC timestamps
  // Convert to IST for display
  const scheduledIST = row.scheduled_at 
    ? utcToISTDateTime(row.scheduled_at) 
    : null;
  const acceptedIST = row.accepted_at 
    ? utcToISTDateTime(row.accepted_at) 
    : null;
  
  return {
    scheduledDate: scheduledIST?.date, // IST date
    scheduledTime: scheduledIST?.time, // IST time
    acceptedDate: acceptedIST?.date,   // IST date
    acceptedTime: acceptedIST?.time,   // IST time
    // ...
  };
}
```

#### Package Activation Check (UTC)
```typescript
// Database returns UTC times
const timePartUTC = row.delivery_time ?? pkg.delivery_time ?? "03:30:00";

// Create UTC date for activation check
const activation = activationDateUTC(effectiveDate, timePartUTC);

// Compare with current UTC time
const now = Date.now();
if (activation.getTime() > now) {
  // Not yet active
} else {
  // Active
}
```

### User Dashboard (`app/(app)/dashboard-client.tsx`)

Display times with IST label:
```typescript
{ua.scheduledAt ? (
  <p>Scheduled for {ua.scheduledDate} at {ua.scheduledTime} IST</p>
) : ua.acceptedAt ? (
  <p>Accepted on {ua.acceptedDate} at {ua.acceptedTime} IST</p>
) : null}
```

---

## Database Schema

All time columns store **UTC**:

### `packages` table
- `delivery_time` TIME - Package activation time in UTC

### `package_actions` table
- `delivery_date` DATE - Delivery date (date component only, no timezone)
- `delivery_time` TIME - Delivery time in UTC

### `user_actions` table
- `scheduled_at` TIMESTAMPTZ - Scheduled datetime in UTC (with timezone)
- `accepted_at` TIMESTAMPTZ - Accepted datetime in UTC (with timezone)

**Note**: PostgreSQL TIMESTAMPTZ stores in UTC internally and converts based on client timezone. Our code explicitly handles UTC conversion to ensure IST display regardless of client timezone settings.

---

## Testing Scenarios

### Scenario 1: Admin creates package at 09:00 IST
1. Admin selects activation time: `09:00` (IST)
2. Server converts: `09:00 IST → 03:30 UTC`
3. Database stores: `03:30:00` (UTC)
4. User sees package active at: `09:00 IST` (03:30 UTC)

### Scenario 2: Admin configures delivery for tomorrow 14:00 IST
1. Admin selects: Date `2026-03-01`, Time `14:00` (IST)
2. Server converts: `14:00 IST → 08:30 UTC`
3. Database stores: `2026-03-01`, `08:30:00` (UTC)
4. Actions become visible at: `14:00 IST on 2026-03-01`

### Scenario 3: User schedules action for "Today" at 17:00 IST
1. User selects: "Today", Time `17:00` (IST)
2. Server calculates IST date: `2026-03-01`
3. Server converts: `2026-03-01 17:00 IST → 2026-03-01T11:30:00.000Z` (UTC)
4. Database stores: `2026-03-01T11:30:00.000Z` (UTC)
5. User dashboard shows: "Scheduled for 2026-03-01 at 17:00 IST"

### Scenario 4: User in different timezone views action
1. Database has: `scheduled_at = 2026-03-01T11:30:00.000Z` (UTC)
2. Browser timezone: Any timezone (e.g., US Pacific)
3. Our code converts: `11:30 UTC → 17:00 IST`
4. User sees: "Scheduled for 2026-03-01 at 17:00 IST" ✅ Correct!

---

## Migration Notes

### Existing Data
If you have existing data with times in other formats:
1. Identify which times are in IST vs UTC
2. Run migration script to convert IST → UTC for storage
3. Example migration:
```sql
-- Convert IST times to UTC (subtract 5h 30m)
UPDATE packages 
SET delivery_time = (delivery_time::time - interval '5 hours 30 minutes')::time
WHERE delivery_time IS NOT NULL;

UPDATE package_actions 
SET delivery_time = (delivery_time::time - interval '5 hours 30 minutes')::time
WHERE delivery_time IS NOT NULL;
```

### New Installations
All times are handled correctly from the start - no migration needed.

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Using browser's local timezone
```typescript
// BAD: Uses browser's local timezone
const date = new Date(utcTimestamp);
const hours = date.getHours(); // Wrong! Depends on browser timezone
```

```typescript
// GOOD: Convert to IST explicitly
const istDateTime = utcToISTDateTime(utcTimestamp);
const hours = istDateTime.time.split(':')[0]; // Correct! Always IST
```

### ❌ Pitfall 2: Storing IST directly in database
```typescript
// BAD: Storing IST time directly
await supabase.from("packages").insert({
  delivery_time: "09:00", // IST - Wrong!
});
```

```typescript
// GOOD: Convert to UTC before storing
const utcTime = istToUTCTime("09:00");
await supabase.from("packages").insert({
  delivery_time: utcTime, // UTC - Correct!
});
```

### ❌ Pitfall 3: Forgetting to label times as IST
```typescript
// BAD: User might think it's their local time
<label>Time</label>
<input type="time" value={time} />
```

```typescript
// GOOD: Clearly indicate IST
<label>Time (IST)</label>
<input type="time" value={time} />
<p className="text-xs">Scheduled for {date} at {time} IST</p>
```

---

## IST Offset Reference

- **IST**: UTC+5:30 (330 minutes ahead of UTC)
- **Example conversions**:
  - `09:00 IST = 03:30 UTC`
  - `14:00 IST = 08:30 UTC`
  - `00:00 IST = 18:30 UTC (previous day)`
  - `23:59 IST = 18:29 UTC (same day)`

---

## Summary Checklist

For any new date/time feature:

**Admin Input**
- [ ] Input fields labeled "(IST)"
- [ ] Default values use `getCurrentISTDate()` / `getCurrentISTTime()`
- [ ] Form submissions convert IST → UTC via `istToUTC*` functions
- [ ] Server actions receive IST, convert to UTC before DB insert

**User Input**
- [ ] Time pickers labeled or documented as IST
- [ ] Conversion to UTC happens in server actions
- [ ] Database receives UTC timestamps

**Display**
- [ ] UTC values from DB converted to IST via `utcToIST*` functions
- [ ] Display includes "IST" label or tooltip
- [ ] No reliance on browser's local timezone

**Database**
- [ ] All TIME/TIMESTAMPTZ columns store UTC
- [ ] DATE columns store date only (no timezone confusion)

By following these patterns, the application maintains consistent IST display for Indian users while properly storing all times in UTC for global compatibility and correctness.
