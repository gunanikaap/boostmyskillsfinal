import { notFound } from "next/navigation";
import Link from "next/link";
import { adminGetProgramme } from "@/lib/admin/queries";
import { MembershipEditor } from "./MembershipEditor";
import { ProgrammeDetailsEditor } from "./ProgrammeDetailsEditor";

export const dynamic = "force-dynamic";

export default async function AdminProgrammeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await adminGetProgramme(id);
  if (!detail) notFound();

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <p style={{ color: "var(--bms-muted)", margin: 0 }}>
          {detail.projectName} · <Link href="/admin/programmes">all programmes</Link>
        </p>
        <h1 style={{ margin: "4px 0" }}>{detail.title}</h1>
        <p style={{ color: "var(--bms-muted)", margin: 0 }}>
          Ordered credential membership. Hiding does not change each credential&apos;s own status.
        </p>
      </div>
      <ProgrammeDetailsEditor detail={detail} />
      <MembershipEditor detail={detail} />
    </div>
  );
}
