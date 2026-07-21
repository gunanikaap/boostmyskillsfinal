import StaticPage from "@/components/StaticPage";

export const metadata = { title: "Cookie Policy" };

export default function CookiePolicyPage() {
  return (
    <StaticPage title="Cookie Policy">
      <div className="legal">
        <p>
          This document informs Users about the technologies that help this Website to achieve the
          purposes described below. Such technologies allow BoostMySkills to access and store
          information (for example by using a Cookie) or use resources (for example by running a
          script) on a User&rsquo;s device as they interact with this Website.
        </p>
        <p>
          For simplicity, all such technologies are defined as &ldquo;Trackers&rdquo; within this
          document — unless there is a reason to differentiate. For example, while Cookies can be
          used on both web and mobile browsers, it would be inaccurate to talk about Cookies in the
          context of mobile apps as they are a browser-based Tracker. For this reason, within this
          document, the term Cookies is only used where it is specifically meant to indicate that
          particular type of Tracker.
        </p>
        <p>
          Some of the purposes for which Trackers are used may also require the User&rsquo;s
          consent. Whenever consent is given, it can be freely withdrawn at any time following the
          instructions provided in this document. This Website uses Trackers managed directly by
          BoostMySkills (so-called &ldquo;first-party&rdquo; Trackers) and Trackers that enable
          services provided by a third-party (so-called &ldquo;third-party&rdquo; Trackers). The
          validity and expiration periods of Cookies and other similar Trackers may vary depending
          on the lifetime set by BoostMySkills or the relevant provider; some of them expire upon
          termination of the User&rsquo;s browsing session.
        </p>

        <h2>What type of cookies are used on this Website and for what purpose?</h2>
        <p>This Website uses its own and third-party cookies:</p>
        <ul>
          <li>
            <strong>Own cookies:</strong> those that are sent to the user&rsquo;s terminal equipment
            from a computer or domain managed by the website Owner and from which the service
            requested by the user is provided.
          </li>
          <li>
            <strong>Third-party cookies:</strong> those that are sent to the user&rsquo;s terminal
            equipment from a computer or domain that is not managed by the publisher, but by another
            entity that processes the data obtained through cookies.
          </li>
        </ul>
        <p>This Website uses the following cookies for the purposes described below:</p>
        <ul>
          <li>
            <strong>Technical:</strong> cookies used by BoostMySkills and, where appropriate, by
            third parties, which allow the user to browse the Site and use its services — including
            the identification of sessions, traffic, security during navigation and the storage of
            content for dissemination (such as videos or sharing through social networks). These
            cookies are necessary.
          </li>
          <li>
            <strong>Analytics:</strong> cookies used by the Owner and by third parties, which allow
            the number of users who visit the Site to be quantified and statistical measurement and
            analysis of how users use the content and services to be performed, in order to improve
            the offer and structure of the Website.
          </li>
          <li>
            <strong>External social networks:</strong> cookies used by the owners of social networks
            to interact with the platforms (e.g. YouTube, LinkedIn or others) configured on this
            Website and/or by the user&rsquo;s own accounts on those networks.
          </li>
        </ul>

        <h2>Who uses cookies on this Website?</h2>
        <p>The following entities use the cookies described below for these purposes:</p>
        <ul>
          <li>
            <strong>BoostMySkills</strong> — Type or function: Technical. Server:
            https://boostmyskills.eu/. These cookies are necessary and are therefore excluded from
            the duty to obtain the user&rsquo;s consent.
          </li>
          <li>
            <strong>LinkedIn</strong> — Type or function: External social networks. Server:
            http://www.linkedin.com. These cookies are not excluded from the duty to obtain consent,
            so the user must authorise their use.
          </li>
        </ul>

        <h2>How are the cookies on this Website accepted, rejected, revoked, or limited?</h2>
        <p>
          Through the different options included in the cookie notice that is displayed when
          accessing this Website for the first time, the user can accept or reject the use of
          cookies on this Site and the international transfer of their data. For these purposes:
        </p>
        <ul>
          <li>
            <strong>To accept all cookies:</strong> click on the ACCEPT COOKIES button.
          </li>
          <li>
            <strong>To configure cookies:</strong> click on the CONFIGURE button to access the types
            of cookies that can be accepted or rejected. Necessary cookies cannot be rejected.
          </li>
          <li>
            <strong>Transfers:</strong> by accepting cookies from Google, Inc., the user also
            accepts the international transfer of their personal data to the United States, as
            reported in the following section.
          </li>
          <li>
            <strong>To revoke the consent granted:</strong> the cookies must be eliminated via your
            browser settings.
          </li>
        </ul>
        <p>
          Users can find information about how to manage Cookies in the most commonly used browsers
          — Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Internet Explorer, Microsoft
          Edge and Brave — at each browser&rsquo;s official website.
        </p>

        <h2>Are international data transfers made from this Website?</h2>
        <p>
          Yes. Google, Inc. carries out international transfers of data derived from cookies from
          this Website to the United States, based on the user&rsquo;s consent when accepting
          cookies by clicking the ACCEPT COOKIES button. When the user has accepted the use of
          cookies, they consent to their data — collected through the loading and reading of cookies
          — being transferred to the United States, a country that currently does not offer an
          adequate level of protection according to the European Commission.
        </p>
        <p>
          If the user does not consent to this international transfer of their data to the United
          States, then when accessing this Website for the first time and viewing the cookie notice,
          they must press the CONFIGURATION button to access the types of cookies that can be
          accepted or rejected. If cookies are rejected, the functionalities or services offered
          through the use of these cookies will not be provided or obtained.
        </p>
      </div>
    </StaticPage>
  );
}
