# Package Delivery Configuration

This document explains the per-delivery scheduling feature for packages.

---

## Overview

Admins can now create packages where **each weekly delivery** has:
- **Custom delivery date** (not forced to be 7 days apart)
- **Custom delivery time** (IST)
- **Flexible action selection** (any subset of package actions per delivery)

The package itself has a **Package Activation Time** which serves as a fallback when per-delivery times are not set.

---

## Database Schema

### Tables Modified

#### `package_actions`
Two new columns added:
- `delivery_date DATE` - Specific date for this action's delivery
- `delivery_time TIME` - Specific time for this action's delivery

Both are nullable; if null, the system falls back to computed values.

### Migrations
- `010_package_actions_delivery_date.sql` - Adds `delivery_date` column
- `011_package_actions_delivery_time.sql` - Adds `delivery_time` column

---

## Server Actions

### `createPackage`
Updated to accept:
- `activationTime?: string` - Package activation time (IST), used as fallback
- `deliveryTime?: string` - Backward-compatible alias for `activationTime`

The `packages.delivery_time` column now stores the **package activation time**, not per-delivery time.

### `configurePackageDeliveries` (NEW)
Configures per-delivery schedules and actions:

```typescript
configurePackageDeliveries(
  packageId: string,
  deliveries: {
    weekNumber: number;
    deliveryDate?: string | null;
    deliveryTime?: string | null;
    actionIds: string[];
  }[]
)
```

**Behavior:**
- Deletes existing `package_actions` for the package
- Inserts new rows with per-delivery configuration
- Each action gets `week_number`, `delivery_date`, `delivery_time`, `sort_order`

---

## Client Logic (Engine)

### Visibility Rules (lib/store.tsx)

When loading package assignments, the engine:

1. **Fetches** `package_actions` with:
   - `package_id`, `action_id`, `week_number`, `delivery_date`, `delivery_time`

2. **For each action**, computes **effective date**:
   - If `delivery_date` is set → use it
   - Else → `(scheduled_start_date ?? package.start_date) + 7 * (week_number - 1)` days

3. **For each action**, computes **effective time**:
   - If `delivery_time` is set → use it
   - Else → use `packages.delivery_time` (package activation time)

4. **Checks activation**:
   - Combine `effectiveDate` + `effectiveTime` → convert to UTC via IST
   - If activation is **in the future** → add to `actionIdsInFuturePackages`
   - If activation has **passed** (+1 minute buffer) → add to `actionIdsInAssignedPackages`

5. **Result**:
   - Only actions whose delivery date/time has passed appear in **Strategic Growth**
   - Actions drip per week/delivery according to admin configuration

---

## Admin UI (Control Panel)

### Step 1: Architect Content
- Admin selects actions from the action bank
- Sets package name and skill theme

### Step 2: Pulse Logic (UPDATED)

#### Package-Level Settings
- **Campaign Start Date**: Base date for the package
- **Package Activation Time**: Default time for deliveries (fallback)
- **Duration (Weeks)**: Number of deliveries (e.g., 12 weeks)
- **Frequency**: *Informational only* (not enforced per delivery)

#### Per-Delivery Configuration Grid
For each delivery (week 1..N):
- **Delivery Date** (date picker): Specific date for this delivery
- **Delivery Time** (time picker): Specific time (IST) for this delivery
- **Select Actions** (checkboxes): Which actions go in this delivery
- **Assigned Actions Summary**: Shows selected actions for quick review

**UI Features:**
- When `durationWeeks` changes, delivery configs auto-sync
- New deliveries get default date (start + N*7 days) and package activation time
- Admin can assign multiple actions to one delivery or skip weeks entirely
- Scrollable grid for packages with many weeks

### Step 3: Deploy & Enrol
- Rule of 5 and XP settings (unchanged)
- User enrollment (unchanged)

### Deploy Button
- Validates at least one delivery has actions
- Calls `createPackage` with `activationTime`
- Calls `configurePackageDeliveries` with per-delivery config
- Assigns users to the package

