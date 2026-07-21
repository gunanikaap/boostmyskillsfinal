import StaticPage from "@/components/StaticPage";

export const metadata = { title: "Website Terms and Conditions" };

export default function TermsPage() {
  return (
    <StaticPage title="Website Terms and Conditions">
      <div className="legal">
        <h2>1. Introduction</h2>
        <p>
          Welcome to BoostMySkills (&ldquo;the Website&rdquo;). These Terms and Conditions govern
          your use of the Website and the services provided by BoostMySkills (&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;), including but not limited to online training
          courses, tutorials, and educational materials. By accessing or using our Website, you
          agree to be bound by these Terms and Conditions. If you do not agree with any part of
          these terms, you must not use our Website.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          By using this Website, you represent and warrant that you are at least 18 years old or are
          accessing the Website under the supervision of a parent or guardian. You agree to comply
          with all applicable laws and regulations regarding your use of the Website.
        </p>

        <h2>3. Account Registration</h2>
        <p>
          To access certain features of the Website, you will be required to register for an
          account. You agree to provide accurate, current, and complete information during the
          registration process and to update such information as necessary. You are responsible for
          safeguarding your account credentials and for any activities or actions under your
          account.
        </p>

        <h2>4. Use of the Website</h2>
        <p>
          You agree to use the Website only for lawful purposes. You must not use the Website in any
          way that:
        </p>
        <ul>
          <li>Violates any applicable local, national, or international law or regulation.</li>
          <li>Is unlawful or fraudulent, or has any unlawful or fraudulent purpose or effect.</li>
          <li>
            Attempts to gain unauthorized access to the Website, the server on which the Website is
            stored, or any server, computer, or database connected to the Website.
          </li>
          <li>Harms or attempts to harm minors in any way.</li>
        </ul>

        <h2>5. Intellectual Property Rights</h2>
        <p>
          All content included on the Website — such as text, graphics, logos, images, audio clips,
          digital downloads, data compilations, and software — is the property of
          BoostMySkills&rsquo; content suppliers and is protected by international copyright laws.
          The compilation of all content on this Website is the exclusive property of BoostMySkills
          contributors and protected by international copyright laws. You may not copy, reproduce,
          republish, upload, post, transmit, or distribute any content from the Website in any way
          without our prior written permission. You are granted a limited, non-exclusive,
          non-transferable, and revocable license to access and use the Website for personal,
          non-commercial purposes.
        </p>

        <h2>6. Course Enrollment and Access</h2>
        <p>
          When you access a course from the Website, you are granted a limited, non-exclusive,
          non-transferable, and revocable license to access and use the course for your personal,
          non-commercial use. This license is subject to these Terms and Conditions and the
          course-specific terms that may be presented at the time of purchase. Courses are delivered
          through online streaming and are not downloadable unless explicitly stated. Access to
          courses may be time-limited, and access may be revoked if these Terms and Conditions are
          violated.
        </p>

        <h2>7. Payment and Refunds</h2>
        <p>Courses are offered free of charge.</p>

        <h2>8. User-Generated Content</h2>
        <p>
          Where users can post content on the Website — such as comments, reviews, or forum posts —
          by posting content you grant BoostMySkills a worldwide, perpetual, irrevocable,
          royalty-free, and transferable license to use, reproduce, distribute, prepare derivative
          works of, display, and perform that content in connection with the Website and our
          business. You represent and warrant that:
        </p>
        <ul>
          <li>
            You own or have the necessary rights to use and authorize us to use all intellectual
            property rights in any content that you post.
          </li>
          <li>
            Your content does not infringe any third party&rsquo;s intellectual property rights,
            privacy, publicity, or other personal or proprietary rights.
          </li>
          <li>
            Your content is not defamatory, libelous, obscene, hateful, or otherwise unlawful.
          </li>
        </ul>

        <h2>9. Termination</h2>
        <p>
          We reserve the right to terminate or suspend your account and access to the Website, with
          or without notice, for any reason, including but not limited to breach of these Terms and
          Conditions.
        </p>

        <h2>10. Disclaimers and Limitation of Liability</h2>
        <p>
          The Website and the services provided are provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. We do not warrant that the Website will be uninterrupted, secure,
          or error-free. To the fullest extent permitted by law, we disclaim all warranties, express
          or implied, including but not limited to implied warranties of merchantability and fitness
          for a particular purpose. We do not warrant that the Website, content, or services will
          meet your requirements. In no event shall we be liable for any indirect, incidental,
          special, consequential, or punitive damages — including but not limited to loss of
          profits, data, use, goodwill, or other intangible losses — resulting from your access to
          or use of, or inability to access or use, the Website.
        </p>

        <h2>11. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless BoostMySkills&rsquo; affiliates,
          officers, employees, and agents from and against any and all claims, damages, obligations,
          losses, liabilities, costs, or debt, and expenses (including attorney&rsquo;s fees)
          arising from:
        </p>
        <ul>
          <li>Your use of and access to the Website;</li>
          <li>Your violation of any term of these Terms and Conditions;</li>
          <li>
            Your violation of any third-party right, including without limitation any intellectual
            property, privacy, or other personal or proprietary right.
          </li>
        </ul>

        <h2>12. Governing Law and Jurisdiction</h2>
        <p>
          These Terms and Conditions shall be governed by and construed in accordance with the laws
          of Ireland, without regard to its conflict of law provisions. You agree to submit to the
          personal jurisdiction of the courts located within Ireland for the purpose of litigating
          all such claims or disputes.
        </p>

        <h2>13. Changes to the Terms and Conditions</h2>
        <p>
          We reserve the right, at our sole discretion, to modify or replace these Terms and
          Conditions at any time. Any changes will be effective immediately upon posting on the
          Website. It is your responsibility to check these Terms and Conditions periodically for
          changes. Your continued use of the Website following the posting of any changes
          constitutes acceptance of those changes.
        </p>

        <h2>14. Contact Information</h2>
        <p>
          If you have any questions about these Terms and Conditions, please{" "}
          <a href="mailto:info@boostmyskills.eu">contact us</a>.
        </p>
      </div>
    </StaticPage>
  );
}
