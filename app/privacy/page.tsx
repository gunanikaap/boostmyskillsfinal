import StaticPage from "@/components/StaticPage";
export const metadata = { title: "Privacy policy" };
export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy policy">
      <p>
        We process the personal data required to operate learning accounts, enrolments, progress and
        certification. Authentication is handled by Clerk; learning records are stored in our
        application database. This UAT policy is provisional pending final legal review.
      </p>
    </StaticPage>
  );
}
