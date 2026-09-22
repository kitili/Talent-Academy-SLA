# Silverleaf Academy LMS - Deployment Guide

## Database Architecture

### Development vs Production
The application uses **Replit's managed PostgreSQL database** which automatically handles:
- ✅ **Automatic environment separation**: Development and Production databases are completely separate
- ✅ **Automatic connection switching**: `DATABASE_URL` automatically points to the correct database based on environment
- ✅ **Data persistence**: All user data, credentials, and application data are permanently stored
- ✅ **Multi-user support**: Changes made by admins are instantly visible to all users

### Current Database Connection
The application connects using `DATABASE_URL` environment variable:
```typescript
// server/db.ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
```

**This means:**
- In development (local testing): Uses development database
- In production (deployed app): Uses production database
- No manual configuration needed - Replit handles this automatically

## Initial Production Setup

### Step 1: Deploy the Application
1. Click the "Publish" button in Replit
2. Wait for deployment to complete
3. Note your production URL (e.g., `https://your-app.replit.app`)

### Step 2: Initialize Production Database
The production database starts empty. You need to create the admin user:

**Option A: Run the initialization script via Shell**
```bash
NODE_ENV=production tsx server/init-db.ts
```

**Option B: Use Replit Console**
1. Open the Replit Console tab
2. Run: `NODE_ENV=production tsx server/init-db.ts`
3. Verify you see "✅ Database initialization complete!"

### Step 3: Verify Admin Access
1. Go to your production URL
2. Login with:
   - Email: `admin@silverleaf.com`
   - Password: `admin123`
3. If login fails, check the console logs and re-run the init script

## Database Schema

The production database will contain:

### Users Table
```sql
- id (UUID, primary key)
- username (unique)
- password (hashed with scrypt)
- email
- firstName, lastName
- role (admin/teacher)
- resetToken, resetTokenExpiry
```

### Training Weeks Table
```sql
- id (UUID, primary key)
- weekNumber
- competencyFocus
- objective
- deckFiles (JSONB array)
```

### Content Items Table
```sql
- id (UUID, primary key)
- weekId (foreign key)
- type (video/file)
- title, url
- orderIndex
- duration, fileSize
```

### Progress Tracking Tables
```sql
deck_file_progress:
- userId, weekId, deckFileId
- status (pending/completed)
- viewingStartTime, completedAt

user_progress:
- userId, contentItemId
- status (pending/in-progress/completed)
- videoProgress, completedAt
```

## Data Persistence Guarantees

### ✅ What is Persisted
- **User Accounts**: All registered users (admin and teachers)
- **Login Credentials**: Securely hashed passwords
- **Training Content**: All weeks, competencies, objectives, files
- **User Progress**: Lesson completion status, viewing time
- **File Uploads**: All uploaded presentations and materials

### ✅ Multi-User Consistency
- Admin uploads a new presentation → **All teachers see it immediately**
- Admin updates objectives → **Changes reflect for all users instantly**
- Teacher completes a lesson → **Progress is saved permanently**

### ✅ No Data Loss Scenarios
- App restarts → Data persists
- Redeployment → Data persists
- Database upgrade → Data persists
- Multiple concurrent users → Data stays consistent

## Environment Variables

The app uses these Replit-managed secrets:

### Database (Automatic)
- `DATABASE_URL` - PostgreSQL connection string (auto-managed)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - Individual DB credentials

### Object Storage (Automatic)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - File storage bucket
- `PUBLIC_OBJECT_SEARCH_PATHS` - Public file paths
- `PRIVATE_OBJECT_DIR` - Private file directory

### Session (Automatic)
- `SESSION_SECRET` - Express session encryption key

**Note**: All these are automatically configured by Replit. No manual setup required.

## Troubleshooting

### Issue: Admin login fails in production
**Solution**: Run the database initialization script:
```bash
NODE_ENV=production tsx server/init-db.ts
```

### Issue: Teachers can't see uploaded files
**Cause**: This is a development vs production database issue
**Solution**: Files uploaded in development don't appear in production. Re-upload files after deployment.

### Issue: Data not saving in production
**Check**: 
1. Verify `DATABASE_URL` is set (it should be automatic)
2. Check console logs for database connection errors
3. Ensure migrations are applied: `npm run db:push`

### Issue: Reset password button not visible
**Cause**: Admin user doesn't exist in production database
**Solution**: Run init script to create admin user

## Admin Credentials

**Default Production Admin:**
- Email: `admin@silverleaf.com`
- Password: `admin123`

⚠️ **Security Note**: Change the admin password immediately after first login using the "Reset User Password" feature.

## Database Migrations

The app uses Drizzle ORM for schema management:

### Apply schema changes to production:
```bash
npm run db:push
```

### Force push (if conflicts occur):
```bash
npm run db:push --force
```

**Note**: The `--force` flag is safe because Drizzle generates proper SQL migrations automatically.

## Monitoring

### Check Database Connection
The init script shows which database you're connected to:
```
📊 Database environment: PRODUCTION
🔗 Database URL starts with: postgresql://...
```

### Verify Data Integrity
1. Login as admin in production
2. Check that training weeks display correctly
3. Test file uploads
4. Verify teacher accounts can register

## Best Practices

1. **Always test in development first** before deploying
2. **Run init script after first deployment** to create admin user
3. **Backup important data** using Replit's database export feature
4. **Monitor production logs** for any database errors
5. **Use admin features** to manage users rather than direct database edits

## Support

If you encounter database issues:
1. Check the application logs in Replit Console
2. Verify all environment variables are set
3. Run the init script to reset admin credentials
4. Contact Replit support for infrastructure issues
