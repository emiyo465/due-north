# automated-semester-planner
An automated semester planner app for CS267. It extracts assignment, exam, and project deadlines from syllabus PDFs and exports them to your calendar.

## Setup
1. Run `npm install`.
2. Create `.env.local` with `ANTHROPIC_API_KEY=<your key>`. The "Use example syllabus" button works without one.
3. Run `npm run dev` and open http://localhost:3000.

## Scripts
- `npm run dev`: start the dev server
- `npm run build`: production build
- `npm run lint`: ESLint
- `npm test`: Vitest
- `npm run check:extract`: score extraction against the local answer keys (spends API credits)

## Tech Stack
- Next.js + TypeScript framework
- Tailwind and shadcn/ui for UI design system
- react-dropzone for drag-and-drop
- react-pdf for pdf display
- Claude API (`@anthropic-ai/sdk`) for extraction
- Vercel deployments
- Vitest testing
