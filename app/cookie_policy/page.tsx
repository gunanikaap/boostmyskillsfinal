import StaticPage from "@/components/StaticPage";
export const metadata = { title: "Cookie policy" };
export default function CookiePolicyPage() {
  return (
    <StaticPage title="Cookie policy">
      <p>
        We use strictly necessary cookies for authentication and session management. This UAT policy
        is provisional pending final legal review.
      </p>
    </StaticPage>
  );
}
