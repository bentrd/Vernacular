// Terms of Service and Privacy Policy, rendered as a full-screen page over
// whatever else is on screen (they're reachable signed out, from the welcome
// screen, and signed in, from Settings).

const EFFECTIVE = 'August 1, 2026';
const CONTACT = 'benj.tordjman@gmail.com';

function Terms() {
  return (
    <>
      <h1 className="title">Terms of Service</h1>
      <p className="legal-date">Effective {EFFECTIVE}</p>

      <h2>1. What Verbum is</h2>
      <p>
        Verbum is a small language-learning app: it teaches vocabulary with daily words,
        spaced repetition, and optional push notifications. It is a personal project operated by
        Benjamin Tordjman ("we", "us"). By creating an account or using the app you agree to
        these terms.
      </p>

      <h2>2. Your account</h2>
      <p>
        You sign in with an email link or a Google account; there are no passwords. You are
        responsible for keeping access to your email or Google account secure. Accounts that
        sign in with a Google address are matched to the same account as an email link for that
        address. You must be at least 13 years old to use Verbum.
      </p>

      <h2>3. Your data</h2>
      <p>
        Your learning data (the words you save, review history, streaks, and settings) belongs
        to you. We store it so it can follow you across devices. You can export it as a file,
        and you can delete your account, both from Settings. How we handle data is described in
        the Privacy Policy.
      </p>

      <h2>4. Dictionary content</h2>
      <p>
        Dictionary entries are built from open sources, including WikDict (CC BY-SA) and
        CC-CEDICT (CC BY-SA), with attribution shown in Settings. Dictionary content remains
        under its original licenses.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Don't abuse the service: no attempts to disrupt it, to access other people's data, or
        to use the APIs at volumes a human learner never would. We may suspend accounts that do.
      </p>

      <h2>6. Availability and warranty</h2>
      <p>
        Verbum is provided free of charge, as is, without warranties of any kind. We aim to
        keep it running and your data safe, but we cannot promise uninterrupted service, and we
        are not liable for damages arising from its use, to the maximum extent permitted by
        law. Keeping an export of data you care about is always a good idea.
      </p>

      <h2>7. Ending things</h2>
      <p>
        You can stop using Verbum and delete your account at any time from Settings, which
        removes your data as described in the Privacy Policy. We may terminate or suspend the
        service itself; if we ever do, we will make reasonable efforts to give notice so you
        can export your data.
      </p>

      <h2>8. Changes</h2>
      <p>
        If these terms change in a way that matters, the app will say so before you continue.
        The current version always lives at this page.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1 className="title">Privacy Policy</h1>
      <p className="legal-date">Effective {EFFECTIVE}</p>

      <h2>1. What we collect</h2>
      <p>We keep the minimum the app needs to work:</p>
      <ul>
        <li>
          <strong>Account:</strong> your email address, the name you choose, and your preferred
          translation language. With Google sign-in, Google shares your email and name; we
          store nothing else from your Google account.
        </li>
        <li>
          <strong>Learning data:</strong> the words you save, review results, streaks, daily
          activity counts, and app settings (accent color, goals, and similar).
        </li>
        <li>
          <strong>Push subscriptions:</strong> if you enable notifications, the anonymous
          subscription endpoint your browser generates, linked to your account.
        </li>
      </ul>
      <p>
        There are no ads, no trackers, no analytics SDKs, and we never sell or share your data
        for marketing.
      </p>

      <h2>2. Where it lives</h2>
      <p>Your data is processed by three services on our behalf:</p>
      <ul>
        <li>
          <strong>Neon</strong> (Postgres database and authentication), hosted on AWS in the
          United States.
        </li>
        <li>
          <strong>Vercel</strong> (app hosting and serverless functions).
        </li>
        <li>
          <strong>Google</strong>, only if you choose Google sign-in.
        </li>
      </ul>
      <p>
        A copy of your learning data is also cached on your device (localStorage) so the app
        works offline. Signing out clears that device copy.
      </p>

      <h2>3. What it's used for</h2>
      <p>
        To run the app: signing you in, syncing your words between devices, and sending the
        daily notifications you asked for. Emails are only ever sign-in links; there is no
        newsletter and no marketing.
      </p>

      <h2>4. How long we keep it</h2>
      <p>
        As long as you have an account. Deleting your account from Settings immediately and
        permanently removes your profile, learning data, and push subscriptions from our
        database. Database backups age out within 30 days.
      </p>

      <h2>5. Your rights</h2>
      <p>
        You can access and export your data (Settings, Export), correct it (it's your data to
        edit), and erase it (Settings, Delete account), at any time and without asking us. If
        you are in the EU/EEA, these map to your GDPR rights of access, portability,
        rectification, and erasure; for anything else, including complaints, contact{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>6. Cookies and storage</h2>
      <p>
        We use one session cookie from our authentication service to keep you signed in, plus
        your browser's local storage for the offline copy of your data. Nothing is used to
        track you across other sites.
      </p>

      <h2>7. Changes</h2>
      <p>
        If this policy changes in a way that matters, the app will say so before you continue.
        The current version always lives at this page.
      </p>
    </>
  );
}

export function Legal({ page, onClose }) {
  return (
    <div className="legal-page">
      <header className="legal-bar">
        <button type="button" className="btn ghost small" onClick={onClose}>
          Back
        </button>
      </header>
      <div className="legal-scroll">
        <main className="legal-body">{page === 'privacy' ? <Privacy /> : <Terms />}</main>
      </div>
    </div>
  );
}
