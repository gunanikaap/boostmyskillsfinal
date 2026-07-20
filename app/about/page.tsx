import StaticPage from "@/components/StaticPage";
export const metadata = { title: "About" };
export default function AboutPage() {
  return (
    <StaticPage title="About BoostMySkills">
      <p>
        BoostMySkills delivers micro-credentials and micro-programmes for sustainability skills,
        built with partner organisations. Learners complete short, assessed units and earn
        verifiable credentials.
      </p>
      <p style={{ color: "var(--bms-muted)" }}>
        This is a UAT build. Content shown here reflects published catalogue entries only.
      </p>
    </StaticPage>
  );
}
