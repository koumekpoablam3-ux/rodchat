import type { Metadata } from "next";
import JoinGroup from "@/components/JoinGroup";

export const metadata: Metadata = { title: "Rejoindre un groupe" };

export default function JoinPage({ params }: { params: { token: string } }) {
  return <JoinGroup token={params.token} />;
}
