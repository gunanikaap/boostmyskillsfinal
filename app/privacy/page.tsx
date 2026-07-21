import StaticPage from "@/components/StaticPage";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy Policy">
      <div className="legal">
        <h2>1. Introduction</h2>
        <p>
          Welcome to BoostMySkills (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). We
          provide micro-programmes and micro-credentials in sustainability, renewable energy, smart
          urban solutions, and related fields. Through this Privacy Policy, we explain what personal
          data we collect from you, why we collect it, how we use it, how we protect it, and your
          rights under applicable data protection laws, including the EU GDPR.
        </p>

        <h2>2. Who we are / Contact information</h2>
        <p>
          Organisation: boostmyskills.eu — supported by our partners as listed on the BoostMySkills
          homepage. Email: <a href="mailto:info@boostmyskills.eu">info@boostmyskills.eu</a>.
        </p>

        <h2>3. Scope</h2>
        <p>
          This policy applies whenever you use our website(s), register for courses, sign up for
          newsletters, use self-assessment tools, contact us through forms, or otherwise provide
          personal data to us. It covers users located in the European Economic Area (EEA),
          Switzerland, and any other jurisdictions where we process personal data.
        </p>

        <h2>4. What data we collect</h2>
        <p>We may collect the following categories of personal data:</p>
        <ul>
          <li>
            <strong>Account / registration data:</strong> name, username, email address, password,
            country of residence — provided by you when you create an account, and used to give you
            access to courses, manage your account and send course-related notifications.
          </li>
          <li>
            <strong>Course participation data:</strong> which micro-programmes / micro-credentials
            you enrol in, progress, completion and assessments — collected via platform usage, and
            used to deliver the learning services, manage certificates, track progress and for
            quality assurance.
          </li>
          <li>
            <strong>Newsletter / communication data:</strong> email and possibly name — provided
            when you subscribe, and used to send you newsletters, announcements and updates.
          </li>
          <li>
            <strong>Technical / usage data:</strong> IP address, device / browser type, operating
            system, pages visited, time spent, cookies and analytics data — collected automatically
            for website performance, improving the user experience, diagnosing errors and analytics.
          </li>
          <li>
            <strong>Cookies and tracking:</strong> first-party and third-party cookies, tracking
            pixels and similar trackers — collected automatically to manage sessions, for analytics
            and for social media sharing and embedding.
          </li>
        </ul>

        <h2>5. Legal basis for processing</h2>
        <p>We rely on one or more of the following legal bases:</p>
        <ul>
          <li>
            <strong>Consent</strong> — where required (for cookies, newsletter sign-ups, etc.), we
            ask for your consent.
          </li>
          <li>
            <strong>Performance of a contract / legitimate interest</strong> — to deliver the
            educational services, manage user accounts and send service-related communications.
          </li>
          <li>
            <strong>Legal obligation</strong> — to comply with applicable laws.
          </li>
        </ul>

        <h2>6. How we use your data</h2>
        <p>The data we collect is used for:</p>
        <ul>
          <li>Providing, maintaining and improving our platform and your user experience</li>
          <li>Processing your enrolments, granting certificates and tracking course progress</li>
          <li>Communicating with you (e.g. course info, platform changes, newsletters)</li>
          <li>Security, fraud prevention and ensuring the integrity of our services</li>
          <li>Analytics to understand usage patterns and improve services</li>
          <li>Compliance with legal requirements</li>
        </ul>

        <h2>7. Sharing your data / third parties</h2>
        <p>We may share your personal data with:</p>
        <ul>
          <li>
            <strong>Service providers:</strong> e.g. hosting providers, email/newsletter services,
            analytics tools, and accreditation bodies where relevant.
          </li>
          <li>
            <strong>Partners / educational institutions:</strong> e.g. when courses are co-delivered
            or accreditation is involved (for example Maynooth University).
          </li>
          <li>
            <strong>Legal / regulatory authorities:</strong> where required by law or to protect our
            rights.
          </li>
        </ul>

        <h2>8. International transfers</h2>
        <p>
          If any of the third parties or service providers are outside the EEA (or in a country
          without an adequacy decision from the EU), we ensure that appropriate safeguards are used
          to protect your data.
        </p>

        <h2>9. Data retention</h2>
        <p>
          We retain your personal data only for as long as necessary for the purposes set out in
          this policy, plus any periods needed to comply with legal obligations (e.g. record
          keeping, audits) and — after you stop using our services — for as long as needed for
          record-keeping, resolving disputes, enforcing agreements or responding to legal requests.
          When data is no longer needed, we securely delete or anonymise it.
        </p>

        <h2>10. Cookies and tracking technologies</h2>
        <p>
          We use cookies and other tracking technologies. Some are essential for website function;
          others are for analytics or third-party services. We provide a cookie / tracker banner
          and/or settings so you can consent to or decline non-essential trackers. You can also
          manage cookies via your browser.
        </p>

        <h2>11. Your rights</h2>
        <p>Under GDPR and related laws, you have rights, including:</p>
        <ul>
          <li>Right to access your personal data</li>
          <li>Right to correct inaccurate or incomplete data</li>
          <li>Right to erase your data (right to be forgotten), in certain circumstances</li>
          <li>Right to restrict or object to certain processing</li>
          <li>Right to data portability</li>
          <li>Right to withdraw consent (for processing based on consent)</li>
          <li>Right to lodge a complaint with a supervisory authority</li>
        </ul>
        <p>
          To exercise these rights, contact us using the details above. We may need to verify your
          identity. We&rsquo;ll respond without undue delay, generally within one month (or longer
          if permitted by law).
        </p>

        <h2>12. Security</h2>
        <p>
          We take reasonable technical and organisational measures to protect your data, including
          encryption where appropriate, securing servers, limiting access rights and regularly
          reviewing our security practices. However, no system is 100% secure and we cannot
          guarantee absolute security, so please take care with your passwords.
        </p>

        <h2>13. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time (for example, if our practices change
          or laws are updated). It is your responsibility to check this Privacy Policy periodically
          for changes. Your continued use of the website following the posting of any changes
          constitutes acceptance of those changes.
        </p>

        <h2>14. Contact us</h2>
        <p>
          If you have any questions, or want to exercise your rights, you can reach us at{" "}
          <a href="mailto:info@boostmyskills.eu">info@boostmyskills.eu</a>.
        </p>
      </div>
    </StaticPage>
  );
}
