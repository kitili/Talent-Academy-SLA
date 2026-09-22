# Silverleaf Academy Training Program Planner

## Overview
A web application designed for Silverleaf Academy to efficiently organize and manage their teacher training program. The application provides a professional, modern user experience, featuring the academy's navy blue branding, a clean collapsible card interface for training weeks, and robust role-based access control. Its core purpose is to allow administrators to manage training week details, including competency focus, objectives, and associated presentation files, while providing teachers with view-only access to these resources. The project aims to streamline the training program's administration and accessibility.

## User Preferences
- Clean, modern UI with vertical card layout
- Username/password authentication (no external auth providers)
- Role-based access control with manual admin creation for security
- Public teacher registration for easy onboarding
- Responsive design for all devices
- Keyboard accessibility for all interactions
- Dark mode support

## System Architecture
The application is built with a modern web stack, emphasizing a clean UI/UX and robust backend.

### UI/UX Decisions
- **Branding**: Utilizes Silverleaf Academy's official logo blue (#0A48A5 / HSL: 216 89% 34% in light mode, 216 89% 45% in dark mode) as the primary color throughout the entire application. Features a professional and clean design, generous white space, and the Poppins/Inter font family. The Silverleaf Academy logo (leaf icon) is prominently displayed in all interface headers. All backgrounds, navigation bars, buttons, accents, borders, shadows, and UI elements consistently use this unified blue palette.
- **Consistent Header Design**: All interfaces (Admin, Teacher, Trainer) feature the same branded header with:
  - Silverleaf Academy logo and name
  - Primary blue background (bg-primary)
  - White text for high contrast
  - Theme toggle and logout buttons
  - User information display
- **Layout**: Features a vertical collapsible accordion card interface for organizing training weeks, enhancing content readability and navigability.
- **Visuals**: Incorporates enhanced file previews, including PDF thumbnail generation and distinct icons for PowerPoint, Word, and Excel files.
- **Accessibility**: Designed for full keyboard navigation and includes a dark mode toggle.
- **Responsiveness**: Fully responsive across desktop, tablet, and mobile devices, with adaptive layouts and element visibility.

### Technical Implementations
- **Frontend**: Developed with React, TypeScript, Tailwind CSS for styling, and Shadcn UI for componentry. Uses React Query for data fetching and caching.
- **Backend**: Implemented using Express.js with TypeScript, providing a RESTful API.
- **Authentication**: Utilizes Passport.js Local Strategy for secure username/password authentication. Passwords are hashed with scrypt. Features role-based access control (Admin/Trainer/Teacher) with session management stored in PostgreSQL. Admin and Trainer can login with username or email; Teachers can login with Teacher ID or email.
- **Multi-Role Support**: The same email address can have multiple roles (e.g., user can be both admin and trainer, or admin and teacher). When logging in with an email that has multiple roles, a role picker dialog appears allowing the user to select which role to use for the session. Role verification uses a 5-minute TTL session cache for security.
- **File Management**: Supports file uploads via Uppy.js, storing files in Replit Object Storage (Google Cloud Storage) with presigned URLs for secure access. Allows for multiple deck files per training week.
- **Inline Editing**: Provides click-to-edit functionality for key fields for admin users, with optimized cache updates for a smooth user experience.

### Data Integrity Constraints
- **Course Assignment Uniqueness**: Database enforces unique constraint on `(batch_id, course_id)` in batch_courses table. This guarantees each course can be assigned to a batch only once, preventing duplicates at the database level.
- **Duplicate Prevention**: Multiple layers prevent course duplicate assignments:
  - Database-level unique constraint (primary defense)
  - Application-level validation in `assignCourseToBatch` method (secondary defense)
  - Backend deduplication in teacher assigned courses using `getCoursesForTeacher` method

### Feature Specifications
- **Training Week Management**: Admins can add, edit, and delete training weeks, including competency focus, objectives, and presentation files.
- **Role-Based Access Control**: Three user roles with distinct permissions:
  - **Admins**: Full CRUD capabilities for training content and user management. After login, directed to home page with editable week management.
  - **Trainers**: Can create batches, assign teachers to batches, assign quizzes, and track teacher progress. After login, directed to home page showing training weeks overview. Can navigate to batch management via "Manage Batches" button in header.
  - **Teachers**: Can view assigned quizzes, take assessments, and track their own progress. After login, directed to teacher dashboard with quiz assignments and progress tracking.
- **Batch Management**: 
  - **Admin Workflow**: Admin creates batches, assigns a trainer and a course to each batch from the Cohorts tab in the admin dashboard
  - **Trainer Scope**: Trainers can only see and manage batches assigned to them (filtered by trainerId)
  - Trainers can add/remove teachers from their assigned batches using numeric Teacher ID
  - Trainers can assign AI-generated quizzes to their batches
  - View detailed progress reports for all teachers in a batch
  - Track quiz completion rates, average scores, and skill levels
- **Teacher Dashboard**:
  - View assigned quizzes with detailed descriptions
  - Take quizzes with multiple-choice and true/false questions
  - Track personal progress with skill level badges (Beginner, Intermediate, Advanced)
  - View quiz history and performance statistics
- **Admin Password Reset**: Admins can reset any user's password through a dedicated UI dialog with proper validation and security.
- **File Handling**: Uploads of common presentation formats (PowerPoint, PDF, Keynote) are supported, with enhanced visual previews.
- **Progress Tracking**: 
  - Files are marked as complete only when users navigate to the last page/slide
  - Progress counter shows only deck files (e.g., "1 of 1 completed" for a week with 1 file)
  - Quizzes are tracked separately and do not count toward the main progress percentage
  - Visual indicators show when the last page is reached, and progress bars update accordingly
