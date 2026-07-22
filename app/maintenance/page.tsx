import Image from "next/image";
import { getMaintenance } from "@/lib/settings/maintenance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const m = await getMaintenance();
  return (
    <main className="mnt-page">
      <div className="mnt-page__card">
        <Image
          src="/brand/logo.png"
          alt="BoostMySkills"
          width={150}
          height={72}
          priority
          style={{ height: 54, width: "auto" }}
        />
        <span className="mnt-page__icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <path
              d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.6 2.6-2.1-.5-.5-2.1 2.2-2.5z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h1>We&rsquo;ll be right back</h1>
        <p className="mnt-page__msg">{m.maintenanceMessage}</p>
        <p className="mnt-page__hint">Thanks for your patience — please check back shortly.</p>
      </div>
    </main>
  );
}
