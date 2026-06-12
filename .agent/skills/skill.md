# Development Guidelines & Rules

Welcome to the development rules for **antiggravate**. Follow these steps and constraints strictly to maintain consistency across the backend and frontend codebases.

---

## Backend Development Rules

When working on backend code, always follow these specific steps and structural requirements:

### 1. Project Directory Structure
* All backend-related code **must** reside strictly within the root `backend/` directory.

### 2. Production-Grade Architecture
* Organize the codebase to meet production-ready standards.
* **Database & Schemas:** All database models, ORM definitions, and schemas must always be stored inside the `models/` folder. 

---

##  Frontend Development Rules

When building or updating the user interface, adhere to the following rules:

### 1. Project Directory Structure
* All frontend-related code **must** reside strictly within the root `frontend/` directory.

### 2. UI Layout Constraints
* **No Redundant Page Titles:** Never hardcode or explicitly render a page title text element (such as writing "Settings" at the top of the settings page) inside individual page components. Keep layouts clean and contextual.

### 3. Build Constraints
* **No Manual Builds:** Never execute the `npm run build` command yourself during development.

### 4. Alway use custome conformation alert not use browser conformation alert.
* **use:**@shared/components/ui/alert-dialog.tsx`` for conformation alert.

### 5. UI/UX Rules:
* **Consistent Styling:** Always use a consistent and professional color scheme and typography across the application. Adhere to the existing design system and component library (e.g., Tailwind CSS, Mantine, or your project's specific design tokens). Avoid introducing new, unharmonized styles.
* **Mobile-First Approach:** Design with mobile devices in mind first, then scale up for tablets and desktops using responsive design principles. Ensure all layouts adapt gracefully to different screen sizes.
* **Focus on Clarity:** Keep interfaces clean and uncluttered. Use white space effectively to improve readability and reduce cognitive load. Ensure important information and actions are prominent and easy to find.
* **Accessibility:** Follow accessibility best practices, including proper color contrast, keyboard navigation support, and ARIA labels where necessary. Make sure interactive elements are clearly distinguishable and provide appropriate feedback to user actions.
* **Loading States:** Implement clear loading states (e.g., spinners, skeleton screens) for asynchronous operations like data fetching or form submissions. This prevents user confusion and improves perceived performance.
* **Error Handling:** Provide user-friendly error messages that explain what went wrong and suggest solutions. Avoid displaying raw error messages or technical jargon that may be confusing to end-users.
* ***Card design:** make all cards boarder round corner 1px 
### 6. API & Data Rules:
* **API Usage:** Always interact with the backend or external APIs through the provided API layer or client. Never make direct API calls from components. Ensure proper error handling and request validation.
* **Data Formatting:** Format data in a user-friendly way before displaying it. This includes dates, currencies, percentages, and other structured data types. Use appropriate formatting libraries or utilities to ensure consistency.
* **State Management:** Use the application's state management solution (e.g., Redux, Zustand, Context API) to manage application data. Avoid storing large amounts of data in local component state, especially if it needs to be shared across components.
* **Data Validation:** Validate all user input and API responses to ensure data integrity. Implement client-side validation to provide immediate feedback to users and prevent invalid data from being submitted. Use server-side validation for security and data consistency.

### 7. Performance & Optimization Rules:
* **Lazy Loading:** Implement lazy loading for route components and heavy components (e.g., charts, maps, large data tables) to improve initial page load times.
* **Code Splitting:** Use code splitting to break down large bundles into smaller, more manageable chunks that can be loaded on demand.
* **Memoization:** Use memoization techniques (e.g., `React.memo`, `useMemo`, `useCallback`) to prevent unnecessary re-renders and improve performance, especially in components that render frequently or process large datasets.
* **Pagination:** For large lists of items, implement pagination or infinite scrolling to optimize performance and reduce memory usage. Avoid loading all items at once.
* **Efficient Data Fetching:** Use efficient data fetching strategies, such as caching, debouncing, and request de-duplication, to minimize API calls and improve response times.

### 8. Security Rules:
* **Input Validation:** Always validate and sanitize user input on both the client and server to prevent security vulnerabilities like XSS (Cross-Site Scripting) and SQL injection.
* **Authentication & Authorization:** Always enforce proper authentication and authorization checks for all sensitive operations. Use the existing auth system and follow security best practices.
* **Secure Storage:** Avoid storing sensitive information (e.g., API keys, user credentials) in client-side code or local storage. Use secure storage mechanisms like environment variables, secure cookies, or backend-managed storage.
* **Dependency Security:** Keep all dependencies up-to-date and regularly scan for security vulnerabilities using tools like `npm audit`.