---

## Example Workflow

### Admin Creates a 12-Week Package

1. **Step 1**: Selects 24 actions from the bank
2. **Step 2**:
   - Sets start date: `2026-03-01`
   - Sets activation time: `09:00` (fallback)
   - Sets duration: `12 weeks`
   - For Delivery 1:
     - Date: `2026-03-01`
     - Time: `09:00`
     - Actions: Action A, Action B
   - For Delivery 2:
     - Date: `2026-03-08` (1 week later)
     - Time: `14:00` (different time!)
     - Actions: Action C
   - For Delivery 3:
     - Date: `2026-03-20` (12 days later, not 7!)
     - Time: `09:00`
     - Actions: Action D, Action E, Action F
   - … and so on
3. **Step 3**: Assigns to 50 users, deploys

### User Experience

- **Before 2026-03-01 09:00 IST**: No package actions visible
- **After 2026-03-01 09:00 IST**: Action A, Action B appear in Strategic Growth
- **After 2026-03-08 14:00 IST**: Action C appears
- **After 2026-03-20 09:00 IST**: Action D, E, F appear
- Each user sees actions based on their `scheduled_start_date` + delivery offsets

---

## Testing Checklist

### 1. Apply Migrations
```bash
supabase db push
```

Verify columns exist:
```sql
SELECT delivery_date, delivery_time 
FROM package_actions 
LIMIT 1;
```

### 2. Create Test Package
- Go to Admin → Control Panel
- Step 1: Select 6 actions
- Step 2:
  - Set duration to 3 weeks
  - Configure Delivery 1 with date = today, time = 2 minutes from now, assign 2 actions
  - Configure Delivery 2 with date = tomorrow, time = 09:00, assign 2 actions
  - Configure Delivery 3 with date = 2 days from now, time = 09:00, assign 2 actions
- Step 3: Assign to yourself, deploy

### 3. Verify Visibility
- **Before Delivery 1 time**: No actions visible in Strategic Growth
- **After Delivery 1 time** (+1 minute): 2 actions appear
- **After Delivery 2 time**: 2 more actions appear (total 4)
- **After Delivery 3 time**: Remaining 2 actions appear (total 6)

### 4. Check Database
```sql
SELECT 
  pa.week_number,
  pa.delivery_date,
  pa.delivery_time,
  a.title
FROM package_actions pa
JOIN actions a ON a.id = pa.action_id
WHERE pa.package_id = 'YOUR_PACKAGE_ID'
ORDER BY pa.week_number, pa.sort_order;
```

Should show per-delivery dates/times and correct action assignments.

---

## Key Benefits

✅ **Full flexibility**: Admin can set any date/time per delivery  
✅ **Non-uniform spacing**: Deliveries don't need to be 7 days apart  
✅ **Action control**: Any number of actions per delivery  
✅ **Backward compatible**: Package activation time serves as fallback  
✅ **IST-aware**: All times interpreted in India Standard Time  
✅ **Client-side drip**: No cron needed; visibility computed at page load  

---

## Migration from Old System

**Old behavior** (before this feature):
- Package had one `start_date` and one `delivery_time`
- All actions became visible at `start_date + delivery_time` (IST)
- `week_number` was informational only

**New behavior** (with this feature):
- Each action can have its own `delivery_date` and `delivery_time`
- If not set, falls back to computed date (start + 7*week) and package activation time
- Actions drip according to per-delivery schedule

**Migration path**:
- Existing packages without `delivery_date`/`delivery_time` continue to work
- They use the fallback logic: `start_date` + `packages.delivery_time`
- To enable per-delivery scheduling, admin must edit package and use `configurePackageDeliveries`

---

## Future Enhancements

Possible improvements:
- UI to edit existing package deliveries (currently deploy creates new)
- Preview timeline showing when each action unlocks
- Copy delivery config from one package to another
- Delivery status tracking (how many users have seen each delivery)
- Per-user delivery overrides (advanced scheduling)
