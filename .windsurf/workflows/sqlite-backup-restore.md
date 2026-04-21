---
description: Backup and restore the SQLite database and receipt files safely for Arunika Finance
---
# SQLite Backup and Restore Workflow

Use this workflow before risky deployments, before schema-sensitive maintenance, and whenever you need a verified rollback point.

## 1. Confirm the active storage path

Determine the active database file path in this order:

1. If `ARUNIKA_DB_FILE` is set, use that exact file.
2. Otherwise, if `ARUNIKA_DATA_DIR` is set, use `<ARUNIKA_DATA_DIR>/arunika.sqlite`.
3. Otherwise, use the default project data path: `data/arunika.sqlite`.

Receipt uploads should be treated as part of the backup set. Their default path is `data/receipts/`.

For Render deployments, verify the persistent disk is mounted at the app `data/` directory before continuing.

## 2. Prepare a safe backup window

1. Choose a maintenance window or a low-write period.
2. Avoid running imports or receipt analysis during the backup.
3. If possible, stop the app briefly before copying the SQLite file.
4. If you cannot stop the app, take an additional verification step after backup and prefer a provider snapshot when available.

## 3. Create the backup directory

Create a timestamped backup folder outside the active app data path.

Recommended naming pattern:

```text
backups/arunika-YYYY-MM-DD-HHMM
```

The backup should contain at least:

- `arunika.sqlite`
- `receipts/`
- a small metadata note with timestamp, environment, and source commit hash

## 4. Run the backup

When the app can be stopped safely:

1. Stop the running application process.
2. Copy the SQLite file to the backup directory.
3. Copy the entire `receipts/` directory to the backup directory.
4. Record the current Git commit hash and deployment identifier in a metadata file.
5. Restart the app.

When the app cannot be stopped:

1. Create the backup anyway.
2. Immediately verify the copied SQLite file exists and is non-empty.
3. Run post-backup smoke checks before relying on that backup.

## 5. Verify the backup before declaring success

Verify all of the following:

- the copied SQLite file exists
- the copied SQLite file size is greater than zero
- the copied `receipts/` directory exists if receipts are used in production
- the backup folder contains the expected timestamp and metadata
- the active app still passes `/api/health`

If any of these checks fail, do not proceed with deployment or restore planning until a valid backup exists.

## 6. Restore procedure

Use this only when rollback or recovery is required.

1. Stop the running application.
2. Create a fresh pre-restore snapshot of the current broken state before replacing anything.
3. Confirm which backup set you are restoring from.
4. Replace the active SQLite file with the selected backup copy.
5. Replace the active `receipts/` directory with the selected backup copy if receipt files are part of the incident scope.
6. Start the application.
7. Run smoke checks:
   - `GET /api/health`
   - sign in with a safe account
   - verify transaction history loads
   - verify a known receipt attachment still opens if receipts are in use
   - verify exports still download

## 7. Post-restore validation

After restore, confirm:

- `chatMode` still reports `local`
- the expected user accounts and transactions are present
- no unexpected migration or initialization behavior occurred
- logs do not show repeated database or file-access errors

## 8. Operational rules

- Never store the only backup copy inside the same active data directory.
- Never restore over production without first taking a pre-restore snapshot.
- Always back up `receipts/` together with the SQLite database when receipt uploads are enabled.
- Treat backup validation as mandatory, not optional.
