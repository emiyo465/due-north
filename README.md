<p align="center"><img src="brand/due-north-logo.svg" width="96" alt="Due North logo"></p>

<h1 align="center">Due North</h1>

**Try it:** [due-north-planner.vercel.app](https://due-north-planner.vercel.app)

At the start of every semester, students go through the tedious process of reading through each syllabus, noting down the class schedule, and typing it into a calendar manually. With Due North, that's all done for you: upload your syllabus PDFs and it finds the project, paper, quiz, and exam dates, shows you where each one came from, and sends them to your calendar. The whole thing takes under three minutes.

## Tech stack

- **Next.js and TypeScript** for the website and its small server
- **Tailwind CSS and shadcn/ui** for the design, with light and dark themes
- **PDF.js** (through react-pdf) to show the syllabus and read its text in your browser
- **Claude Haiku 5.5** to find the dates and course details in that text
- **Google sign-in and the Google Calendar API** for direct export
- **Vercel** for hosting

## How to use it

1. **Set the first day of the term.** This is how the app works out dates written like "Week 5, Friday" or dates missing a year.
2. **Add your syllabi.** Drag and drop one or more PDFs, choose them from your files, or click **Use example syllabus** to try it out. A progress bar shows each file as it's processed, and the results open on their own when they're done.

   > **Privacy:** your PDFs never leave your browser. The app reads their text on your device and sends only that text to find the dates. Nothing is stored, so reloading the page clears your work.

3. **Review the dates.** Each syllabus gets its own tab, named after the course.
   - **Class info** lists the course name, instructor, meeting times, office location, and office hours. You can edit, remove, or add any of them.
   - **Key dates** lists every deadline, color-coded by type (exam, quiz, project, paper, homework, other). Select one to jump to the highlighted spot in the PDF.
   - Dates the app is less sure of are marked **Verify**. Check them against the highlight, then mark them verified or edit them. You can also delete dates or add ones it missed.
4. **Export.** Click **Export dates** at the end of the list and pick where they should go.

## Export options

| Option | What you get |
|---|---|
| **Google Calendar** | Sign in with Google and the dates go straight into a new calendar named "Due North", so you can remove them all at once by deleting that calendar. The app can only create and fill its own calendars; it can't see your others. |
| **Apple Calendar** | A calendar file (.ics) that opens in Calendar. |
| **Calendar file (.ics)** | The same file, for Outlook or any other calendar app. |
| **Plaintext** | A .txt list of your dates, for notes apps or anywhere else. |

The calendar exports have two options:

- **Show deadlines as all-day events** (on by default). Deadlines sit at the top of the day, with the due time in the notes. Exams and quizzes keep their times.
- **Include class meeting times** (off by default). Adds each course's weekly classes as repeating events through the last day of class, skipping days off. You can change the end date and add the instructor and office hours to each class's notes.

Dates with no day (for example "TBD") are left out, and the export screen tells you how many.

> **Note:** Google hasn't verified the app yet, so you will see a warning screen when exporting to Google Calendar, which requires you to login with your Google account. It won't affect the quality of the output to Google Calendar, nor will Due North have read access to your data.