- **Automatic Certificate Generation**:
  - Certificates are automatically generated when a teacher completes 90% or more of their assigned course
  - Requires an approved certificate template to be configured for the batch/course
  - Course completion is tracked per teacher/batch/course combination
  - Completion status is updated immediately when 90% threshold is reached
  - Certificate info is returned in the quiz submission response for frontend notification
- **Enhanced Slide Viewer**:
  - **Persistent Floating Controls**: Navigation controls (Previous/Next, Zoom, page numbers) float at the bottom of the screen and remain visible at all times, even when zoomed in or in fullscreen mode
  - **Direct Page Navigation**: Users can type a page number directly into the input field to jump to any slide instantly, eliminating the need to click "Next" repeatedly
  - **Smart Table of Contents**: Automatically extracts headings from PDF and PowerPoint files during upload to create a clickable table of contents
    - Desktop: ToC appears in a collapsible side panel for easy navigation
    - Mobile/Fullscreen: ToC accessible via dedicated button that opens a drawer
    - One-click navigation to any page/slide in the document
    - Current page highlighted in ToC for orientation
  - **Mobile-Optimized**: Controls work seamlessly across desktop, tablet, and mobile devices with responsive touch-friendly design

### Navigation Structure
- **Login Redirects**:
  - Admins and Trainers → Home page (`/`) showing training weeks overview
  - Teachers → Teacher dashboard (`/teacher/dashboard`) with quiz assignments and progress
- **Trainer Navigation**:
  - **Home Page** (`/`): Default landing page showing all training weeks in card format. Header includes "Manage Batches" button to access batch management features.
  - **Batch Management** (`/trainer/batches`): Accessible via "Manage Batches" button. Includes "Home" button in header to return to training weeks overview.
  - This two-page flow ensures trainers always start with the high-level training content overview before diving into batch-specific management tasks.

### System Design Choices
- **Database**: PostgreSQL is used as the primary data store, with Drizzle ORM for type-safe database interactions. Sessions are also stored in PostgreSQL.
- **Project Structure**: Organized into `client/`, `server/`, and `shared/` directories for clear separation of concerns.

## External Dependencies
- **Database**: PostgreSQL (specifically Neon for deployment)
- **ORM**: Drizzle ORM
- **Authentication**: Passport.js (Local Strategy), connect-pg-simple (for PostgreSQL session storage)
- **File Storage**: Replit Object Storage (backed by Google Cloud Storage)
- **File Upload Library**: Uppy.js with AWS S3 plugin (for interacting with Replit Object Storage)
- **UI Framework**: Shadcn UI
- **Styling**: Tailwind CSS
- **PDF Previews**: react-pdf library
- **Text Extraction**: officeparser library (for extracting headings from PDF/PPTX files for Table of Contents)

## Deployment & Database Management

### Database Architecture
- **Development vs Production**: Replit automatically manages separate databases for development and production environments
- **Connection String**: `DATABASE_URL` environment variable automatically switches between dev/prod databases based on `NODE_ENV`
- **Data Persistence**: All user credentials, training content, and progress data are permanently stored in PostgreSQL
- **Multi-User Consistency**: Changes made by admins are instantly visible to all users across all sessions

### Production Database Setup
1. **Initial Deployment**: After first deployment, run the database initialization script:
   ```bash
   NODE_ENV=production tsx server/init-db.ts
   ```
2. **What It Does**:
   - Creates/updates the admin user with username `admin`, email `admin@silverleaf.com`, and password `admin123`
   - Verifies database connection and environment
   - Ensures proper password hashing with scrypt
3. **Verification**: Login to the deployed app with admin credentials to confirm setup

### Database Initialization Script
- **Location**: `server/init-db.ts`
- **Purpose**: Ensures admin user exists with correct credentials in production
- **Features**:
  - Automatically detects environment (development/production)
  - Creates admin user if missing
  - Updates admin password if user exists
  - Logs database connection details for verification

### Admin Credentials
- **Username**: admin
- **Email**: admin@silverleaf.com  
- **Default Password**: admin123
- **Login**: You can use either "admin" (username) or "admin@silverleaf.com" (email) to login
- **Security Note**: Change password immediately after first login using the "Reset User Password" feature

### Environment Variables (Auto-Managed by Replit)
- `DATABASE_URL` - PostgreSQL connection (switches dev/prod automatically)
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - File storage bucket ID
- `PUBLIC_OBJECT_SEARCH_PATHS` - Public file paths
- `PRIVATE_OBJECT_DIR` - Private file directory
- `SESSION_SECRET` - Express session encryption key

### Database Tables
All tables are now migrated. The following tables were added manually (not via drizzle-kit push):
- `attendance_records` - Teacher session attendance tracking
- `teacher_goals` - Self-reflection goal tracking per teacher
- `alert_rules` - Configurable performance/attendance alert thresholds
- `notifications` - In-app notification system (trainers, teachers, admins)
- `scheduled_events` - Calendar events linked to batches

### Troubleshooting
- **Issue**: Admin login fails in production
  - **Solution**: Run `NODE_ENV=production tsx server/init-db.ts` to initialize/fix admin user
- **Issue**: Reset Password button not visible in deployed app
  - **Cause**: Admin user doesn't exist in production database
  - **Solution**: Run initialization script to create admin user
- **Issue**: Files uploaded in development don't appear in production
  - **Cause**: Separate databases mean separate data
  - **Solution**: Re-upload files after deployment or use database export/import
- **Issue**: `drizzle-kit push` asks about renaming `user_progress` to `alert_rules`
  - **Cause**: `user_progress` is an old legacy table still in the DB but not in the schema
  - **Solution**: The missing tables were created manually via SQL; select "No, skip renaming" if prompted

See `DEPLOYMENT.md` for complete deployment guide and best practices.