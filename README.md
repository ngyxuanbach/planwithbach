# Bach (Oscar) Nguyen — Personal Financial Education Website

This project is a responsive educational website with:

- Plain-language retirement readiness and insurance concept education
- An interactive financial readiness checklist that stores nothing
- A contact form that saves submitted contact information to a local SQLite database
- An admin-protected JSON endpoint and CSV export
- Clear independent-site and educational-use disclosures

## Run locally

Requires Node.js 22.5 or later.

```bash
npm start
```

Open `http://localhost:3000`.

## Set the private admin key before deployment

macOS/Linux:

```bash
ADMIN_KEY="replace-with-a-long-random-secret" npm start
```

Windows PowerShell:

```powershell
$env:ADMIN_KEY="replace-with-a-long-random-secret"
npm start
```

View submissions:

`/api/submissions?key=YOUR_ADMIN_KEY`

Download CSV:

`/api/submissions.csv?key=YOUR_ADMIN_KEY`

## Data and deployment

Submissions are stored at `data/contacts.sqlite`. Use hosting that supports Node.js and persistent disk storage. Static-only hosting such as GitHub Pages cannot run the database-backed form.

Use HTTPS in production. Restrict access to the admin endpoints, back up the database securely, and publish a privacy notice describing what is collected, why it is collected, retention, and contact procedures.

## Important review note

The copy is written to emphasize general education rather than product promotion. It avoids quotes, applications, individualized recommendations, and guaranteed-outcome language. This is not a legal or regulatory approval. Before public release, obtain advice from a qualified New York insurance/compliance professional regarding the final content, your licensing status, employer agreements, data privacy obligations, and how the site will actually be used.
