# AI Agent Documentation (Stockastic Frontend)

This project follows Next.js 16.2+ standards. AI agents should adhere to the following architectural guidelines:

## Core Tech Stack
- **Framework**: Next.js 16.2.2 (App Router)
- **Styling**: Tailwind CSS 4.0 (CSS-first engine)
- **UI Components**: Shadcn/UI (Radix primitives)
- **Icons**: Lucide React (v0.56+)

## Architectural Guidelines

### 1. Data Fetching & Server Components
- Use Server Components by default.
- Access `params` and `searchParams` asynchronously:
  ```tsx
  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    // ...
  }
  ```
- Use `React.use()` for client-side unwrapping of promises passed from servers.

### 2. Styling Standards
- Prefer utility classes from Tailwind 4.
- Use `oklch` color tokens defined in `globals.css`.
- For transparency manipulation, use `color-mix(in oklch, var(--color), transparent X%)`.

### 3. State Management
- Use React 19 hooks: `useActionState` (for forms), `useOptimistic`, and `use`.
- Avoid `forwardRef`; pass `ref` as a standard prop.

## Agent Features (v16.2+)
- **Browser Log Forwarding**: Client-side errors are forwarded to the terminal during `npm run dev`.
- **Diagnostics**: Use `next info` for framework-level debugging.
