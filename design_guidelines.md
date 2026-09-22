# Silverleaf Academy Training Program Planner - Design Guidelines

## Design Approach
**Brand Identity**: Silverleaf Academy professional branding with deep navy blue primary color
**Purpose**: Internal training program management tool for admins and teachers
**Design Philosophy**: Clean, modern, professional with emphasis on clarity, usability, and brand consistency

## Core Design Elements

### A. Color Palette (Silverleaf Academy Branding)

**Light Mode:**
- Primary: 220 80% 32% (Silverleaf deep navy blue - from logo)
- Primary Foreground: 0 0% 100% (White text on navy)
- Background: 0 0% 98% (Soft off-white)
- Surface/Card: 0 0% 100% (Pure white for cards)
- Text Primary: 220 15% 20% (Dark slate)
- Text Secondary: 220 10% 45% (Medium gray)
- Border: 220 15% 88% (Subtle borders)
- Success: 142 76% 36% (Green for success states)
- Destructive: 0 72% 51% (Red for delete actions)
- Muted: 220 12% 92% (Light gray backgrounds)

**Dark Mode:**
- Primary: 220 75% 55% (Lighter navy for dark mode contrast)
- Primary Foreground: 0 0% 100% (White text)
- Background: 220 18% 12% (Deep dark background)
- Surface/Card: 220 15% 16% (Elevated dark surface)
- Text Primary: 220 15% 95% (Off-white)
- Text Secondary: 220 10% 70% (Light gray)
- Border: 220 15% 25% (Subtle dark borders)

### B. Typography (Premium Upgrade)
- **Primary Font**: 'Poppins' (modern, professional, corporate-grade sans-serif with excellent readability)
- **Font Weights**: 
  - Bold/Headings: 600-700 (Semi-bold to Bold)
  - Body Text: 400-500 (Regular to Medium)
- **Headings**: 
  - Page Title (H1): 2rem (32px), font-weight 700, letter-spacing -0.02em
  - Section Heading (H2): 1.5rem (24px), font-weight 600, letter-spacing -0.02em
  - Card Title (H3): 1.125rem (18px), font-weight 600, letter-spacing -0.02em
- **Body Text**: 1rem (16px), font-weight 400, line-height 1.6
- **Small/Meta**: 0.875rem (14px), font-weight 400
- **Button Text**: 0.9375rem (15px), font-weight 600

**Text Color Hierarchy** (Enhanced Contrast):
- Primary Text: hsl(220 20% 15%) - Near-black for maximum readability
- Secondary Text: hsl(220 15% 30%) - Professional dark gray for supporting content
- Muted Text: hsl(220 10% 45%) - Lighter gray for meta information

### C. Layout System
**Spacing Philosophy**: Generous white space for professional, uncluttered appearance

**Container Spacing**:
- Mobile: p-4 (padding)
- Tablet: p-6
- Desktop: p-8 to p-12 for main container

**Card Spacing**:
- Internal padding: p-6
- Gap between elements: gap-4
- Card margins: mb-4 or gap-4 in grid

**Section Spacing**:
- Between major sections: mt-8 to mt-12
- Between form elements: space-y-4

### D. Component Design Specifications

**Header / Navigation**:
- Background: Navy blue (primary color)
- Height: h-16 (64px)
- White text and icons
- Logo/title on left
- User info and actions on right
- Subtle shadow for depth

**Training Week Cards** (Vertical Accordion):
- Background: White card surface
- Border: 1px solid with subtle border color OR navy blue left border (4px) for accent
- Rounded corners: rounded-lg
- Padding: p-6
- Shadow: subtle shadow-sm, elevated to shadow-md on hover
- Card Header:
  - Week number badge: Navy blue circular badge with white text
  - Competency Focus preview: Primary text weight
  - Action buttons (Edit/Delete): Icon buttons on the right
- Expanded Content:
  - Competency Focus: Clean section with label
  - Objective: Formatted with clear structure, bullet points if multiple items
  - Deck Files: List of clickable files with icons and sizes
  - Upload section: Inline for admins

**Buttons**:
- Primary Action: Navy blue background, white text, rounded-md, px-6 py-2.5
- Secondary: Outline style with navy border, navy text
- Destructive: Red background, white text (for delete actions)
- Icon Buttons: Square (w-9 h-9), rounded-md, hover state
- All buttons: Smooth hover transitions (hover:opacity-90)

**Login/Auth Page**:
- Centered card design (max-w-md)
- Navy blue header section with Silverleaf branding
- White card body with form
- Large, welcoming design
- Primary button for login/register (navy blue)
- Clean tab switching between login/register

**Forms & Inputs**:
- Input fields: Border style, rounded-md, focus:ring-2 focus:ring-primary
- Labels: font-medium text-sm mb-2
- Error states: Red border and error text
- Success states: Green checkmark or success message

**File Upload Interface**:
- Clean, professional appearance
- File list with icons (not large preview boxes)
- Upload button: Navy blue, prominent
- Progress indicators: Navy blue accent color

### E. Interactions & States

**Hover States**:
- Cards: Subtle shadow elevation (shadow-sm → shadow-md)
- Buttons: Slight opacity change (hover:opacity-90)
- Links: Underline or color change

**Active/Focus States**:
- Focus ring: 2px ring with primary color
- Active cards: Slightly elevated, navy blue accent

**Loading States**:
- Skeleton loaders matching component structure
- Navy blue loading spinners

**Empty States**:
- Centered icon/illustration
- Encouraging message
- Primary action button (navy blue)

**Animations**:
- Smooth transitions: 200-300ms ease-in-out
- Accordion expand/collapse: smooth height transition
- Modal open/close: fade + scale

### F. Mobile Responsiveness

**Breakpoints**:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

**Mobile Optimizations**:
- Stack layout for header elements
- Full-width cards
- Touch-friendly button sizes (min-height: 44px)
- Collapsible sections for content
- Hide less critical info on small screens
- Larger tap targets for interactive elements

### G. Accessibility

- Keyboard navigation for all interactive elements
- ARIA labels for icon-only buttons
- Color contrast ratios meeting WCAG AA standards (4.5:1 for text)
- Focus indicators always visible
- Screen reader friendly markup

## Brand Application Guidelines

1. **Consistent Navy Blue Usage**: Use the Silverleaf navy blue for:
   - Main header/navigation
   - Primary action buttons
   - Card accents (left border or header)
   - Focus states and active indicators

2. **White Space**: Embrace generous spacing for professional, clean appearance

3. **Typography Hierarchy**: Use clear font size and weight differences to establish visual hierarchy

4. **Professional Polish**: 
   - Rounded corners (rounded-md to rounded-lg)
   - Subtle shadows for depth
   - Smooth transitions for all interactions
   - Consistent spacing throughout

5. **Mobile-First Approach**: Design works beautifully on mobile, enhanced for desktop

## Visual Hierarchy Principles

1. Navy blue header establishes brand presence at top
2. Training week cards are primary focus - clear, scannable layout
3. Action buttons use color (navy) to indicate primary actions
4. White space creates breathing room and professional feel
5. Subtle borders and shadows for depth without heaviness
6. Typography scale creates clear hierarchy without relying solely on color
